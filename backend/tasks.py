import os
import shutil
import logging
from celery import Celery
from ffmpeg_utils import process_video
from mongo_model import update_video_status, VideoStatus, update_video_paths

logger = logging.getLogger(__name__)

REDIS_URL  = os.getenv("REDIS_URL", "redis://localhost:6379/0")
BASE_DIR   = os.getcwd()
OUTPUT_DIR = os.path.join(BASE_DIR, "outputs")

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
    output_dir = os.path.join(OUTPUT_DIR, video_id)
    os.makedirs(output_dir, exist_ok=True)

    try:
        # ── Phase 1: Processing ─────────────────────────────
        self.update_state(
            state="PROCESSING",
            meta={"step": "transcoding", "video_id": video_id}
        )

        update_video_status(video_id, VideoStatus.PROCESSING)

        paths = process_video(video_id, input_path, output_dir)

        # ── Phase 2: Save paths in Mongo ───────────────────
        update_video_paths(video_id, {
            "mp4": paths.get("mp4"),
            "hls": paths.get("hls"),
            "webm": paths.get("webm"),
        })

        update_video_status(video_id, VideoStatus.READY)

        # ── Phase 3: Cleanup (optional) ────────────────────
        if os.path.exists(input_path):
            os.remove(input_path)

        return {
            "status": "done",
            "video_id": video_id,
            "paths": paths
        }

    except Exception as exc:
        logger.exception(f"Task failed for video {video_id}: {exc}")

        update_video_status(video_id, VideoStatus.FAILED, str(exc))

        raise self.retry(exc=exc, countdown=60)