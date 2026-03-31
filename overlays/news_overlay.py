"""
news_overlay.py — FFmpeg-based news-style video overlay processor
Runs inside jrottenberg/ffmpeg Docker container or natively with ffmpeg installed.

Usage:
    python news_overlay.py --input input.mp4 --output output.mp4 \
        --channel "NEWS 24" \
        --headline "BREAKING: Major earthquake strikes Pacific coast" \
        --ticker "Markets fall 3% as Fed signals rate hike • Tech stocks lead decline • Oil prices surge to $95/barrel"
"""

import subprocess
import os
import sys
import argparse
import shlex
from dataclasses import dataclass, field
from typing import Optional


# ── CONFIG ───────────────────────────────────────────────────────────────────

# Docker image used by jrottenberg/ffmpeg
FFMPEG_DOCKER_IMAGE = os.getenv("FFMPEG_DOCKER_IMAGE", "jrottenberg/ffmpeg:latest")

# Font path — adjust for your OS/container.
# jrottenberg/ffmpeg (Alpine) ships with DejaVu fonts at:
FONT_PATH_ALPINE  = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_PATH_UBUNTU  = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_PATH_MAC     = "/Library/Fonts/Arial Bold.ttf"
FONT_PATH_WINDOWS = "C\\:/Windows/Fonts/arialbd.ttf"   # colons must be escaped

def _detect_font() -> str:
    """Return best available font path for the current environment."""
    for path in (FONT_PATH_ALPINE, FONT_PATH_UBUNTU):
        if os.path.exists(path):
            return path
    if sys.platform == "darwin":
        return FONT_PATH_MAC
    if sys.platform == "win32":
        return FONT_PATH_WINDOWS
    return FONT_PATH_ALPINE          # fallback; Docker will have it


# ── DATA MODEL ───────────────────────────────────────────────────────────────

@dataclass
class OverlayConfig:
    """All tuneable parameters for the news overlay."""

    # Content
    channel_name:   str = "NEWS 24"
    headline:       str = "BREAKING NEWS"
    ticker_text:    str = "Latest updates • Stay tuned for more"

    # Top bar
    top_bar_color:      str = "0x1a1a2e@0.92"   # deep navy, semi-transparent
    top_bar_height:     int = 52
    channel_font_size:  int = 28
    channel_font_color: str = "white"

    # Bottom headline bar
    bottom_bar_color:       str = "0xc0392b@0.95"   # red
    bottom_bar_height:      int = 52
    headline_font_size:     int = 22
    headline_font_color:    str = "white"

    # "BREAKING" badge inside bottom bar
    badge_color:      str = "0xe74c3c"
    badge_font_size:  int = 18
    badge_text:       str = "BREAKING"
    badge_font_color: str = "white"

    # Ticker
    ticker_bar_color:  str = "0x2c3e50@0.97"
    ticker_height:     int = 36
    ticker_font_size:  int = 18
    ticker_font_color: str = "0xf1c40f"    # amber/gold
    ticker_speed:      int = 120           # pixels per second (right→left)

    # Border
    add_border:     bool  = True
    border_color:   str   = "0xc0392b"    # red
    border_width:   int   = 3

    # Font
    font_path: str = field(default_factory=_detect_font)

    # Output
    target_width:  int = 1280
    target_height: int = 720
    crf:           int = 23
    preset:        str = "fast"


# ── FILTER BUILDER ────────────────────────────────────────────────────────────

class NewsOverlayFilter:
    """Builds the FFmpeg filter_complex string for the news overlay."""

    def __init__(self, cfg: OverlayConfig):
        self.cfg = cfg
        self.W = cfg.target_width
        self.H = cfg.target_height
        self.f = cfg.font_path   # shorthand

    def _esc(self, text: str) -> str:
        """Escape special characters for FFmpeg drawtext."""
        return (
            text
            .replace("\\", "\\\\")
            .replace("'",  "\u2019")   # replace straight quote → curly (safer)
            .replace(":",  "\\:")
            .replace("%",  "\\%")
            .replace("[",  "\\[")
            .replace("]",  "\\]")
        )

    def build(self) -> str:
        """Return the complete filter_complex string."""
        cfg = self.cfg
        W, H = self.W, self.H
        f    = self.f

        parts = []

        # ── 0. Scale & pad input ─────────────────────────────────────────────
        parts.append(
            f"[0:v]scale={W}:{H}:force_original_aspect_ratio=decrease,"
            f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black[scaled]"
        )

        prev = "scaled"

        # ── 1. Optional border ───────────────────────────────────────────────
        if cfg.add_border:
            bw = cfg.border_width
            parts.append(
                f"[{prev}]drawbox=x=0:y=0:w={W}:h={H}"
                f":color={cfg.border_color}:t={bw}[bordered]"
            )
            prev = "bordered"

        # ── 2. Top bar (channel) ─────────────────────────────────────────────
        th = cfg.top_bar_height
        parts.append(
            f"[{prev}]drawbox=x=0:y=0:w={W}:h={th}"
            f":color={cfg.top_bar_color}:t=fill[topbar]"
        )

        # Channel name — centred vertically in top bar
        channel_y = f"({th}-{cfg.channel_font_size})/2"
        parts.append(
            f"[topbar]drawtext="
            f"fontfile='{f}':"
            f"text='{self._esc(cfg.channel_name)}':"
            f"fontsize={cfg.channel_font_size}:"
            f"fontcolor={cfg.channel_font_color}:"
            f"x=(w-text_w)/2:"           # horizontally centred
            f"y={channel_y}:"
            f"shadowcolor=black@0.6:shadowx=1:shadowy=1"
            f"[toplabel]"
        )
        prev = "toplabel"

        # ── 3. Bottom headline bar ───────────────────────────────────────────
        bh = cfg.bottom_bar_height
        bar_y = H - bh - cfg.ticker_height

        parts.append(
            f"[{prev}]drawbox=x=0:y={bar_y}:w={W}:h={bh}"
            f":color={cfg.bottom_bar_color}:t=fill[btmbar]"
        )

        # "BREAKING" badge (left side, fixed width ~120px)
        badge_w  = 110
        badge_pad = 6
        badge_y  = f"{bar_y}+({bh}-{cfg.badge_font_size})/2"
        parts.append(
            f"[btmbar]drawbox="
            f"x={badge_pad}:y={bar_y}+{badge_pad}:"
            f"w={badge_w}:h={bh - badge_pad*2}:"
            f"color={cfg.badge_color}:t=fill[badge_box]"
        )
        parts.append(
            f"[badge_box]drawtext="
            f"fontfile='{f}':"
            f"text='{self._esc(cfg.badge_text)}':"
            f"fontsize={cfg.badge_font_size}:"
            f"fontcolor={cfg.badge_font_color}:"
            f"x={badge_pad + (badge_w - cfg.badge_font_size*len(cfg.badge_text)*0.55)//2}:"
            f"y={badge_y}[badge_label]"
        )

        # Headline text (starts after badge)
        hl_x  = badge_w + badge_pad * 2 + 8
        hl_y  = f"{bar_y}+({bh}-{cfg.headline_font_size})/2"
        hl_w  = W - hl_x - 10          # clip at right edge
        headline_esc = self._esc(cfg.headline)

        parts.append(
            f"[badge_label]drawtext="
            f"fontfile='{f}':"
            f"text='{headline_esc}':"
            f"fontsize={cfg.headline_font_size}:"
            f"fontcolor={cfg.headline_font_color}:"
            f"x={hl_x}:y={hl_y}:"
            f"shadowcolor=black@0.5:shadowx=1:shadowy=1[headline]"
        )
        prev = "headline"

        # ── 4. Ticker bar ────────────────────────────────────────────────────
        tick_y = H - cfg.ticker_height
        parts.append(
            f"[{prev}]drawbox=x=0:y={tick_y}:w={W}:h={cfg.ticker_height}"
            f":color={cfg.ticker_bar_color}:t=fill[tickerbar]"
        )

        # Scrolling ticker — x starts at W and moves left over time
        # Speed: pixels/second = ticker_speed
        # x = W - (ticker_speed * t)   →  mod (W + text_w) to loop
        ticker_esc = self._esc(cfg.ticker_text)
        ticker_y   = f"{tick_y}+({cfg.ticker_height}-{cfg.ticker_font_size})/2"
        scroll_x   = f"w-mod(t*{cfg.ticker_speed}\\,w+tw)"

        parts.append(
            f"[tickerbar]drawtext="
            f"fontfile='{f}':"
            f"text='{ticker_esc}':"
            f"fontsize={cfg.ticker_font_size}:"
            f"fontcolor={cfg.ticker_font_color}:"
            f"x={scroll_x}:"
            f"y={ticker_y}[out]"
        )

        return ";".join(parts)


# ── RUNNER ───────────────────────────────────────────────────────────────────

def _build_ffmpeg_cmd(
    input_path: str,
    output_path: str,
    filter_complex: str,
    cfg: OverlayConfig,
    use_docker: bool = False,
    work_dir: Optional[str] = None,
) -> list[str]:
    """Assemble the full FFmpeg command list."""

    if use_docker:
        # Map current working directory into /work inside the container
        cwd = work_dir or os.getcwd()
        rel_in  = os.path.relpath(input_path,  cwd)
        rel_out = os.path.relpath(output_path, cwd)
        d_in    = f"/work/{rel_in}"
        d_out   = f"/work/{rel_out}"
        d_font  = cfg.font_path   # already inside the container

        prefix = [
            "docker", "run", "--rm",
            "-v", f"{cwd}:/work",
            FFMPEG_DOCKER_IMAGE,
        ]
        in_arg, out_arg = d_in, d_out
        # Re-build filter_complex with docker font path (already set via cfg)
    else:
        prefix = ["ffmpeg"]
        in_arg, out_arg = input_path, output_path

    return [
        *prefix,
        "-i", in_arg,
        "-filter_complex", filter_complex,
        "-map", "[out]",        # mapped video from filter
        "-map", "0:a?",         # original audio (optional)
        "-c:v", "libx264",
        "-preset", cfg.preset,
        "-crf", str(cfg.crf),
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "copy",         # keep original audio unchanged
        "-y",
        out_arg,
    ]


def process_video(
    input_path: str,
    output_path: str,
    cfg: Optional[OverlayConfig] = None,
    use_docker: bool = False,
    work_dir: Optional[str] = None,
    verbose: bool = True,
) -> None:
    """
    Apply news overlay to *input_path* and write result to *output_path*.

    Args:
        input_path:  Path to the source video.
        output_path: Destination path for the processed video.
        cfg:         OverlayConfig instance (defaults used if None).
        use_docker:  Run inside jrottenberg/ffmpeg Docker container.
        work_dir:    Host directory mounted as /work in Docker (default: cwd).
        verbose:     Print FFmpeg stderr to console.
    """
    if cfg is None:
        cfg = OverlayConfig()

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    flt = NewsOverlayFilter(cfg)
    filter_complex = flt.build()

    cmd = _build_ffmpeg_cmd(
        input_path, output_path, filter_complex, cfg,
        use_docker=use_docker, work_dir=work_dir,
    )

    if verbose:
        print("── FFmpeg command ──────────────────────────────────────────────")
        # Pretty-print with line breaks for readability
        readable = " \\\n    ".join(shlex.quote(a) for a in cmd)
        print(readable)
        print("────────────────────────────────────────────────────────────────")

    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE if not verbose else None,
        text=True,
    )

    if result.returncode != 0:
        err = result.stderr or "(captured above)"
        raise RuntimeError(f"FFmpeg failed (exit {result.returncode}):\n{err}")

    if verbose:
        print(f"\n✅  Output written to: {output_path}")


# ── INTEGRATION WITH YOUR EXISTING process_video() ───────────────────────────

def process_video_with_news_overlay(
    video_id: str,
    input_path: str,
    output_dir: str,
    channel_name: str = "NEWS 24",
    headline: str = "BREAKING NEWS",
    ticker: str = "Stay tuned for more updates",
    use_docker: bool = False,
) -> dict:
    """
    Drop-in replacement for your existing process_video() function.
    Adds news overlay before the MP4 step, then generates HLS + WebM from it.

    Returns dict with mp4/hls/webm paths (same shape as your original).
    """
    try:
        # ── Lazy import (only needed inside the platform) ────────────────────
        from utils.mongo_model import update_video_status, VideoStatus  # type: ignore
        _has_mongo = True
    except ImportError:
        _has_mongo = False

    def _status(s, msg=""):
        if _has_mongo:
            update_video_status(video_id, s, msg)

    _status("processing")

    hls_dir  = os.path.join(output_dir, "hls")
    mp4_dir  = os.path.join(output_dir, "mp4")
    webm_dir = os.path.join(output_dir, "webm")
    for d in (hls_dir, mp4_dir, webm_dir):
        os.makedirs(d, exist_ok=True)

    overlaid_path = os.path.join(mp4_dir, "output.mp4")
    hls_out       = os.path.join(hls_dir, "master.m3u8")
    webm_out      = os.path.join(webm_dir, "output.webm")

    # ── Step 1: Apply overlay + encode MP4 ───────────────────────────────────
    cfg = OverlayConfig(
        channel_name = channel_name,
        headline     = headline,
        ticker_text  = ticker,
    )
    try:
        process_video(
            input_path   = input_path,
            output_path  = overlaid_path,
            cfg          = cfg,
            use_docker   = use_docker,
        )
    except RuntimeError as e:
        _status("failed", str(e))
        raise

    # ── Step 2: HLS from MP4 (stream copy — no re-encode) ────────────────────
    _run_ffmpeg([
        "-i", overlaid_path,
        "-c", "copy",
        "-start_number", "0",
        "-hls_time", "6",
        "-hls_list_size", "0",
        "-f", "hls",
        hls_out,
        "-y",
    ], label="HLS generation")

    # ── Step 3: WebM ─────────────────────────────────────────────────────────
    _run_ffmpeg([
        "-i", overlaid_path,
        "-c:v", "libvpx-vp9",
        "-b:v", "1M",
        "-c:a", "libopus",
        "-y",
        webm_out,
    ], label="WebM generation")

    _status("ready")
    return {"mp4": overlaid_path, "hls": hls_out, "webm": webm_out}


def _run_ffmpeg(args: list[str], label: str = "") -> None:
    """Run ffmpeg with the given argument list and raise on failure."""
    cmd = ["ffmpeg"] + args
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"{label} failed:\n{result.stderr}")


# ── CLI ──────────────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Add a news-style overlay to a video using FFmpeg filters."
    )
    p.add_argument("--input",   required=True,  help="Input video path")
    p.add_argument("--output",  required=True,  help="Output video path")
    p.add_argument("--channel", default="NEWS 24",     help="Channel name (top bar)")
    p.add_argument("--headline",default="BREAKING NEWS",help="Headline text (bottom bar)")
    p.add_argument("--ticker",  default="Stay tuned for latest updates • More information to follow",
                   help="Scrolling ticker text")
    p.add_argument("--width",   type=int, default=1280, help="Output width  (default 1280)")
    p.add_argument("--height",  type=int, default=720,  help="Output height (default 720)")
    p.add_argument("--no-border",   action="store_true", help="Disable red border")
    p.add_argument("--ticker-speed",type=int, default=120, help="Ticker pixels/sec (default 120)")
    p.add_argument("--font",    default=None, help="Override font file path")
    p.add_argument("--docker",  action="store_true", help="Run inside Docker container")
    p.add_argument("--crf",     type=int, default=23, help="H.264 CRF value (default 23)")
    p.add_argument("--preset",  default="fast", help="H.264 preset (default fast)")
    return p.parse_args()


def main() -> None:
    args = _parse_args()

    cfg = OverlayConfig(
        channel_name   = args.channel,
        headline       = args.headline,
        ticker_text    = args.ticker,
        target_width   = args.width,
        target_height  = args.height,
        add_border     = not args.no_border,
        ticker_speed   = args.ticker_speed,
        crf            = args.crf,
        preset         = args.preset,
    )
    if args.font:
        cfg.font_path = args.font

    process_video(
        input_path  = args.input,
        output_path = args.output,
        cfg         = cfg,
        use_docker  = args.docker,
        verbose     = True,
    )


if __name__ == "__main__":
    main()