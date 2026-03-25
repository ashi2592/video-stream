from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from celery.result import AsyncResult
import uuid
import os

from tasks import process_video_task
from s3_utils import generate_presigned_url
from models_pymongo import create_video, get_video

# ── APP INIT ───────────────────────────────────────────────

app = FastAPI(title="Video Platform API")

# CORS (restrict in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── CONFIG ───────────────────────────────────────────────

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/data/uploads")
RTMP_BASE = os.getenv("RTMP_BASE", "rtmp://localhost/live")
HLS_BASE  = os.getenv("HLS_BASE", "http://localhost/hls")

MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 500 * 1024 * 1024))  # 500MB

os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── UPLOAD VIDEO ───────────────────────────────────────────

@app.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    if not file.content_type.startswith("video/"):
        raise HTTPException(400, "Only video files are accepted.")

    # Create DB entry
    video = create_video(filename=file.filename)
    video_id = video["id"]

    # Secure filename
    safe_filename = os.path.basename(file.filename)
    local_path = f"{UPLOAD_DIR}/{video_id}_{safe_filename}"

    # Save file with size protection
    size = 0
    try:
        with open(local_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                size += len(chunk)
                if size > MAX_FILE_SIZE:
                    raise HTTPException(400, "File too large")
                f.write(chunk)
    except Exception as e:
        raise HTTPException(500, f"File upload failed: {str(e)}")

    # Send to Celery
    try:
        task = process_video_task.delay(video_id, local_path)
    except Exception as e:
        raise HTTPException(500, f"Queue error: {str(e)}")

    return {
        "video_id": video_id,
        "task_id": task.id,
        "status": "queued",
        "message": "Video uploaded and queued for processing"
    }


# ── TASK STATUS (CELERY) ───────────────────────────────────

@app.get("/status/{task_id}")
def get_task_status(task_id: str):
    result = AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None,
    }


# ── VIDEO STATUS (MONGO - PRIMARY) ─────────────────────────

@app.get("/video/{video_id}")
def get_video_status(video_id: str):
    video = get_video(video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    return video


# ── PLAYBACK URLS ─────────────────────────────────────────

@app.get("/video/{video_id}/urls")
def get_video_urls(video_id: str):
    formats = {
        "hls":  f"{video_id}/hls/master.m3u8",
        "mp4":  f"{video_id}/mp4/output.mp4",
        "webm": f"{video_id}/webm/output.webm",
    }

    try:
        urls = {fmt: generate_presigned_url(key) for fmt, key in formats.items()}
    except Exception as e:
        raise HTTPException(500, f"URL generation failed: {str(e)}")

    return {
        "video_id": video_id,
        "urls": urls
    }


# ── LIVE STREAM KEY ───────────────────────────────────────

@app.get("/stream/key")
def get_stream_key():
    stream_key = str(uuid.uuid4()).replace("-", "")

    return {
        "rtmp_url": f"{RTMP_BASE}/{stream_key}",
        "playback_url": f"{HLS_BASE}/{stream_key}.m3u8",
        "stream_key": stream_key,
    }


# ── HEALTH CHECK ──────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}