
from datetime import datetime
from fastapi import HTTPException
import os
from fastapi import APIRouter, Request, UploadFile, Form
from fastapi.params import File
from config.config import UPLOAD_DIR, OUTPUT_DIR, MEDIA_BASE, REDIS_URL
from utils.schema import VideoMetaRequest
from utils.helper import _build_path, _save_upload
from utils.schema import OverlayUpdateRequest, VideoMetaRequest
from tasks import process_video_task, celery
from utils.mongo_model import (
    create_video,
    get_video,
    update_video_overlay,
    update_video_status,
    videos_collection,
    VideoStatus,
)
from celery.result import AsyncResult
os.makedirs(UPLOAD_DIR, exist_ok=True)


router = APIRouter(prefix="/video", tags=["Video Management"])


def prepare_output_dirs(video_id: str):
    base = os.path.join(OUTPUT_DIR, video_id)
    os.makedirs(os.path.join(base, "mp4"), exist_ok=True)
    os.makedirs(os.path.join(base, "hls"), exist_ok=True)


@router.post("/init")
def init_video():
    video = create_video(filename="pending")
    return {
        "video_id": video["id"],
        "status":   video["status"],
        "message":  "Video ID created. POST metadata to /video/{id}/meta next.",
    }


# ── Step 2 ────────────────────────────────────────────────────────────────────

@router.post("/{video_id}/meta")
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

@router.post("/{video_id}/upload")
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
        prepare_output_dirs(video_id)
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

@router.post("/upload-full")
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
        prepare_output_dirs(video_id)
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

@router.patch("/{video_id}/overlay")
def patch_overlay(video_id: str, body: OverlayUpdateRequest):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No overlay fields supplied.")
    updated = update_video_overlay(video_id, updates)
    if not updated:
        raise HTTPException(404, "Video not found.")
    return {"video_id": video_id, "overlay": updated.get("overlay")}


# ── Status / playback ─────────────────────────────────────────────────────────

@router.get("/status/{task_id}")
def get_task_status(task_id: str):
    result = AsyncResult(task_id, app=celery)
    return {
        "task_id": task_id,
        "status":  result.status,
        "result":  result.result if result.ready() else None,
    }


@router.get("/{video_id}")
def get_video_doc(video_id: str):
    video = get_video(video_id)
    if not video:
        raise HTTPException(404, "Video not found.")
    return video


@router.get("/{video_id}/urls")
def get_video_urls(video_id: str):
    video = get_video(video_id)
    if not video:
        raise HTTPException(404, "Video not found.")

    paths = video.get("paths") or {}

    return {
        "video_id": video_id,
        "status":   video.get("status"),
        "urls": {
            "mp4": f"{MEDIA_BASE}/{paths['mp4']}" if paths.get("mp4") else None,
            "hls": f"{MEDIA_BASE}/{paths['hls']}" if paths.get("hls") else None,
        },
    }