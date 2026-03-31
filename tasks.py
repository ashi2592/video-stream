"""
tasks.py — Celery task using Redis (Docker) as broker.

Environment variables:
    REDIS_URL  — Redis connection string (default: redis://localhost:6379/0)
    OUTPUT_DIR — Root directory for processed videos (default: ./outputs)
"""

import os
import logging
from celery import Celery

from utils.ffmpeg_utils import process_video
from utils.mongo_model import (
    update_video_status,
    update_video_paths,
    get_video_overlay,
    videos_collection,
    VideoStatus,
)
from datetime import datetime
from config.config import UPLOAD_DIR, OUTPUT_DIR, MEDIA_BASE, REDIS_URL

logger = logging.getLogger(__name__)

# ── Celery app ────────────────────────────────────────────────────────────────

celery = Celery("tasks", broker=REDIS_URL, backend=REDIS_URL)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,   # one heavy FFmpeg job at a time
)

# ── Task ──────────────────────────────────────────────────────────────────────

@celery.task(bind=True, max_retries=2)
def process_video_task(self, video_id: str, input_path: str):
    """
    Full processing pipeline for one uploaded video.

    Steps:
        0. Save Celery task_id to MongoDB.
        1. Read overlay config from MongoDB.
        2. Mark video as PROCESSING.
        3. Run FFmpeg → produces MP4.
        4. Write output path back to MongoDB.
        5. Mark video as READY.
        6. Delete the uploaded source file.

    Returns:
        {"status": "done", "video_id": str, "paths": {"mp4": str}}
    """
    output_dir = os.path.join(OUTPUT_DIR, video_id)
    os.makedirs(output_dir, exist_ok=True)

    os.makedirs(os.path.join(output_dir, "mp4"), exist_ok=True)

    try:
        # ── Phase 0: Save task_id to MongoDB ─────────────────────────────────
        task_id = self.request.id
        videos_collection.update_one(
            {"id": video_id},
            {"$set": {"task_id": task_id, "updated_at": datetime.utcnow()}},
        )
        logger.info(f"[{video_id}] task_id saved → {task_id}")

        # ── Phase 1: Read overlay config from MongoDB ─────────────────────────
        overlay = get_video_overlay(video_id) or {}
        logger.info(
            f"[{video_id}] overlay — "
            f"channel='{overlay.get('channel_name')}' "
            f"headline='{overlay.get('headline')}' "
            f"enabled={overlay.get('enabled', True)}"
        )

        # ── Phase 2: Mark as PROCESSING ───────────────────────────────────────
        self.update_state(
            state="PROCESSING",
            meta={"step": "transcoding", "video_id": video_id},
        )
        update_video_status(video_id, VideoStatus.PROCESSING)

        # ── Phase 3: Run FFmpeg ───────────────────────────────────────────────
        paths = process_video(
            video_id   = video_id,
            input_path = input_path,
            output_dir = output_dir,
            overlay    = overlay,
        )

        # ── Phase 4: Persist output path → MongoDB ────────────────────────────
        update_video_paths(video_id, {
            "mp4": f"{video_id}/mp4/output.mp4"
        })

        # ── Phase 5: Mark as READY ────────────────────────────────────────────
        update_video_status(video_id, VideoStatus.READY)
        logger.info(f"[{video_id}] complete — {paths}")

        # ── Phase 6: Delete source file ───────────────────────────────────────
        if os.path.exists(input_path):
            os.remove(input_path)
            logger.info(f"[{video_id}] source deleted: {input_path}")

        return {"status": "done", "video_id": video_id, "paths": paths}

    except Exception as exc:
        logger.exception(f"[{video_id}] failed: {exc}")
        update_video_status(video_id, VideoStatus.FAILED, str(exc))
        raise self.retry(exc=exc, countdown=60)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Test Celery Video Processing Task")
    parser.add_argument("--video_id", default="test123", help="Video ID")
    parser.add_argument("--input", required=True, help="Input video path")

    args = parser.parse_args()
    input_path = os.path.abspath(args.input)

    print("🚀 Sending task to Celery worker...")

    try:
        result = process_video_task.delay(
            video_id=args.video_id,
            input_path=input_path,
        )

                # 🔥 Call underlying function logic without Celery wrapper
        # result = process_video(
        #     video_id=args.video_id,
        #     input_path=input_path,
        #     output_dir=os.path.join(OUTPUT_DIR, args.video_id),
        #     overlay=get_video_overlay(args.video_id) or {}
        # )
        
        print(f"\n✅ Task queued:")
        print(f"   task_id  = {result.id}")
        print(f"   video_id = {args.video_id}")
        print(f"\nPoll status: GET /status/{result.id}")

    except Exception as e:
        print("\n❌ Task failed:")
        print(str(e))