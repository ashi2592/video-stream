from news_overlay import NewsOverlayFilter, OverlayConfig
import os
import argparse
import subprocess
import os
import logging

logger = logging.getLogger(__name__)

FFMPEG_IMAGE = os.getenv("FFMPEG_DOCKER_IMAGE", "jrottenberg/ffmpeg:latest")


def _run(args: list[str], label: str, mount_dir: str):
    """
    Run FFmpeg inside Docker container.

    Args:
        args: FFmpeg arguments (without 'ffmpeg')
        label: log label
        mount_dir: host directory to mount inside container (/work)
    """

    # 🔹 Convert host paths → container paths
    remapped_args = []
    for arg in args:
        if isinstance(arg, str) and os.path.isabs(arg) and arg.startswith(mount_dir):
            container_path = "/work/" + os.path.relpath(arg, mount_dir)
            remapped_args.append(container_path)
        else:
            remapped_args.append(arg)

    # 🔹 Full docker command
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{mount_dir}:/work",
        FFMPEG_IMAGE,
        *remapped_args
    ]

    logger.info(f"[{label}] Running FFmpeg...")
    logger.debug(" ".join(cmd))

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        logger.error(result.stderr)
        raise RuntimeError(f"[{label}] FFmpeg failed:\n{result.stderr}")

    logger.info(f"[{label}] Completed successfully")


def process_video(video_id, input_path, output_dir, overlay=None):
    overlay = overlay or {}
    mount_dir = os.getcwd()

    mp4_dir = os.path.join(output_dir, "mp4")
    os.makedirs(mp4_dir, exist_ok=True)

    mp4_out = os.path.join(mp4_dir, "output.mp4")

    overlay_enabled = overlay.get("enabled", True)

    if overlay_enabled:
        # ✅ Build overlay config
        cfg = OverlayConfig(
            channel_name=overlay.get("channel_name", "NEWS 24"),
            headline=overlay.get("headline", "BREAKING NEWS"),
            ticker_text=overlay.get("ticker", "Stay tuned"),
            badge_text=overlay.get("badge_text", "BREAKING"),
            font_path="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        )

        # ✅ Generate filter
        filter_complex = NewsOverlayFilter(cfg).build()

        ffmpeg_args = [
            "-i", input_path,
            "-filter_complex", filter_complex,
            "-map", "[out]",
            "-map", "0:a?",
        ]

    else:
        ffmpeg_args = [
            "-i", input_path,
            "-vf", "scale=1280:720",
        ]

    # ✅ Run FFmpeg (Docker)
    _run([
        *ffmpeg_args,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "aac",
        "-b:a", "128k",
        "-y",
        mp4_out,
    ], label=f"{video_id}/mp4", mount_dir=mount_dir)

    return {"mp4": mp4_out}


  
def main():
    parser = argparse.ArgumentParser(description="Test FFmpeg News Overlay Pipeline")

    parser.add_argument("--input", required=True, help="Input video path")
    parser.add_argument("--output_dir", required=True, help="Output directory")
    parser.add_argument("--video_id", default="test123", help="Video ID")

    parser.add_argument("--channel", default="NEWS 24")
    parser.add_argument("--headline", default="Breaking News Test")
    parser.add_argument("--ticker", default="This is a test ticker scrolling text")
    parser.add_argument("--badge", default="BREAKING")

    parser.add_argument("--disable_overlay", action="store_true")

    args = parser.parse_args()

    # 🔹 Ensure absolute paths (important for Docker)
    input_path = os.path.abspath(args.input)
    output_dir = os.path.abspath(args.output_dir)

    overlay_config = {
        "enabled": not args.disable_overlay,
        "channel_name": args.channel,
        "headline": args.headline,
        "ticker": args.ticker,
        "badge_text": args.badge,
    }

    result = process_video(
        video_id=args.video_id,
        input_path=input_path,
        output_dir=output_dir,
        overlay=overlay_config
    )

    print("\n✅ Processing Done!")
    print(result)


if __name__ == "__main__":
    main()