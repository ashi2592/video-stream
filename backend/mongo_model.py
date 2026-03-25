from datetime import datetime
from pymongo import MongoClient
import uuid
import os
from dotenv import load_dotenv

load_dotenv()

# ── DB Connection ───────────────────────────────────────────────

client = MongoClient("mongodb://root:password@localhost:27017/")
db = client["video_platform"]

videos_collection = db["videos"]
livestreams_collection = db["live_streams"]


# ── INDEXES (RUN ON STARTUP) ─────────────────────────────────────

# videos_collection.create_index("id", unique=True)
# videos_collection.create_index("status")
# videos_collection.create_index("created_at")

# livestreams_collection.create_index("stream_key", unique=True)


# ── ENUM ────────────────────────────────────────────────────────

class VideoStatus:
    QUEUED     = "queued"
    PROCESSING = "processing"
    UPLOADING  = "uploading"
    READY      = "ready"
    FAILED     = "failed"


# ── VIDEO OPERATIONS ────────────────────────────────────────────
def create_video(filename, title=None, size_bytes=None):
    video = {
        "id": str(uuid.uuid4()),
        "filename": filename,
        "title": title,
        "status": VideoStatus.QUEUED,
        "task_id": None,
        "duration": None,
        "size_bytes": size_bytes,
        "paths": {
            "mp4": None,
            "hls": None,
            "webm": None
        },
        "error_msg": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    videos_collection.insert_one(video)
    return video


def get_video(video_id):
    return videos_collection.find_one({"id": video_id}, {"_id": 0})


def update_video_status(video_id, status, error_msg=None):
    update_data = {
        "status": status,
        "updated_at": datetime.utcnow()
    }

    if error_msg:
        update_data["error_msg"] = error_msg

    videos_collection.update_one(
        {"id": video_id},
        {"$set": update_data}
    )


def update_video_metadata(video_id, duration=None, size_bytes=None):
    update_data = {"updated_at": datetime.utcnow()}

    if duration is not None:
        update_data["duration"] = duration
    if size_bytes is not None:
        update_data["size_bytes"] = size_bytes

    videos_collection.update_one(
        {"id": video_id},
        {"$set": update_data}
    )


def list_videos():
    return list(videos_collection.find({}, {"_id": 0}))


# ── LIVE STREAM OPERATIONS ──────────────────────────────────────

def create_stream(title):
    stream = {
        "id": str(uuid.uuid4()),
        "stream_key": str(uuid.uuid4()).replace("-", ""),
        "title": title,
        "is_live": False,   # ✅ Boolean instead of int
        "viewer_count": 0,
        "started_at": None,
        "ended_at": None,
        "created_at": datetime.utcnow()
    }
    livestreams_collection.insert_one(stream)
    return stream


def start_stream(stream_key):
    livestreams_collection.update_one(
        {"stream_key": stream_key},
        {
            "$set": {
                "is_live": True,
                "started_at": datetime.utcnow()
            }
        }
    )


def end_stream(stream_key):
    livestreams_collection.update_one(
        {"stream_key": stream_key},
        {
            "$set": {
                "is_live": False,
                "ended_at": datetime.utcnow()
            }
        }
    )


def update_viewers(stream_key, count):
    livestreams_collection.update_one(
        {"stream_key": stream_key},
        {"$set": {"viewer_count": count}}
    )


def get_stream(stream_key):
    return livestreams_collection.find_one(
        {"stream_key": stream_key},
        {"_id": 0}
    )


def update_video_paths(video_id, paths: dict):
    videos_collection.update_one(
        {"id": video_id},
        {
            "$set": {
                "paths": paths,
                "updated_at": datetime.utcnow()
            }
        }
    )