"""
main.py — FastAPI entry point.

Upload flow:
  Step 1 — POST /video/init        → generate video_id, store in MongoDB
  Step 2 — POST /video/{id}/meta   → save headline / channel / ticker to MongoDB
  Step 3 — POST /video/{id}/upload → accept the file, enqueue Celery task
             Celery → ffmpeg_utils → FFmpeg reads overlay from MongoDB → MP4

One-shot endpoint:
  POST  /video/upload-full          → init + meta + upload in a single request

Extra endpoints:
  GET   /status/{task_id}           — Celery task status
  GET   /video/{video_id}           — full MongoDB document
  GET   /video/{video_id}/urls      — playback URLs
  PATCH /video/{video_id}/overlay   — update overlay text before processing
  GET   /stream/key                 — generate RTMP stream key
  GET   /health
"""

import os
import re
import uuid
from datetime import datetime

from fastapi import FastAPI, Form, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from celery.result import AsyncResult
from pydantic import BaseModel

from tasks import process_video_task, celery
from mongo_model import (
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

# /uploads is an absolute path — works correctly both inside and outside Docker.
# Override via UPLOAD_DIR env var if needed.
UPLOAD_DIR    = os.getenv("UPLOAD_DIR",     "uploads")
MEDIA_BASE    = os.getenv("MEDIA_BASE_URL", "http://localhost:8000")
RTMP_BASE     = os.getenv("RTMP_BASE",      "rtmp://localhost/live")
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 500 * 1024 * 1024))  # 500 MB

os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_filename(filename: str) -> str:
    """
    Sanitize uploaded filename:
      - Keep only the basename (strip any directory components)
      - Replace spaces and unsafe chars with underscores
      - Fall back to 'upload.mp4' if nothing remains
    """
    name = os.path.basename(filename or "upload.mp4")
    name = re.sub(r"[^\w.\-]", "_", name)
    return name or "upload.mp4"


def _build_path(video_id: str, filename: str) -> str:
    """
    Return a guaranteed absolute path for the uploaded file.
    Example: /uploads/abc-123_myvideo.mp4
    """
    safe = _safe_filename(filename)
    return os.path.abspath(os.path.join(UPLOAD_DIR, f"{video_id}_{safe}"))


async def _save_upload(file: UploadFile, dest_path: str) -> int:
    """
    Stream-write an UploadFile to dest_path in 1 MB chunks.
    Returns bytes written. Raises HTTPException on overflow or I/O error.
    File is fully flushed and fsync'd to disk before returning.
    """
    size = 0
    try:
        with open(dest_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break                          # upload fully received
                size += len(chunk)
                if size > MAX_FILE_SIZE:
                    raise HTTPException(400, "File exceeds 500 MB limit.")
                f.write(chunk)
            f.flush()
            os.fsync(f.fileno())                   # guarantee written to disk
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


# ── Step 1: Create video ID ───────────────────────────────────────────────────

@app.post("/video/init")
def init_video():
    """Generate a new video_id and create a bare MongoDB document (status=queued)."""
    video = create_video(filename="pending")
    return {
        "video_id": video["id"],
        "status":   video["status"],
        "message":  "Video ID created. POST metadata to /video/{id}/meta next.",
    }


# ── Step 2: Save overlay metadata ─────────────────────────────────────────────

@app.post("/video/{video_id}/meta")
def set_video_meta(video_id: str, body: VideoMetaRequest):
    """
    Store overlay text (channel, headline, ticker, badge) against the video_id.
    Call this BEFORE uploading the file.
    """
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
        "message":  "Metadata saved. POST the video file to /video/{id}/upload next.",
    }


# ── Step 3: Upload file and enqueue task ──────────────────────────────────────

@app.post("/video/{video_id}/upload")
async def upload_video(video_id: str, file: UploadFile = File(...)):
    """
    Accept the video file, save to disk, and enqueue Celery task.
    The worker reads overlay config from MongoDB at processing time.
    """
    video = get_video(video_id)
    if not video:
        raise HTTPException(404, "Video not found. Call /video/init first.")

    if not (file.content_type or "").startswith("video/"):
        raise HTTPException(400, "Only video files are accepted.")

    # Build absolute path — Celery worker receives this exact string
    local_path = _build_path(video_id, file.filename or "upload.mp4")
    safe_name  = os.path.basename(local_path)

    # Fully write + fsync file to disk BEFORE queuing task
    size = await _save_upload(file, local_path)

    # Extra guard — verify file is actually on disk
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


# ── One-shot: init + meta + upload in a single request ───────────────────────

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
    """
    One-shot endpoint: create video record, save overlay metadata,
    upload the file, and enqueue the Celery processing task — all at once.

    Use multipart/form-data:
      file          — video file (required)
      title         — optional display title
      channel_name  — overlay channel name   (default: NEWS 24)
      headline      — overlay headline text  (default: BREAKING NEWS)
      ticker        — bottom ticker text     (default: Stay tuned for updates)
      badge_text    — badge label            (default: BREAKING)
      enabled       — show overlay at all    (default: true)
    """
    if not (file.content_type or "").startswith("video/"):
        raise HTTPException(400, "Only video files are accepted.")

    # ── 1. Create MongoDB document — video_id is single source of truth ───────
    video_doc = create_video(filename=file.filename or "upload.mp4")
    video_id  = video_doc["id"]

    # ── 2. Build absolute path ────────────────────────────────────────────────
    local_path = _build_path(video_id, file.filename or "upload.mp4")
    safe_name  = os.path.basename(local_path)

    # ── 3. Fully stream + fsync file to disk BEFORE queuing ───────────────────
    size = await _save_upload(file, local_path)

    # ── 4. Verify file is on disk ─────────────────────────────────────────────
    if not os.path.exists(local_path):
        update_video_status(video_id, VideoStatus.FAILED, "File write verification failed")
        raise HTTPException(500, f"File write failed — not found at {local_path}")

    # ── 5. Persist overlay + file metadata ────────────────────────────────────
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

    # ── 6. Enqueue Celery task ────────────────────────────────────────────────
    try:
        task = process_video_task.delay(video_id, local_path)
    except Exception as exc:
        update_video_status(video_id, VideoStatus.FAILED, str(exc))
        raise HTTPException(500, f"Queue error: {exc}") from exc

    # ── 7. Persist task_id ────────────────────────────────────────────────────
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
    """Update overlay text at any time before processing starts."""
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
        "urls": {
            "mp4": f"{MEDIA_BASE}/{mp4_path}",
        },
    }


# ── Live stream ───────────────────────────────────────────────────────────────

@app.get("/stream/key")
def get_stream_key():
    stream_key = str(uuid.uuid4()).replace("-", "")
    return {
        "rtmp_url":   f"{RTMP_BASE}/{stream_key}",
        "stream_key": stream_key,
    }


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}