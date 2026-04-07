from datetime import datetime
from fastapi import HTTPException
import os
from fastapi import APIRouter, UploadFile, Form
from fastapi.params import File
from config.config import UPLOAD_DIR, OUTPUT_DIR, REDIS_URL
from utils.schema import VideoMetaRequest, OverlayUpdateRequest
from utils.helper import _build_path, _save_upload
from tasks import process_video_task, celery
from utils.mongo_model import (
    create_video,
    get_video,
    update_video_overlay,
    update_video_status,
    videos_collection,
    VideoStatus,
    list_videos,
)
from utils.azure_storage import generate_sas_url
from celery.result import AsyncResult

os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/video", tags=["Video Management"])


def prepare_output_dirs(video_id: str):
    base = os.path.join(OUTPUT_DIR, video_id)
    os.makedirs(os.path.join(base, "mp4"), exist_ok=True)
    os.makedirs(os.path.join(base, "hls"), exist_ok=True)


def serialize_video(video):
    return {
        "id":         video.get("id"),
        "title":      video.get("title"),
        "status":     video.get("status"),
        "created_at": video.get("created_at"),
        "overlay":    video.get("overlay"),
    }


# ── Init ──────────────────────────────────────────────────────────────────────

@router.post("/init")
def init_video():
    video = create_video(filename="pending")
    return {
        "video_id": video["id"],
        "status":   video["status"],
        "message":  "Video ID created. POST metadata to /video/{id}/meta next.",
    }


# ── List all ──────────────────────────────────────────────────────────────────

@router.get("/")
def get_all_videos():
    videos = [serialize_video(v) for v in list_videos()]
    return {"count": len(videos), "videos": videos}


# ── Meta (single, canonical definition) ──────────────────────────────────────

@router.post("/{video_id}/meta")
def set_video_meta(video_id: str, body: VideoMetaRequest):
    """
    Set/update overlay config, title, and any SEO fields for a video.
    Safe to call multiple times — only supplied fields are updated.
    """
    video = get_video(video_id)
    if not video:
        raise HTTPException(404, "Video not found. Call /video/init first.")

    # ── Overlay fields ────────────────────────────────────────────────────────
    overlay_patch: dict = {}
    if body.channel_name is not None: overlay_patch["channel_name"] = body.channel_name
    if body.headline     is not None: overlay_patch["headline"]     = body.headline
    if body.ticker       is not None: overlay_patch["ticker"]       = body.ticker
    if body.badge_text   is not None: overlay_patch["badge_text"]   = body.badge_text
    if body.enabled      is not None: overlay_patch["enabled"]      = body.enabled

    updated = update_video_overlay(video_id, overlay_patch) if overlay_patch else video

    # ── Top-level fields ──────────────────────────────────────────────────────
    top_level: dict = {"updated_at": datetime.utcnow()}
    if body.title is not None:
        top_level["title"] = body.title

    if len(top_level) > 1:  # more than just updated_at
        videos_collection.update_one({"id": video_id}, {"$set": top_level})

    return {
        "video_id": video_id,
        "overlay":  (updated or video).get("overlay"),
        "message":  "Metadata saved.",
    }


# ── Upload (step-by-step flow) ────────────────────────────────────────────────

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
        "overlay":    video.get("overlay"),
        "message":    "File received and queued for processing.",
    }


# ── One-shot upload ───────────────────────────────────────────────────────────

@router.post("/upload-full")
async def upload_full_video(
    file:              UploadFile = File(...),
    user_id:           str  = Form(...),                    # required
    title:             str  = Form(None),
    description:       str  = Form(None),
    short_description: str  = Form(None),
    hashtags:          str  = Form(None),                   # comma-separated, e.g. "news,breaking,world"
    channel_name:      str  = Form("NEWS 24"),
    headline:          str  = Form("BREAKING NEWS"),
    ticker:            str  = Form("Stay tuned for updates"),
    badge_text:        str  = Form("BREAKING"),
    enabled:           bool = Form(True),
):
    if not (file.content_type or "").startswith("video/"):
        raise HTTPException(400, "Only video files are accepted.")

    # Parse hashtags from comma-separated string → list
    hashtag_list: list[str] = (
        [tag.strip().lstrip("#") for tag in hashtags.split(",") if tag.strip()]
        if hashtags else []
    )

    video_doc  = create_video(filename=file.filename or "upload.mp4")
    video_id   = video_doc["id"]
    local_path = _build_path(video_id, file.filename or "upload.mp4")
    safe_name  = os.path.basename(local_path)
    size       = await _save_upload(file, local_path)

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
            "filename":          safe_name,
            "input_path":        local_path,
            "size_bytes":        size,
            "status":            VideoStatus.QUEUED,
            "updated_at":        datetime.utcnow(),
            "user_id":           user_id,
            "hashtags":          hashtag_list,
            **({"title":             title}             if title             else {}),
            **({"description":       description}       if description       else {}),
            **({"short_description": short_description} if short_description else {}),
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
        "video_id":          video_id,
        "task_id":           task.id,
        "status":            "queued",
        "size_bytes":        size,
        "overlay":           overlay,
        "user_id":           user_id,
        "title":             title,
        "description":       description,
        "short_description": short_description,
        "hashtags":          hashtag_list,
        "message":           "Uploaded and processing started.",
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


# ── Task status ───────────────────────────────────────────────────────────────

@router.get("/status/{task_id}")
def get_task_status(task_id: str):
    result = AsyncResult(task_id, app=celery)
    return {
        "task_id": task_id,
        "status":  result.status,
        "result":  result.result if result.ready() else None,
    }


# ── Single video doc ──────────────────────────────────────────────────────────

@router.get("/{video_id}")
def get_video_doc(video_id: str):
    video = get_video(video_id)
    if not video:
        raise HTTPException(404, "Video not found.")
    return video


# ── Playback URLs ─────────────────────────────────────────────────────────────

@router.get("/{video_id}/urls")
def get_video_urls(video_id: str, expiry: int = 3600):
    video = get_video(video_id)
    if not video:
        raise HTTPException(404, "Video not found.")

    status = video.get("status")

    if status != VideoStatus.READY:
        return {
            "video_id": video_id,
            "status":   status,
            "urls":     {"hls": None, "mp4": None},
            "message":  f"Video is {status}, URLs available once processing completes.",
        }

    mp4_blob = f"{video_id}/mp4/output.mp4"
    hls_blob = f"{video_id}/hls/master.m3u8"

    mp4_url = generate_sas_url(mp4_blob, expiry_seconds=expiry)
    hls_url = generate_sas_url(hls_blob, expiry_seconds=expiry)

    if not hls_url and not mp4_url:
        raise HTTPException(500, "Could not generate playback URLs. Check Azure credentials.")

    return {
        "video_id": video_id,
        "status":   status,
        "urls": {
            "hls": hls_url,
            "mp4": mp4_url,
        },
    }