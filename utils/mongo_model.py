from datetime import datetime
from pymongo import MongoClient, ReturnDocument
import uuid
import os
from dotenv import load_dotenv

load_dotenv()

# ── DB Connection ────────────────────────────────────────────────────────────

client = MongoClient(os.getenv("MONGODB_URI", "mongodb://root:password@localhost:27017/"))
db     = client["video_platform"]

videos_collection      = db["videos"]
livestreams_collection = db["live_streams"]
templates_collection = db["templates"]



# ── INDEXES (run once on startup) ────────────────────────────────────────────

# videos_collection.create_index("id", unique=True)
# videos_collection.create_index("status")
# videos_collection.create_index("created_at")
# livestreams_collection.create_index("stream_key", unique=True)


# ── STATUS ENUM ──────────────────────────────────────────────────────────────

class VideoStatus:
    QUEUED     = "queued"
    PROCESSING = "processing"
    UPLOADING  = "uploading"
    READY      = "ready"
    FAILED     = "failed"


# ── OVERLAY DEFAULTS ─────────────────────────────────────────────────────────
# Override any of these in your .env without changing code:
#
#   DEFAULT_CHANNEL_NAME=CNN LIVE
#   DEFAULT_HEADLINE=Breaking News
#   DEFAULT_TICKER=Stay tuned for the latest updates
#   DEFAULT_BADGE=BREAKING

DEFAULT_OVERLAY = {
    "channel_name": os.getenv("DEFAULT_CHANNEL_NAME", "NEWS 24"),
    "headline":     os.getenv("DEFAULT_HEADLINE",     "BREAKING NEWS"),
    "ticker":       os.getenv("DEFAULT_TICKER",       "Stay tuned for the latest updates"),
    "badge_text":   os.getenv("DEFAULT_BADGE",        "BREAKING"),
    "enabled":      True,
}


# ── VIDEO OPERATIONS ─────────────────────────────────────────────────────────
def create_video(filename, title=None, size_bytes=None, overlay=None,
                 description=None, meta_tags=None, seo=None):

    merged_overlay = {**DEFAULT_OVERLAY, **(overlay or {})}

    video = {
        "id":         str(uuid.uuid4()),
        "filename":   filename,
        "title":      title,
        "description": description,   # ✅ NEW
        "meta_tags":  meta_tags or [], # ✅ NEW (list of keywords)

        # ✅ SEO object
        "seo": {
            "meta_title":       seo.get("meta_title") if seo else title,
            "meta_description": seo.get("meta_description") if seo else description,
            "keywords":         seo.get("keywords") if seo else [],
        },

        "status":     VideoStatus.QUEUED,
        "task_id":    None,
        "duration":   None,
        "size_bytes": size_bytes,

        "overlay":    merged_overlay,

        "paths": {
            "mp4":  None,
            "hls":  None,
            "webm": None,
        },

        "error_msg":  None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    videos_collection.insert_one(video)
    return video


def update_video_seo(video_id, data: dict):
    update_data = {}

    if "title" in data:
        update_data["title"] = data["title"]

    if "description" in data:
        update_data["description"] = data["description"]

    if "meta_tags" in data:
        update_data["meta_tags"] = data["meta_tags"]

    if "seo" in data:
        for k, v in data["seo"].items():
            update_data[f"seo.{k}"] = v

    update_data["updated_at"] = datetime.utcnow()

    return videos_collection.find_one_and_update(
        {"id": video_id},
        {"$set": update_data},
        projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
    )

def get_video(video_id):
    return videos_collection.find_one({"id": video_id}, {"_id": 0})


def update_video_status(video_id, status, error_msg=None):
    update_data = {
        "status":     status,
        "updated_at": datetime.utcnow(),
    }
    if error_msg:
        update_data["error_msg"] = error_msg

    videos_collection.update_one({"id": video_id}, {"$set": update_data})


def update_video_metadata(video_id, duration=None, size_bytes=None):
    update_data = {"updated_at": datetime.utcnow()}
    if duration   is not None: update_data["duration"]   = duration
    if size_bytes is not None: update_data["size_bytes"] = size_bytes

    videos_collection.update_one({"id": video_id}, {"$set": update_data})


def update_video_paths(video_id, paths: dict):
    videos_collection.update_one(
        {"id": video_id},
        {"$set": {"paths": paths, "updated_at": datetime.utcnow()}},
    )


def list_videos():
    return list(videos_collection.find({}, {"_id": 0}))


# ── OVERLAY OPERATIONS ────────────────────────────────────────────────────────

def get_video_overlay(video_id) -> dict | None:
    """
    Return the overlay sub-document for *video_id*.

    Returns:
        dict  — overlay config (falls back to DEFAULT_OVERLAY for legacy docs
                that pre-date the overlay field)
        None  — video does not exist
    """
    doc = videos_collection.find_one(
        {"id": video_id},
        {"_id": 0, "overlay": 1},
    )
    if doc is None:
        return None
    return doc.get("overlay") or DEFAULT_OVERLAY.copy()


def update_video_overlay(video_id, overlay: dict) -> dict | None:
    """
    Patch individual overlay fields using MongoDB dot-notation $set.
    Only the keys you supply are changed; all others are preserved.

    Usage:
        update_video_overlay(vid, {"headline": "Flood warning", "badge_text": "LIVE"})

    Returns the full updated document, or None if the video was not found.
    """
    if not overlay:
        return None

    set_fields = {f"overlay.{k}": v for k, v in overlay.items()}
    set_fields["updated_at"] = datetime.utcnow()

    return videos_collection.find_one_and_update(
        {"id": video_id},
        {"$set": set_fields},
        projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
    )


# ── LIVE STREAM OPERATIONS ────────────────────────────────────────────────────

def create_stream(title):
    stream = {
        "id":           str(uuid.uuid4()),
        "stream_key":   str(uuid.uuid4()).replace("-", ""),
        "title":        title,
        "is_live":      False,
        "viewer_count": 0,
        "started_at":   None,
        "ended_at":     None,
        "created_at":   datetime.utcnow(),
    }
    livestreams_collection.insert_one(stream)
    return stream


def start_stream(stream_key):
    livestreams_collection.update_one(
        {"stream_key": stream_key},
        {"$set": {"is_live": True, "started_at": datetime.utcnow()}},
    )


def end_stream(stream_key):
    livestreams_collection.update_one(
        {"stream_key": stream_key},
        {"$set": {"is_live": False, "ended_at": datetime.utcnow()}},
    )


def update_viewers(stream_key, count):
    livestreams_collection.update_one(
        {"stream_key": stream_key},
        {"$set": {"viewer_count": count}},
    )


def get_stream(stream_key):
    return livestreams_collection.find_one({"stream_key": stream_key}, {"_id": 0})