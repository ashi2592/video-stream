"""
main.py — FastAPI entry point (updated with working RTMP/HLS support).

RTMP flow:
  1. Client calls  GET /stream/key          → gets stream_key + rtmp_url + hls_url
  2. OBS / FFmpeg  pushes to               rtmp://host:1935/live/{stream_key}
  3. nginx-rtmp    writes HLS segments to  /tmp/hls/{stream_key}/index.m3u8
  4. Browser       plays                   http://host:8080/live/{stream_key}/index.m3u8

Active stream check:
  GET /stream/active  — returns all currently live stream keys by parsing nginx stat XML
"""

import os
import re
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime

import httpx
from fastapi import FastAPI, Form, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from celery.result import AsyncResult
from pydantic import BaseModel

from utils.tasks import process_video_task, celery
from database.mongo_model import (
    create_video,
    get_video,
    update_video_overlay,
    update_video_status,
    videos_collection,
    VideoStatus,
)

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Video Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Config ────────────────────────────────────────────────────────────────────

UPLOAD_DIR    = os.getenv("UPLOAD_DIR",     "uploads")
MEDIA_BASE    = os.getenv("MEDIA_BASE_URL", "http://localhost:8000")
RTMP_BASE     = os.getenv("RTMP_BASE",      "rtmp://localhost:1935/live")
HLS_BASE_URL  = os.getenv("HLS_BASE_URL",   "http://localhost:8080/live")
NGINX_STAT    = os.getenv("NGINX_STAT_URL", "http://rtmp:8080/stat")   # internal Docker URL
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 500 * 1024 * 1024))

os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_filename(filename: str) -> str:
    name = os.path.basename(filename or "upload.mp4")
    name = re.sub(r"[^\w.\-]", "_", name)
    return name or "upload.mp4"


def _build_path(video_id: str, filename: str) -> str:
    safe = _safe_filename(filename)
    return os.path.abspath(os.path.join(UPLOAD_DIR, f"{video_id}_{safe}"))


async def _save_upload(file: UploadFile, dest_path: str) -> int:
    size = 0
    try:
        with open(dest_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_FILE_SIZE:
                    raise HTTPException(400, "File exceeds 500 MB limit.")
                f.write(chunk)
            f.flush()
            os.fsync(f.fileno())
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"File save failed: {exc}") from exc
    return size


# ── Schemas ───────────────────────────────────────────────────────────────────

class VideoMetaRequest(BaseModel):
    title:        str | None = None
    channel_name: str | None = None
    headline:     str | None = None
    ticker:       str | None = None
    badge_text:   str | None = None
    enabled:      bool | None = None


class OverlayUpdateRequest(BaseModel):
    channel_name: str | None = None
    headline:     str | None = None
    ticker:       str | None = None
    badge_text:   str | None = None
    enabled:      bool | None = None


# ── Step 1 ────────────────────────────────────────────────────────────────────

@app.post("/video/init")
def init_video():
    video = create_video(filename="pending")
    return {
        "video_id": video["id"],
        "status":   video["status"],
        "message":  "Video ID created. POST metadata to /video/{id}/meta next.",
    }


# ── Step 2 ────────────────────────────────────────────────────────────────────

@app.post("/video/{video_id}/meta")
def set_video_meta(video_id: str, body: VideoMetaRequest):
    video = get_video(video_id)
    if not video:
        raise HTTPException(404, "Video not found. Call /video/init first.")

    overlay_patch: dict = {}
    if body.channel_name is not None: overlay_patch["channel_name"] = body.channel_name
    if body.headline     is not None: overlay_patch["headline"]     = body.headline
    if body.ticker       is not None: overlay_patch["ticker"]       = body.ticker
    if body.badge_text   is not None: overlay_patch["badge_text"]   = body.badge_text
    if body.enabled      is not None: overlay_patch["enabled"]      = body.enabled

    updated = update_video_overlay(video_id, overlay_patch) if overlay_patch else video

    if body.title:
        videos_collection.update_one(
            {"id": video_id},
            {"$set": {"title": body.title, "updated_at": datetime.utcnow()}},
        )

    return {
        "video_id": video_id,
        "overlay":  (updated or video).get("overlay"),
        "message":  "Metadata saved.",
    }


# ── Step 3 ────────────────────────────────────────────────────────────────────

@app.post("/video/{video_id}/upload")
async def upload_video(video_id: str, file: UploadFile = File(...)):
    video = get_video(video_id)
    if not video:
        raise HTTPException(404, "Video not found.")

    if not (file.content_type or "").startswith("video/"):
        raise HTTPException(400, "Only video files are accepted.")

    local_path = _build_path(video_id, file.filename or "upload.mp4")
    safe_name  = os.path.basename(local_path)
    size = await _save_upload(file, local_path)

    if not os.path.exists(local_path):
        raise HTTPException(500, f"File write failed — not found at {local_path}")

    videos_collection.update_one(
        {"id": video_id},
        {"$set": {
            "filename":   safe_name,
            "input_path": local_path,
            "size_bytes": size,
            "status":     VideoStatus.QUEUED,
            "updated_at": datetime.utcnow(),
        }},
    )

    try:
        task = process_video_task.delay(video_id, local_path)
    except Exception as exc:
        raise HTTPException(500, f"Queue error: {exc}") from exc

    videos_collection.update_one(
        {"id": video_id},
        {"$set": {"task_id": task.id, "updated_at": datetime.utcnow()}},
    )

    return {
        "video_id":   video_id,
        "task_id":    task.id,
        "status":     "queued",
        "size_bytes": size,
        "input_path": local_path,
        "overlay":    video.get("overlay"),
        "message":    "File received and queued for processing.",
    }


# ── One-shot ──────────────────────────────────────────────────────────────────

@app.post("/video/upload-full")
async def upload_full_video(
    file:         UploadFile = File(...),
    title:        str  = Form(None),
    channel_name: str  = Form("NEWS 24"),
    headline:     str  = Form("BREAKING NEWS"),
    ticker:       str  = Form("Stay tuned for updates"),
    badge_text:   str  = Form("BREAKING"),
    enabled:      bool = Form(True),
):
    if not (file.content_type or "").startswith("video/"):
        raise HTTPException(400, "Only video files are accepted.")

    video_doc = create_video(filename=file.filename or "upload.mp4")
    video_id  = video_doc["id"]
    local_path = _build_path(video_id, file.filename or "upload.mp4")
    safe_name  = os.path.basename(local_path)
    size = await _save_upload(file, local_path)

    if not os.path.exists(local_path):
        update_video_status(video_id, VideoStatus.FAILED, "File write verification failed")
        raise HTTPException(500, f"File write failed — not found at {local_path}")

    overlay = {
        "channel_name": channel_name,
        "headline":     headline,
        "ticker":       ticker,
        "badge_text":   badge_text,
        "enabled":      enabled,
    }
    update_video_overlay(video_id, overlay)

    videos_collection.update_one(
        {"id": video_id},
        {"$set": {
            "filename":   safe_name,
            "input_path": local_path,
            "size_bytes": size,
            "status":     VideoStatus.QUEUED,
            "updated_at": datetime.utcnow(),
            **({"title": title} if title else {}),
        }},
    )

    try:
        task = process_video_task.delay(video_id, local_path)
    except Exception as exc:
        update_video_status(video_id, VideoStatus.FAILED, str(exc))
        raise HTTPException(500, f"Queue error: {exc}") from exc

    videos_collection.update_one(
        {"id": video_id},
        {"$set": {"task_id": task.id, "updated_at": datetime.utcnow()}},
    )

    return {
        "video_id":   video_id,
        "task_id":    task.id,
        "status":     "queued",
        "size_bytes": size,
        "input_path": local_path,
        "overlay":    overlay,
        "message":    "Uploaded and processing started.",
    }


# ── Overlay patch ─────────────────────────────────────────────────────────────

@app.patch("/video/{video_id}/overlay")
def patch_overlay(video_id: str, body: OverlayUpdateRequest):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No overlay fields supplied.")
    updated = update_video_overlay(video_id, updates)
    if not updated:
        raise HTTPException(404, "Video not found.")
    return {"video_id": video_id, "overlay": updated.get("overlay")}


# ── Status / playback ─────────────────────────────────────────────────────────

@app.get("/status/{task_id}")
def get_task_status(task_id: str):
    result = AsyncResult(task_id, app=celery)
    return {
        "task_id": task_id,
        "status":  result.status,
        "result":  result.result if result.ready() else None,
    }


@app.get("/video/{video_id}")
def get_video_doc(video_id: str):
    video = get_video(video_id)
    if not video:
        raise HTTPException(404, "Video not found.")
    return video


@app.get("/video/{video_id}/urls")
def get_video_urls(video_id: str):
    video = get_video(video_id)
    if not video:
        raise HTTPException(404, "Video not found.")
    mp4_path = (video.get("paths") or {}).get("mp4", "")
    return {
        "video_id": video_id,
        "urls": {"mp4": f"{MEDIA_BASE}/{mp4_path}"},
    }


# ── Live stream ───────────────────────────────────────────────────────────────

@app.get("/stream/key")
def get_stream_key():
    """
    Generate a unique RTMP stream key.

    Returns:
      rtmp_url  — push destination for OBS / FFmpeg
      hls_url   — browser playback URL (.m3u8) served by nginx-rtmp
      stream_key
    """
    stream_key = str(uuid.uuid4()).replace("-", "")
    return {
        "stream_key": stream_key,
        # Push URL — external clients use the public host, not the Docker alias
        "rtmp_url":   f"rtmp://localhost:1935/live/{stream_key}",
        # HLS playback URL — served by nginx on port 8080
        "hls_url":    f"{HLS_BASE_URL}/{stream_key}/index.m3u8",
        "instructions": {
            "obs":    f"Settings → Stream → Custom RTMP → Server: rtmp://localhost:1935/live  Key: {stream_key}",
            "ffmpeg": f"ffmpeg -re -i input.mp4 -c copy -f flv rtmp://localhost:1935/live/{stream_key}",
        },
    }


@app.get("/stream/active")
async def get_active_streams():
    """
    Query nginx-rtmp stat endpoint and return all currently live stream keys.
    Useful for the frontend to know if a stream is actually broadcasting.
    """
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(NGINX_STAT)
        root = ET.fromstring(r.text)

        streams = []
        for stream in root.findall(".//stream"):
            name_el = stream.find("name")
            if name_el is None:
                continue
            key = name_el.text or ""
            bw_el    = stream.find("bw_video")
            nclients = stream.find("nclients")
            streams.append({
                "stream_key": key,
                "hls_url":    f"{HLS_BASE_URL}/{key}/index.m3u8",
                "rtmp_url":   f"rtmp://localhost:1935/live/{key}",
                "bw_kbps":    int(bw_el.text or 0) // 1000 if bw_el is not None else 0,
                "viewers":    int(nclients.text or 0) if nclients is not None else 0,
            })
        return {"active": streams, "count": len(streams)}

    except httpx.RequestError as e:
        # nginx not reachable — return empty rather than 500
        return {"active": [], "count": 0, "warning": f"nginx-rtmp stat unreachable: {e}"}
    except ET.ParseError:
        return {"active": [], "count": 0, "warning": "Could not parse nginx stat XML"}


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}