"""
tasks.py
--------
Celery workers for async video processing.
Each task:
  1. Calls FFmpeg pipeline (compress, overlay, transcode)
  2. Uploads all output files to S3
  3. Cleans up local temp files
"""

import os
import shutil
import logging
from celery import Celery
from ffmpeg_utils import process_video
from s3_utils import upload_folder_to_s3

logger = logging.getLogger(__name__)

REDIS_URL  = os.getenv("REDIS_URL", "redis://localhost:6379/0")
OUTPUT_DIR = "/tmp/outputs"

celery = Celery("tasks", broker=REDIS_URL, backend=REDIS_URL)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,    # Process one video at a time per worker
)


@celery.task(bind=True, max_retries=2)
def process_video_task(self, video_id: str, input_path: str):
    """
    Full pipeline task:
      STARTED → PROCESSING → UPLOADING → SUCCESS | FAILURE
    """
    output_dir = f"{OUTPUT_DIR}/{video_id}"
    os.makedirs(output_dir, exist_ok=True)

    try:
        # ── Phase 1: FFmpeg ───────────────────────────────────────────────────
        self.update_state(
            state="PROCESSING",
            meta={"step": "transcoding", "video_id": video_id}
        )
        paths = process_video(video_id, input_path, output_dir)

        # ── Phase 2: Upload to S3 ─────────────────────────────────────────────
        self.update_state(
            state="UPLOADING",
            meta={"step": "uploading to S3", "video_id": video_id}
        )
        upload_folder_to_s3(output_dir, s3_prefix=video_id)

        # ── Phase 3: Cleanup ──────────────────────────────────────────────────
        if os.path.exists(input_path):
            os.remove(input_path)
        shutil.rmtree(output_dir, ignore_errors=True)

        return {
            "status": "done",
            "video_id": video_id,
            "formats": list(paths.keys()),
        }

    except Exception as exc:
        logger.exception(f"Task failed for video {video_id}: {exc}")
        # Retry up to max_retries with 60s delay
        raise self.retry(exc=exc, countdown=60)
