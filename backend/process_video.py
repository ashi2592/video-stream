"""
process_video.py — Video processing worker with MongoDB-driven news overlay.

Flow:
  1. Worker receives (video_id, input_path, output_dir)
  2. Fetches overlay config from MongoDB (channel_name / headline / ticker)
  3. Applies FFmpeg news overlay  →  MP4
  4. Generates HLS + WebM from the overlaid MP4
  5. Writes output paths back to MongoDB
  6. Updates video status → READY or FAILED
"""

import os
import subprocess

from mongo_model import (
    VideoStatus,
    get_video_overlay,
    update_video_status,
    update_video_paths,
)
from news_overlay import NewsOverlayFilter, OverlayConfig, _build_ffmpeg_cmd


# ── Docker helpers ────────────────────────────────────────────────────────────

USE_DOCKER = os.getenv("FFMPEG_USE_DOCKER", "false").lower() == "true"
FFMPEG_IMAGE = os.getenv("FFMPEG_DOCKER_IMAGE", "jrottenberg/ffmpeg:4.4-alpine")


def _docker_path(host_path: str, base_dir: str) -> str:
    """Convert a host path to its /work equivalent inside the Docker container."""
    rel = os.path.relpath(host_path, base_dir)
    return f"/work/{rel}"


def _run(args: list[str], label: str, base_dir: str | None = None) -> None:
    """
    Run FFmpeg with *args*.

    When USE_DOCKER is True every path in args that starts with base_dir
    is remapped to /work/<rel>.  The Docker container mounts base_dir → /work.
    """
    if USE_DOCKER and base_dir:
        remapped = []
        for a in args:
            if os.path.isabs(a) and a.startswith(base_dir):
                remapped.append(_docker_path(a, base_dir))
            else:
                remapped.append(a)

        cmd = [
            "docker", "run", "--rm",
            "-v", f"{base_dir}:/work",
            FFMPEG_IMAGE,
        ] + remapped
    else:
        cmd = ["ffmpeg"] + args

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"[{label}] FFmpeg failed:\n{result.stderr}")


# ── Main entry point ──────────────────────────────────────────────────────────

def process_video(video_id: str, input_path: str, output_dir: str) -> dict:
    """
    Full pipeline:
      - Pull overlay text from MongoDB
      - Apply news overlay to video
      - Encode MP4 / HLS / WebM
      - Persist paths and status to MongoDB

    Args:
        video_id:   Public video UUID (matches MongoDB 'id' field).
        input_path: Absolute path to the uploaded source video.
        output_dir: Root directory for output files.

    Returns:
        {"mp4": str, "hls": str, "webm": str}
    """
    try:
        update_video_status(video_id, VideoStatus.PROCESSING)

        # ── 1. Fetch overlay config from MongoDB ──────────────────────────────
        overlay_doc = get_video_overlay(video_id)

        # overlay_doc is guaranteed non-None for an existing video;
        # fall back to empty dict (DEFAULT_OVERLAY values used by OverlayConfig)
        overlay_doc = overlay_doc or {}

        overlay_enabled = overlay_doc.get("enabled", True)

        # ── 2. Build output directories / paths ───────────────────────────────
        hls_dir  = os.path.join(output_dir, "hls")
        mp4_dir  = os.path.join(output_dir, "mp4")
        webm_dir = os.path.join(output_dir, "webm")

        for d in (hls_dir, mp4_dir, webm_dir):
            os.makedirs(d, exist_ok=True)

        mp4_out  = os.path.join(mp4_dir,  "output.mp4")
        hls_out  = os.path.join(hls_dir,  "master.m3u8")
        webm_out = os.path.join(webm_dir, "output.webm")

        base_dir = os.getcwd()

        # ── 3a. Build overlay config from MongoDB document ────────────────────
        cfg = OverlayConfig(
            channel_name = overlay_doc.get("channel_name", "NEWS 24"),
            headline     = overlay_doc.get("headline",     "BREAKING NEWS"),
            ticker_text  = overlay_doc.get("ticker",       "Stay tuned for the latest updates"),
            badge_text   = overlay_doc.get("badge_text",   "BREAKING"),
        )

        # ── 3b. Build filter_complex (or plain scale filter if disabled) ───────
        if overlay_enabled:
            filter_complex = NewsOverlayFilter(cfg).build()
            vf_args = ["-filter_complex", filter_complex, "-map", "[out]", "-map", "0:a?"]
        else:
            # No overlay — simple scale + watermark with video_id only
            short_id = video_id[:8]
            vf_args = [
                "-vf",
                (
                    "scale=1280:720:force_original_aspect_ratio=decrease,"
                    "pad=1280:720:(ow-iw)/2:(oh-ih)/2,"
                    f"drawtext=text='{short_id}':"
                    "fontsize=18:fontcolor=white@0.75:"
                    "x=20:y=20:box=1:boxcolor=black@0.45:boxborderw=6"
                ),
            ]

        # ── 4. STEP 1 — MP4 (overlay encoded) ────────────────────────────────
        _run([
            "-i", input_path,
            *vf_args,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-c:a", "aac",
            "-b:a", "128k",
            "-y",
            mp4_out,
        ], label="MP4 encoding", base_dir=base_dir)

        # ── 5. STEP 2 — HLS (stream-copy from MP4, no re-encode) ─────────────
        _run([
            "-i", mp4_out,
            "-c", "copy",
            "-start_number", "0",
            "-hls_time", "6",
            "-hls_list_size", "0",
            "-f", "hls",
            "-y",
            hls_out,
        ], label="HLS generation", base_dir=base_dir)

        # ── 6. STEP 3 — WebM ─────────────────────────────────────────────────
        _run([
            "-i", mp4_out,
            "-c:v", "libvpx-vp9",
            "-b:v", "1M",
            "-c:a", "libopus",
            "-y",
            webm_out,
        ], label="WebM generation", base_dir=base_dir)

        # ── 7. Persist paths + status ─────────────────────────────────────────
        paths = {"mp4": mp4_out, "hls": hls_out, "webm": webm_out}
        update_video_paths(video_id, paths)
        update_video_status(video_id, VideoStatus.READY)

        return paths

    except Exception as exc:
        update_video_status(video_id, VideoStatus.FAILED, str(exc))
        raise