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
from utils.azure_storage import upload_folder_to_blob, generate_sas_url   # ← Azure
from datetime import datetime
from config.config import UPLOAD_DIR, OUTPUT_DIR, MEDIA_BASE, REDIS_URL

logger = logging.getLogger(__name__)

celery = Celery("tasks", broker=REDIS_URL, backend=REDIS_URL)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,
)


@celery.task(bind=True, max_retries=2)
def process_video_task(self, video_id: str, input_path: str):
    """
    Full processing pipeline for one uploaded video.

    Steps:
        0. Save Celery task_id to MongoDB.
        1. Read overlay config from MongoDB.
        2. Mark video as PROCESSING.
        3. Run FFmpeg → produces MP4 + HLS.
        4. Upload output folder to Azure Blob Storage.
        5. Write Azure URLs back to MongoDB.
        6. Mark video as READY.
        7. Delete local output files + source upload.
    """
    output_dir = os.path.join(OUTPUT_DIR, video_id)
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(os.path.join(output_dir, "mp4"), exist_ok=True)

    try:
        # ── Phase 0: Save task_id ─────────────────────────────────────────────
        task_id = self.request.id
        videos_collection.update_one(
            {"id": video_id},
            {"$set": {"task_id": task_id, "updated_at": datetime.utcnow()}},
        )
        logger.info(f"[{video_id}] task_id saved → {task_id}")

        # ── Phase 1: Read overlay config ──────────────────────────────────────
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
            video_id=video_id,
            input_path=input_path,
            output_dir=output_dir,
            overlay=overlay,
        )

        # ── Phase 4: Upload output folder → Azure Blob ────────────────────────
        self.update_state(
            state="UPLOADING",
            meta={"step": "uploading_to_azure", "video_id": video_id},
        )
        logger.info(f"[{video_id}] uploading output folder to Azure...")
        upload_folder_to_blob(
            local_dir=output_dir,
            blob_prefix=video_id,       # blobs land at  <video_id>/mp4/... and <video_id>/hls/...
        )
        logger.info(f"[{video_id}] Azure upload complete")

        # ── Phase 5: Build playback URLs and persist to MongoDB ───────────────
        mp4_blob = f"{video_id}/mp4/output.mp4"
        hls_blob = f"{video_id}/hls/master.m3u8"

        update_video_paths(video_id, {
            "mp4": mp4_blob,
            "hls": hls_blob,
        })

        # Store fully-resolved playback URLs too (CDN or SAS)
        videos_collection.update_one(
            {"id": video_id},
            {"$set": {
                "urls": {
                    "mp4": generate_sas_url(mp4_blob),
                    "hls": generate_sas_url(hls_blob),
                },
                "updated_at": datetime.utcnow(),
            }},
        )

        # ── Phase 6: Mark as READY ────────────────────────────────────────────
        update_video_status(video_id, VideoStatus.READY)
        logger.info(f"[{video_id}] complete — {paths}")

        # ── Phase 7: Clean up local files ─────────────────────────────────────
        if os.path.exists(input_path):
            os.remove(input_path)
            logger.info(f"[{video_id}] source deleted: {input_path}")

        import shutil
        if os.path.exists(output_dir):
            shutil.rmtree(output_dir)
            logger.info(f"[{video_id}] local output dir cleaned: {output_dir}")

        return {
            "status":   "done",
            "video_id": video_id,
            "urls": {
                "mp4": generate_sas_url(mp4_blob),
                "hls": generate_sas_url(hls_blob),
            },
        }

    except Exception as exc:
        logger.exception(f"[{video_id}] failed: {exc}")
        update_video_status(video_id, VideoStatus.FAILED, str(exc))
        raise self.retry(exc=exc, countdown=60)