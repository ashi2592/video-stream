from overlays.news_overlay import NewsOverlayFilter, OverlayConfig
from config.config import UPLOAD_DIR, OUTPUT_DIR
import os
import argparse
import subprocess
import logging

logger = logging.getLogger(__name__)

FFMPEG_IMAGE = os.getenv("FFMPEG_DOCKER_IMAGE", "jrottenberg/ffmpeg:latest")

# Common parent directory that contains both uploads/ and outputs/
# Both paths must be under this root for Docker volume mount to work
MOUNT_DIR = os.path.abspath(os.path.commonpath([
    os.path.abspath(UPLOAD_DIR),
    os.path.abspath(OUTPUT_DIR),
]))

def _run(args: list[str], label: str):
    mount_dir = MOUNT_DIR

    remapped_args = []
    for arg in args:
        if isinstance(arg, str) and _is_file_path(arg):
            abs_arg = os.path.abspath(arg) if not os.path.isabs(arg) else arg
            if abs_arg.startswith(mount_dir + os.sep) or abs_arg == mount_dir:
                container_path = "/work/" + os.path.relpath(abs_arg, mount_dir)
                remapped_args.append(container_path)
            else:
                remapped_args.append(arg)
        else:
            remapped_args.append(arg)

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


def _is_file_path(arg: str) -> bool:
    """
    Returns True only if the arg looks like a file path that needs remapping.
    Excludes FFmpeg flags, filter strings, codec names, and stream specifiers.
    """
    if not arg or arg.startswith("-"):   # flags: -i, -c:v, -map, etc.
        return False
    if arg.startswith("["):              # stream specifiers: [out], [0:a]
        return False
    if "=" in arg:                       # filter strings, options: scale=1280:720
        return False
    if arg in ("copy", "aac", "libx264", "libx265", "libvpx-vp9", "libopus",
               "fast", "medium", "slow", "yuv420p", "hls", "mp4"):
        return False                     # known codec/format/preset names
    # Must look like a path: contains a slash, or has a video/playlist extension
    if "/" in arg or os.sep in arg:
        return True
    if any(arg.endswith(ext) for ext in (".mp4", ".m3u8", ".ts", ".webm", ".mov", ".mkv")):
        return True
    return False
    


def process_video(video_id, input_path, output_dir, overlay=None):
    overlay = overlay or {}

    mp4_dir = os.path.join(os.path.abspath(output_dir), "mp4")
    os.makedirs(mp4_dir, exist_ok=True)

    mp4_out    = os.path.join(mp4_dir, "output.mp4")
    input_path = os.path.abspath(input_path)

    overlay_enabled = overlay.get("enabled", True)

    if overlay_enabled:
        cfg = OverlayConfig(
            channel_name=overlay.get("channel_name", "NEWS 24"),
            headline=overlay.get("headline", "BREAKING NEWS"),
            ticker_text=overlay.get("ticker", "Stay tuned"),
            badge_text=overlay.get("badge_text", "BREAKING"),
            font_path="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        )
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
    ], label=f"{video_id}/mp4")

    return {"mp4": mp4_out}


def main():
    parser = argparse.ArgumentParser(description="Test FFmpeg News Overlay Pipeline")
    parser.add_argument("--input",           required=True)
    parser.add_argument("--output_dir",      required=True)
    parser.add_argument("--video_id",        default="test123")
    parser.add_argument("--channel",         default="NEWS 24")
    parser.add_argument("--headline",        default="Breaking News Test")
    parser.add_argument("--ticker",          default="This is a test ticker scrolling text")
    parser.add_argument("--badge",           default="BREAKING")
    parser.add_argument("--disable_overlay", action="store_true")
    args = parser.parse_args()

    result = process_video(
        video_id=args.video_id,
        input_path=os.path.abspath(args.input),
        output_dir=os.path.abspath(args.output_dir),
        overlay={
            "enabled":      not args.disable_overlay,
            "channel_name": args.channel,
            "headline":     args.headline,
            "ticker":       args.ticker,
            "badge_text":   args.badge,
        },
    )

    print("\n✅ Processing Done!")
    print(result)


if __name__ == "__main__":
    main()