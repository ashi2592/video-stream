"""
news_overlay.py — FFmpeg-based news-style video overlay processor
Runs inside jrottenberg/ffmpeg Docker container or natively with ffmpeg installed.

Usage:
    # Single video with overlay
    python news_overlay.py --input input.mp4 --output output.mp4 \
        --channel "NEWS 24" \
        --headline "BREAKING: Major earthquake strikes Pacific coast" \
        --ticker "Markets fall 3% as Fed signals rate hike • Tech stocks lead decline"
    
    # Multi-video layout
    python news_overlay.py --layout split-horizontal \
        --input1 main.mp4 --input2 side.mp4 \
        --output output.mp4 \
        --channel "NEWS 24" \
        --headline "BREAKING: Multiple angles of the event"
    
    # Multi-video with side text flash
    python news_overlay.py --layout side-text \
        --input main.mp4 \
        --flash-text "LIVE: Emergency services responding" \
        --flash-interval 3 \
        --flash-duration 2
"""

import subprocess
import os
import sys
import argparse
import shlex
import json
from dataclasses import dataclass, field
from typing import Optional, List, Tuple
from enum import Enum


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


class LayoutType(Enum):
    """Multi-video layout types."""
    SINGLE = "single"
    SPLIT_HORIZONTAL = "split-horizontal"
    SPLIT_VERTICAL = "split-vertical"
    PICTURE_IN_PICTURE = "pip"
    SIDE_TEXT = "side-text"
    GRID_2X2 = "grid-2x2"
    THREE_COLUMN = "three-column"


@dataclass
class VideoInput:
    """Configuration for a video input."""
    path: str
    x: int = 0
    y: int = 0
    width: int = 0
    height: int = 0
    volume: float = 1.0
    label: str = ""


@dataclass
class TextFlash:
    """Configuration for flashing text on side."""
    text: str = ""
    interval: int = 3  # seconds between flashes
    duration: int = 2  # seconds each flash lasts
    position: str = "right"  # left, right, top, bottom
    font_size: int = 24
    font_color: str = "yellow"
    background_color: str = "0x000000@0.8"


@dataclass
class OverlayConfig:
    """All tuneable parameters for the news overlay."""

    # Multi-video layout
    layout: LayoutType = LayoutType.SINGLE
    video_inputs: List[VideoInput] = field(default_factory=list)
    text_flash: Optional[TextFlash] = None

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


# ── MULTI-VIDEO LAYOUT BUILDER ───────────────────────────────────────────────

class MultiVideoLayoutBuilder:
    """Builds FFmpeg filter_complex for multi-video layouts."""

    def __init__(self, cfg: OverlayConfig):
        self.cfg = cfg
        self.W = cfg.target_width
        self.H = cfg.target_height
        self.input_count = len(cfg.video_inputs)

    def _calculate_layout_positions(self) -> List[Tuple[int, int, int, int]]:
        """Calculate x, y, width, height for each video based on layout."""
        positions = []
        
        if self.cfg.layout == LayoutType.SPLIT_HORIZONTAL:
            # Side by side
            width = self.W // self.input_count
            for i in range(self.input_count):
                positions.append((i * width, 0, width, self.H))
                
        elif self.cfg.layout == LayoutType.SPLIT_VERTICAL:
            # Top and bottom
            height = self.H // self.input_count
            for i in range(self.input_count):
                positions.append((0, i * height, self.W, height))
                
        elif self.cfg.layout == LayoutType.PICTURE_IN_PICTURE:
            # Main video full screen, others as PIP
            positions.append((0, 0, self.W, self.H))  # main
            pip_width = self.W // 3
            pip_height = self.H // 3
            for i in range(1, self.input_count):
                x = self.W - pip_width - 10
                y = 10 + (i - 1) * (pip_height + 10)
                positions.append((x, y, pip_width, pip_height))
                
        elif self.cfg.layout == LayoutType.GRID_2X2:
            # 2x2 grid
            width = self.W // 2
            height = self.H // 2
            positions = [
                (0, 0, width, height),
                (width, 0, width, height),
                (0, height, width, height),
                (width, height, width, height)
            ]
            
        elif self.cfg.layout == LayoutType.THREE_COLUMN:
            # Three columns: left (30%), center (40%), right (30%)
            col1_w = int(self.W * 0.3)
            col2_w = int(self.W * 0.4)
            col3_w = self.W - col1_w - col2_w
            
            positions = [
                (0, 0, col1_w, self.H),
                (col1_w, 0, col2_w, self.H),
                (col1_w + col2_w, 0, col3_w, self.H)
            ]
            
        elif self.cfg.layout == LayoutType.SIDE_TEXT:
            # Main video on left, text flash on right
            video_width = int(self.W * 0.7)
            positions.append((0, 0, video_width, self.H))
            
        else:
            # Single video
            positions.append((0, 0, self.W, self.H))
            
        return positions

    def _build_scale_filter(self, input_idx: int, pos: Tuple[int, int, int, int]) -> str:
        """Build scale filter for a single video input."""
        x, y, w, h = pos
        return f"[{input_idx}:v]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black[v{input_idx}_scaled]"

    def _build_overlay_chain(self, input_count: int) -> str:
        """Build overlay chain to combine multiple videos."""
        if input_count == 1:
            return "[v0_scaled]"
        
        overlay_chain = "[v0_scaled]"
        for i in range(1, input_count):
            overlay_chain += f"[v{i}_scaled]overlay={self.cfg.video_inputs[i].x}:{self.cfg.video_inputs[i].y}[tmp{i}]"
            if i < input_count - 1:
                overlay_chain += f"[tmp{i}]"
        
        # The final output from overlay chain
        if input_count > 1:
            overlay_chain += f"[combined]"
        else:
            overlay_chain += f"[combined]"
            
        return overlay_chain

    def build_video_composition(self) -> str:
        """Build filter graph for video composition."""
        if self.input_count == 0:
            raise ValueError("No video inputs specified")
        
        # Update positions from layout if not manually set
        positions = self._calculate_layout_positions()
        for i, pos in enumerate(positions):
            if i < len(self.cfg.video_inputs):
                self.cfg.video_inputs[i].x = pos[0]
                self.cfg.video_inputs[i].y = pos[1]
                self.cfg.video_inputs[i].width = pos[2]
                self.cfg.video_inputs[i].height = pos[3]
        
        # Build scale filters for each input
        scale_filters = []
        for i, inp in enumerate(self.cfg.video_inputs):
            scale_filters.append(self._build_scale_filter(i, (inp.x, inp.y, inp.width, inp.height)))
        
        # Build overlay chain
        overlay_chain = self._build_overlay_chain(self.input_count)
        
        # Combine all filters
        filters = ";".join(scale_filters) + ";" + overlay_chain
        
        return filters


class TextFlashBuilder:
    """Builds FFmpeg filter for flashing text animations."""

    def __init__(self, cfg: OverlayConfig):
        self.cfg = cfg
        self.W = cfg.target_width
        self.H = cfg.target_height
        self.f = cfg.font_path

    def _esc(self, text: str) -> str:
        """Escape special characters for FFmpeg drawtext."""
        return (
            text
            .replace("\\", "\\\\")
            .replace("'",  "\u2019")
            .replace(":",  "\\:")
            .replace("%",  "\\%")
            .replace("[",  "\\[")
            .replace("]",  "\\]")
        )

    def build_flash_filter(self, video_input: str) -> str:
        """Build filter for flashing text overlay."""
        if not self.cfg.text_flash:
            return video_input
            
        flash = self.cfg.text_flash
        
        # Calculate text position
        if flash.position == "right":
            x = self.W - 200
            y = f"(h-text_h)/2"
        elif flash.position == "left":
            x = 20
            y = f"(h-text_h)/2"
        elif flash.position == "top":
            x = f"(w-text_w)/2"
            y = 20
        else:  # bottom
            x = f"(w-text_w)/2"
            y = self.H - 100
        
        # Create flashing effect using expression
        # Flash every 'interval' seconds, lasting 'duration' seconds
        flash_expr = f"lt(mod(t,{flash.interval}),{flash.duration})"
        
        flash_filter = (
            f"[{video_input}]drawtext="
            f"fontfile='{self.f}':"
            f"text='{self._esc(flash.text)}':"
            f"fontsize={flash.font_size}:"
            f"fontcolor={flash.font_color}:"
            f"box=1:boxcolor={flash.background_color}:boxborderw=10:"
            f"x={x}:y={y}:"
            f"enable='{flash_expr}'[flashed]"
        )
        
        return flash_filter


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

    def build(self) -> Tuple[str, List[str]]:
        """
        Return the complete filter_complex string and list of input mappings.
        
        Returns:
            Tuple of (filter_complex, input_mappings)
        """
        cfg = self.cfg
        W, H = self.W, self.H
        f    = self.f

        parts = []
        input_mappings = []

        # ── 0. Multi-video composition (if needed) ─────────────────────────────
        if cfg.layout != LayoutType.SINGLE and len(cfg.video_inputs) > 1:
            video_builder = MultiVideoLayoutBuilder(cfg)
            video_composition = video_builder.build_video_composition()
            parts.append(video_composition)
            prev = "combined"
            
            # Handle audio mixing for multiple videos
            if len(cfg.video_inputs) > 1:
                audio_filters = []
                for i, inp in enumerate(cfg.video_inputs):
                    if inp.volume != 1.0:
                        audio_filters.append(f"[{i}:a]volume={inp.volume}[a{i}]")
                    else:
                        audio_filters.append(f"[{i}:a]anull[a{i}]")
                
                # Mix all audio streams
                audio_inputs = "".join([f"[a{i}]" for i in range(len(cfg.video_inputs))])
                audio_mix = f"{audio_inputs}amix=inputs={len(cfg.video_inputs)}:duration=longest[aout]"
                parts.extend(audio_filters)
                parts.append(audio_mix)
                input_mappings.append("-map")
                input_mappings.append("[aout]")
            else:
                input_mappings.extend(["-map", "0:a?"])
        else:
            # Single video - use first input
            parts.append(
                f"[0:v]scale={W}:{H}:force_original_aspect_ratio=decrease,"
                f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black[scaled]"
            )
            prev = "scaled"
            input_mappings.extend(["-map", "0:a?"])

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
            f"y={ticker_y}[tickered]"
        )
        prev = "tickered"

        # ── 5. Text flash overlay (for side-text layout) ──────────────────────
        if cfg.layout == LayoutType.SIDE_TEXT and cfg.text_flash:
            flash_builder = TextFlashBuilder(cfg)
            flash_filter = flash_builder.build_flash_filter(prev)
            parts.append(flash_filter)
            prev = "flashed"

        # Final output mapping
        input_mappings.extend(["-map", f"[{prev}]"])
        
        return ";".join(parts), input_mappings


# ── RUNNER ───────────────────────────────────────────────────────────────────

def _build_ffmpeg_cmd(
    input_paths: List[str],
    output_path: str,
    filter_complex: str,
    input_mappings: List[str],
    cfg: OverlayConfig,
    use_docker: bool = False,
    work_dir: Optional[str] = None,
) -> list[str]:
    """Assemble the full FFmpeg command list for multiple inputs."""
    
    if use_docker:
        cwd = work_dir or os.getcwd()
        docker_inputs = []
        for inp in input_paths:
            rel_in = os.path.relpath(inp, cwd)
            docker_inputs.append(f"/work/{rel_in}")
        
        d_out = os.path.relpath(output_path, cwd)
        d_out = f"/work/{d_out}"
        
        prefix = [
            "docker", "run", "--rm",
            "-v", f"{cwd}:/work",
            FFMPEG_DOCKER_IMAGE,
        ]
        # Build input args
        input_args = []
        for d_in in docker_inputs:
            input_args.extend(["-i", d_in])
        return prefix + input_args + [
            "-filter_complex", filter_complex,
            *input_mappings,
            "-c:v", "libx264",
            "-preset", cfg.preset,
            "-crf", str(cfg.crf),
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-c:a", "aac" if len(input_paths) > 1 else "copy",
            "-y",
            d_out,
        ]
    else:
        input_args = []
        for inp in input_paths:
            input_args.extend(["-i", inp])
        return [
            "ffmpeg",
            *input_args,
            "-filter_complex", filter_complex,
            *input_mappings,
            "-c:v", "libx264",
            "-preset", cfg.preset,
            "-crf", str(cfg.crf),
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-c:a", "aac" if len(input_paths) > 1 else "copy",
            "-y",
            output_path,
        ]


def process_video_multi(
    input_paths: List[str],
    output_path: str,
    cfg: Optional[OverlayConfig] = None,
    use_docker: bool = False,
    work_dir: Optional[str] = None,
    verbose: bool = True,
) -> None:
    """
    Apply news overlay to multiple videos and write result to output_path.

    Args:
        input_paths: List of input video paths.
        output_path: Destination path for the processed video.
        cfg: OverlayConfig instance (defaults used if None).
        use_docker: Run inside jrottenberg/ffmpeg Docker container.
        work_dir: Host directory mounted as /work in Docker (default: cwd).
        verbose: Print FFmpeg stderr to console.
    """
    if cfg is None:
        cfg = OverlayConfig()
    
    # Setup video inputs if not already configured
    if not cfg.video_inputs:
        cfg.video_inputs = [VideoInput(path=p) for p in input_paths]

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    flt = NewsOverlayFilter(cfg)
    filter_complex, input_mappings = flt.build()

    cmd = _build_ffmpeg_cmd(
        input_paths, output_path, filter_complex, input_mappings, cfg,
        use_docker=use_docker, work_dir=work_dir,
    )

    if verbose:
        print("── FFmpeg command ──────────────────────────────────────────────")
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


# ── CLI ──────────────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Add a news-style overlay to video(s) using FFmpeg filters."
    )
    p.add_argument("--input", nargs="+", help="Input video path(s)")
    p.add_argument("--output", required=True, help="Output video path")
    p.add_argument("--channel", default="NEWS 24", help="Channel name (top bar)")
    p.add_argument("--headline", default="BREAKING NEWS", help="Headline text (bottom bar)")
    p.add_argument("--ticker", default="Stay tuned for latest updates • More information to follow",
                   help="Scrolling ticker text")
    p.add_argument("--width", type=int, default=1280, help="Output width (default 1280)")
    p.add_argument("--height", type=int, default=720, help="Output height (default 720)")
    p.add_argument("--no-border", action="store_true", help="Disable red border")
    p.add_argument("--ticker-speed", type=int, default=120, help="Ticker pixels/sec (default 120)")
    p.add_argument("--font", default=None, help="Override font file path")
    p.add_argument("--docker", action="store_true", help="Run inside Docker container")
    p.add_argument("--crf", type=int, default=23, help="H.264 CRF value (default 23)")
    p.add_argument("--preset", default="fast", help="H.264 preset (default fast)")
    
    # Multi-video layout options
    p.add_argument("--layout", choices=[l.value for l in LayoutType], default="single",
                   help="Multi-video layout type")
    p.add_argument("--input1", help="First input video (for split layouts)")
    p.add_argument("--input2", help="Second input video (for split layouts)")
    p.add_argument("--input3", help="Third input video (for three-column layout)")
    
    # Text flash options
    p.add_argument("--flash-text", help="Text to flash on side")
    p.add_argument("--flash-interval", type=int, default=3, help="Seconds between flashes")
    p.add_argument("--flash-duration", type=int, default=2, help="Seconds each flash lasts")
    p.add_argument("--flash-position", choices=["left", "right", "top", "bottom"], default="right",
                   help="Position of flashing text")
    
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    
    # Collect input paths
    input_paths = []
    if args.input:
        input_paths = args.input
    else:
        # Handle individual input arguments
        for i in [1, 2, 3]:
            inp = getattr(args, f"input{i}", None)
            if inp:
                input_paths.append(inp)
    
    if not input_paths:
        print("Error: No input videos specified")
        sys.exit(1)
    
    # Setup text flash if specified
    text_flash = None
    if args.flash_text:
        text_flash = TextFlash(
            text=args.flash_text,
            interval=args.flash_interval,
            duration=args.flash_duration,
            position=args.flash_position
        )
    
    # Create video inputs
    video_inputs = [VideoInput(path=p) for p in input_paths]
    
    cfg = OverlayConfig(
        layout=LayoutType(args.layout),
        video_inputs=video_inputs,
        text_flash=text_flash,
        channel_name=args.channel,
        headline=args.headline,
        ticker_text=args.ticker,
        target_width=args.width,
        target_height=args.height,
        add_border=not args.no_border,
        ticker_speed=args.ticker_speed,
        crf=args.crf,
        preset=args.preset,
    )
    if args.font:
        cfg.font_path = args.font
    
    process_video_multi(
        input_paths=input_paths,
        output_path=args.output,
        cfg=cfg,
        use_docker=args.docker,
        verbose=True,
    )


if __name__ == "__main__":
    main()