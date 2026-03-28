"""
news_overlay.py — FFmpeg-based news-style video overlay processor
Runs inside jrottenberg/ffmpeg Docker container or natively with ffmpeg installed.

Usage:
    # Single video with overlay (original functionality)
    python news_overlay.py --input input.mp4 --output output.mp4 \
        --channel "NEWS 24" \
        --headline "BREAKING: Major earthquake strikes Pacific coast" \
        --ticker "Markets fall 3% as Fed signals rate hike • Tech stocks lead decline"
    
    # Multi-video layout with audio mixing
    python news_overlay.py --layout split-horizontal \
        --input1 main.mp4 --input2 side.mp4 \
        --audio-mix "0.7,1.0" \
        --output output.mp4
        --docker
    
    # Add background music with ducking
    python news_overlay.py --input input.mp4 --output output.mp4 \
        --background-music music.mp3 \
        --music-volume 0.3 \
        --ducking-threshold 0.5 \
        --ducking-attack 0.1 \
        --ducking-release 0.5
    
    # Add voiceover overlay
    python news_overlay.py --input input.mp4 --output output.mp4 \
        --voiceover voiceover.mp3 \
        --voiceover-volume 1.2 \
        --voiceover-start 5
"""

import subprocess
import os
import sys
import argparse
import shlex
import json
import math
from dataclasses import dataclass, field
from typing import Optional, List, Tuple, Union, Dict, Any
from enum import Enum


# ── CONFIG ───────────────────────────────────────────────────────────────────

# Docker image used by jrottenberg/ffmpeg
FFMPEG_DOCKER_IMAGE = os.getenv("FFMPEG_DOCKER_IMAGE", "jrottenberg/ffmpeg:latest")

# Font path — adjust for your OS/container.
FONT_PATH_ALPINE  = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_PATH_UBUNTU  = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_PATH_MAC     = "/Library/Fonts/Arial Bold.ttf"
FONT_PATH_WINDOWS = "C\\:/Windows/Fonts/arialbd.ttf"

def _detect_font() -> str:
    """Return best available font path for the current environment."""
    for path in (FONT_PATH_ALPINE, FONT_PATH_UBUNTU):
        if os.path.exists(path):
            return path
    if sys.platform == "darwin":
        return FONT_PATH_MAC
    if sys.platform == "win32":
        return FONT_PATH_WINDOWS
    return FONT_PATH_ALPINE


class LayoutType(Enum):
    """Multi-video layout types."""
    SINGLE = "single"
    SPLIT_HORIZONTAL = "split-horizontal"
    SPLIT_VERTICAL = "split-vertical"
    PICTURE_IN_PICTURE = "pip"
    SIDE_TEXT = "side-text"
    GRID_2X2 = "grid-2x2"
    THREE_COLUMN = "three-column"


class AudioTransitionType(Enum):
    """Audio transition types."""
    CROSSFADE = "crossfade"
    FADE_IN = "fadein"
    FADE_OUT = "fadeout"
    NONE = "none"


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
    audio_start: float = 0.0  # Start time in seconds
    audio_duration: Optional[float] = None  # Duration in seconds


@dataclass
class AudioTrack:
    """Configuration for an audio track."""
    path: str
    volume: float = 1.0
    start: float = 0.0
    duration: Optional[float] = None
    transition: AudioTransitionType = AudioTransitionType.NONE
    transition_duration: float = 1.0
    label: str = ""


@dataclass
class AudioDucking:
    """Audio ducking configuration (reduce background when speech detected)."""
    enabled: bool = False
    threshold: float = 0.5  # Volume threshold to trigger ducking
    attack: float = 0.1     # Time to reduce volume (seconds)
    release: float = 0.5    # Time to restore volume (seconds)
    ducked_volume: float = 0.2  # Volume when ducking is active
    normal_volume: float = 1.0   # Normal volume


@dataclass
class TextFlash:
    """Configuration for flashing text on side."""
    text: str = ""
    interval: int = 3
    duration: int = 2
    position: str = "right"
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

    # Audio configuration
    audio_tracks: List[AudioTrack] = field(default_factory=list)
    audio_mix_weights: Optional[List[float]] = None  # Weights for mixing multiple audio streams
    audio_ducking: Optional[AudioDucking] = None
    background_music: Optional[str] = None
    background_music_volume: float = 0.3
    voiceover: Optional[str] = None
    voiceover_volume: float = 1.0
    voiceover_start: float = 0.0
    enable_audio_normalization: bool = False
    target_audio_level: float = -16.0  # LUFS target for normalization

    # Content
    channel_name:   str = "NEWS 24"
    headline:       str = "BREAKING NEWS"
    ticker_text:    str = "Latest updates • Stay tuned for more"

    # Top bar
    top_bar_color:      str = "0x1a1a2e@0.92"
    top_bar_height:     int = 52
    channel_font_size:  int = 28
    channel_font_color: str = "white"

    # Bottom headline bar
    bottom_bar_color:       str = "0xc0392b@0.95"
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
    ticker_font_color: str = "0xf1c40f"
    ticker_speed:      int = 120

    # Border
    add_border:     bool  = True
    border_color:   str   = "0xc0392b"
    border_width:   int   = 3

    # Font
    font_path: str = field(default_factory=_detect_font)

    # Output
    target_width:  int = 1280
    target_height: int = 720
    crf:           int = 23
    preset:        str = "fast"
    audio_bitrate: str = "128k"
    audio_codec:   str = "aac"


# ── AUDIO PROCESSOR ──────────────────────────────────────────────────────────

class AudioProcessor:
    """Handles all audio processing including mixing, ducking, and transitions."""

    def __init__(self, cfg: OverlayConfig, total_inputs: int):
        self.cfg = cfg
        self.total_inputs = total_inputs

    def _build_volume_filter(self, input_idx: int, track: VideoInput) -> str:
        """Build volume filter for a video track."""
        if track.volume != 1.0:
            return f"[{input_idx}:a]volume={track.volume}:precision=float[a{input_idx}_vol]"
        return f"[{input_idx}:a]anull[a{input_idx}_vol]"

    def _build_trim_filter(self, input_idx: int, track: VideoInput) -> str:
        """Build trim filter for audio track."""
        if track.audio_start > 0 or track.audio_duration is not None:
            start = track.audio_start
            if track.audio_duration is None:
                # FIX: was using the string literal "duration" as an FFmpeg parameter value,
                # which is invalid. When no end time is specified, just trim from start.
                return f"[a{input_idx}_vol]atrim=start={start}[a{input_idx}_trim]"
            else:
                return f"[a{input_idx}_vol]atrim=start={start}:duration={track.audio_duration}[a{input_idx}_trim]"
        return f"[a{input_idx}_vol]anull[a{input_idx}_trim]"

    def _build_mix_filter(self, audio_inputs: List[str], weights: Optional[List[float]] = None) -> List[str]:
        """
        Build audio mixing filter with optional weights.

        FIX: was a broken generator — used `yield` but typed/called as a regular
        method returning a list. The weighted branch also built a `weighted_inputs`
        list of labels that were never wired into the filter graph.  Rewritten as a
        plain method that returns a list of filter strings.
        """
        if not audio_inputs:
            return []

        filters = []

        if weights and len(weights) == len(audio_inputs):
            # Apply per-stream volume adjustments, then mix the resulting labels.
            weighted_labels = []
            for i, (input_label, weight) in enumerate(zip(audio_inputs, weights)):
                out_label = f"weighted_{i}"
                filters.append(f"[{input_label}]volume={weight}[{out_label}]")
                weighted_labels.append(out_label)
            inputs_str = "".join(f"[{lbl}]" for lbl in weighted_labels)
            n = len(weighted_labels)
        else:
            inputs_str = "".join(f"[{inp}]" for inp in audio_inputs)
            n = len(audio_inputs)

        filters.append(
            f"{inputs_str}amix=inputs={n}:duration=longest:normalize=0[audio_mixed]"
        )
        return filters

    def _build_ducking_filter(self, audio_input: str) -> str:
        """
        Build audio ducking filter using sidechain compression.

        FIX: the input label was being double-bracketed — the caller passes a bare
        label name (e.g. "audio_mixed") but the filter string was wrapping it in
        [...] *and* the compand syntax itself was wrong.  Corrected bracket usage
        and kept the compand expression valid.
        """
        if not self.cfg.audio_ducking or not self.cfg.audio_ducking.enabled:
            return f"[{audio_input}]anull[audio_ducked]"

        ducking = self.cfg.audio_ducking
        threshold_db = 20 * math.log10(max(ducking.threshold, 1e-9))
        ducked_db    = 20 * math.log10(max(ducking.ducked_volume, 1e-9))
        normal_db    = 20 * math.log10(max(ducking.normal_volume, 1e-9))
        return (
            f"[{audio_input}]compand="
            f"attacks={ducking.attack}:decays={ducking.release}:"
            f"points=-80/-80|{threshold_db:.1f}/{ducked_db:.1f}|0/{normal_db:.1f}"
            f"[audio_ducked]"
        )

    def _build_background_music(self) -> Tuple[List[str], str]:
        """Add background music to the audio mix."""
        if not self.cfg.background_music:
            return [], ""

        filters = []
        music_input_idx = self.total_inputs
        music_input = f"[{music_input_idx}:a]"

        # Apply volume
        if self.cfg.background_music_volume != 1.0:
            filters.append(f"{music_input}volume={self.cfg.background_music_volume}[bg_music]")
        else:
            filters.append(f"{music_input}anull[bg_music]")

        return filters, "bg_music"

    def _build_voiceover(self) -> Tuple[List[str], str]:
        """Add voiceover track with optional start time."""
        if not self.cfg.voiceover:
            return [], ""

        filters = []
        vo_input_idx = self.total_inputs + (1 if self.cfg.background_music else 0)
        vo_input = f"[{vo_input_idx}:a]"

        # Trim if needed
        if self.cfg.voiceover_start > 0:
            filters.append(f"{vo_input}adelay={int(self.cfg.voiceover_start * 1000)}|{int(self.cfg.voiceover_start * 1000)}[vo_delayed]")
            vo_input = "[vo_delayed]"

        # Apply volume
        if self.cfg.voiceover_volume != 1.0:
            filters.append(f"{vo_input}volume={self.cfg.voiceover_volume}[vo_vol]")
        else:
            filters.append(f"{vo_input}anull[vo_vol]")

        return filters, "vo_vol"

    def _build_normalization(self, audio_input: str) -> str:
        """
        Apply audio normalization (loudnorm).

        FIX: same double-bracket bug as _build_ducking_filter — caller passes a
        bare label name; the method must add the brackets itself.
        """
        if not self.cfg.enable_audio_normalization:
            return f"[{audio_input}]anull[audio_normalized]"

        target = self.cfg.target_audio_level
        return f"[{audio_input}]loudnorm=I={target}:TP=-1.5:LRA=11[audio_normalized]"

    def build_audio_graph(self) -> Tuple[List[str], str, List[str]]:
        """
        Build the complete audio processing graph.

        Returns:
            Tuple of (filter_parts, final_audio_label, extra_input_args)
        """
        filters = []
        audio_inputs = []
        input_mappings = []

        # Process video audio tracks
        for i, video_input in enumerate(self.cfg.video_inputs):
            filters.append(self._build_volume_filter(i, video_input))
            filters.append(self._build_trim_filter(i, video_input))
            audio_inputs.append(f"a{i}_trim")

        # Add background music
        if self.cfg.background_music:
            bg_filters, bg_label = self._build_background_music()
            filters.extend(bg_filters)
            audio_inputs.append(bg_label)
            input_mappings.extend(["-i", self.cfg.background_music])

        # Add voiceover
        if self.cfg.voiceover:
            vo_filters, vo_label = self._build_voiceover()
            filters.extend(vo_filters)
            audio_inputs.append(vo_label)
            input_mappings.extend(["-i", self.cfg.voiceover])

        # Mix all audio streams
        mix_filters = self._build_mix_filter(audio_inputs, self.cfg.audio_mix_weights)
        filters.extend(mix_filters)

        # Apply ducking if configured
        filters.append(self._build_ducking_filter("audio_mixed"))

        # Apply normalization
        filters.append(self._build_normalization("audio_ducked"))

        return filters, "audio_normalized", input_mappings


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
            width = self.W // self.input_count
            for i in range(self.input_count):
                positions.append((i * width, 0, width, self.H))

        elif self.cfg.layout == LayoutType.SPLIT_VERTICAL:
            height = self.H // self.input_count
            for i in range(self.input_count):
                positions.append((0, i * height, self.W, height))

        elif self.cfg.layout == LayoutType.PICTURE_IN_PICTURE:
            positions.append((0, 0, self.W, self.H))
            pip_width = self.W // 3
            pip_height = self.H // 3
            for i in range(1, self.input_count):
                x = self.W - pip_width - 10
                y = 10 + (i - 1) * (pip_height + 10)
                positions.append((x, y, pip_width, pip_height))

        elif self.cfg.layout == LayoutType.GRID_2X2:
            width = self.W // 2
            height = self.H // 2
            positions = [
                (0, 0, width, height),
                (width, 0, width, height),
                (0, height, width, height),
                (width, height, width, height)
            ]

        elif self.cfg.layout == LayoutType.THREE_COLUMN:
            col1_w = int(self.W * 0.3)
            col2_w = int(self.W * 0.4)
            col3_w = self.W - col1_w - col2_w
            positions = [
                (0, 0, col1_w, self.H),
                (col1_w, 0, col2_w, self.H),
                (col1_w + col2_w, 0, col3_w, self.H)
            ]

        elif self.cfg.layout == LayoutType.SIDE_TEXT:
            video_width = int(self.W * 0.7)
            positions.append((0, 0, video_width, self.H))

        else:
            positions.append((0, 0, self.W, self.H))

        return positions

    def _build_scale_filter(self, input_idx: int, pos: Tuple[int, int, int, int]) -> str:
        """Build scale filter for a single video input."""
        x, y, w, h = pos
        return (
            f"[{input_idx}:v]scale={w}:{h}:force_original_aspect_ratio=decrease,"
            f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black[v{input_idx}_scaled]"
        )

    def _build_overlay_chain(self) -> Tuple[str, str]:
        """Build overlay chain to combine multiple videos."""
        if self.input_count == 1:
            return "[v0_scaled]anull[combined]", "combined"

        # FIX: the original chain string was malformed — it concatenated overlay
        # filter syntax directly without semicolons and emitted the final output
        # label inconsistently.  Rebuild as a proper semicolon-separated list.
        parts = []
        current = "v0_scaled"
        for i in range(1, self.input_count):
            out = "combined" if i == self.input_count - 1 else f"tmp{i}"
            x = self.cfg.video_inputs[i].x
            y = self.cfg.video_inputs[i].y
            parts.append(f"[{current}][v{i}_scaled]overlay={x}:{y}[{out}]")
            current = out

        return ";".join(parts), "combined"

    def build_video_composition(self) -> Tuple[str, str]:
        """Build filter graph for video composition."""
        if self.input_count == 0:
            raise ValueError("No video inputs specified")

        positions = self._calculate_layout_positions()
        for i, pos in enumerate(positions):
            if i < len(self.cfg.video_inputs):
                self.cfg.video_inputs[i].x = pos[0]
                self.cfg.video_inputs[i].y = pos[1]
                self.cfg.video_inputs[i].width = pos[2]
                self.cfg.video_inputs[i].height = pos[3]

        scale_filters = []
        for i, inp in enumerate(self.cfg.video_inputs):
            scale_filters.append(
                self._build_scale_filter(i, (inp.x, inp.y, inp.width, inp.height))
            )

        overlay_chain, combined_video = self._build_overlay_chain()

        filters = ";".join(scale_filters) + ";" + overlay_chain
        return filters, combined_video


class TextFlashBuilder:
    """Builds FFmpeg filter for flashing text animations."""

    def __init__(self, cfg: OverlayConfig):
        self.cfg = cfg
        self.W = cfg.target_width
        self.H = cfg.target_height
        self.f = cfg.font_path

    def _esc(self, text: str) -> str:
        """Escape special characters for FFmpeg drawtext."""
        return (text.replace("\\", "\\\\").replace("'", "\u2019")
                .replace(":", "\\:").replace("%", "\\%")
                .replace("[", "\\[").replace("]", "\\]"))

    def build_flash_filter(self, video_input: str) -> str:
        """Build filter for flashing text overlay."""
        if not self.cfg.text_flash:
            return video_input

        flash = self.cfg.text_flash

        if flash.position == "right":
            x = self.W - 200
            y = "(h-text_h)/2"
        elif flash.position == "left":
            x = 20
            y = "(h-text_h)/2"
        elif flash.position == "top":
            x = "(w-text_w)/2"
            y = 20
        else:
            x = "(w-text_w)/2"
            y = self.H - 100

        flash_expr = f"lt(mod(t,{flash.interval}),{flash.duration})"

        return (
            f"[{video_input}]drawtext="
            f"fontfile='{self.f}':"
            f"text='{self._esc(flash.text)}':"
            f"fontsize={flash.font_size}:"
            f"fontcolor={flash.font_color}:"
            f"box=1:boxcolor={flash.background_color}:boxborderw=10:"
            f"x={x}:y={y}:"
            f"enable='{flash_expr}'[flashed]"
        )


# ── FILTER BUILDER ────────────────────────────────────────────────────────────

class NewsOverlayFilter:
    """Builds the FFmpeg filter_complex string for the news overlay."""

    def __init__(self, cfg: OverlayConfig):
        self.cfg = cfg
        self.W = cfg.target_width
        self.H = cfg.target_height
        self.f = cfg.font_path

    def _esc(self, text: str) -> str:
        """Escape special characters for FFmpeg drawtext."""
        return (text.replace("\\", "\\\\").replace("'", "\u2019")
                .replace(":", "\\:").replace("%", "\\%")
                .replace("[", "\\[").replace("]", "\\]"))

    def build(self) -> Tuple[str, List[str], List[str], List[str]]:
        """
        Return the complete filter_complex string and list of input mappings.

        Returns:
            Tuple of (filter_complex, video_mappings, audio_mappings, extra_input_args)

        FIX: return type annotation updated from Tuple[str, List[str], List[str]] to
        the correct 4-element tuple that callers already expect.
        """
        cfg = self.cfg
        W, H = self.W, self.H
        f = self.f

        parts = []
        video_mappings = []
        audio_mappings = []

        # ── 0. Handle video composition based on layout ──────────────────────
        if cfg.layout != LayoutType.SINGLE and len(cfg.video_inputs) > 1:
            video_builder = MultiVideoLayoutBuilder(cfg)
            video_composition, combined_video = video_builder.build_video_composition()
            parts.append(video_composition)
            prev = combined_video
        else:
            # Single video (original functionality)
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

        channel_y = f"({th}-{cfg.channel_font_size})/2"
        parts.append(
            f"[topbar]drawtext="
            f"fontfile='{f}':"
            f"text='{self._esc(cfg.channel_name)}':"
            f"fontsize={cfg.channel_font_size}:"
            f"fontcolor={cfg.channel_font_color}:"
            f"x=(w-text_w)/2:"
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

        badge_w = 110
        badge_pad = 6
        badge_y = f"{bar_y}+({bh}-{cfg.badge_font_size})/2"
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

        hl_x = badge_w + badge_pad * 2 + 8
        hl_y = f"{bar_y}+({bh}-{cfg.headline_font_size})/2"
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

        ticker_esc = self._esc(cfg.ticker_text)
        ticker_y = f"{tick_y}+({cfg.ticker_height}-{cfg.ticker_font_size})/2"
        scroll_x = f"w-mod(t*{cfg.ticker_speed}\\,w+tw)"

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

        # ── 5. Text flash overlay (for side-text layout) ─────────────────────
        if cfg.layout == LayoutType.SIDE_TEXT and cfg.text_flash:
            flash_builder = TextFlashBuilder(cfg)
            flash_filter = flash_builder.build_flash_filter(prev)
            parts.append(flash_filter)
            prev = "flashed"

        # ── 6. Audio Processing ──────────────────────────────────────────────
        audio_processor = AudioProcessor(cfg, len(cfg.video_inputs))
        audio_filters, audio_label, extra_input_args = audio_processor.build_audio_graph()

        if audio_filters:
            parts.extend(audio_filters)
            audio_mappings = ["-map", f"[{audio_label}]"]
        else:
            audio_mappings = ["-map", "0:a?"]

        video_mappings = ["-map", f"[{prev}]"]

        return ";".join(parts), video_mappings, audio_mappings, extra_input_args


# ── RUNNER ───────────────────────────────────────────────────────────────────

def _build_ffmpeg_cmd(
    input_paths: List[str],
    output_path: str,
    filter_complex: str,
    video_mappings: List[str],
    audio_mappings: List[str],
    extra_inputs: List[str],
    cfg: OverlayConfig,
    use_docker: bool = False,
    work_dir: Optional[str] = None,
) -> list:
    """Assemble the full FFmpeg command list for multiple inputs."""

    # extra_inputs already contains "-i <path>" pairs from AudioProcessor
    all_input_paths = input_paths[:]

    if use_docker:
        cwd = work_dir or os.getcwd()

        def to_docker(path: str) -> str:
            return f"/work/{os.path.relpath(path, cwd)}"

        docker_video_inputs = [to_docker(p) for p in input_paths]
        d_out = to_docker(output_path)

        prefix = ["docker", "run", "--rm", "-v", f"{cwd}:/work", FFMPEG_DOCKER_IMAGE]
        input_args = []
        for p in docker_video_inputs:
            input_args.extend(["-i", p])

        # Translate extra -i paths too
        translated_extras = []
        it = iter(extra_inputs)
        for tok in it:
            if tok == "-i":
                translated_extras.extend(["-i", to_docker(next(it))])
            else:
                translated_extras.append(tok)

        cmd = (
            prefix
            + input_args
            + translated_extras
            + ["-filter_complex", filter_complex]
            + video_mappings
            + audio_mappings
            + [
                "-c:v", "libx264",
                "-preset", cfg.preset,
                "-crf", str(cfg.crf),
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                "-c:a", cfg.audio_codec,
                "-b:a", cfg.audio_bitrate,
                "-y", d_out,
            ]
        )
    else:
        input_args = []
        for p in input_paths:
            input_args.extend(["-i", p])

        cmd = (
            ["ffmpeg"]
            + input_args
            + extra_inputs
            + ["-filter_complex", filter_complex]
            + video_mappings
            + audio_mappings
            + [
                "-c:v", "libx264",
                "-preset", cfg.preset,
                "-crf", str(cfg.crf),
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                "-c:a", cfg.audio_codec,
                "-b:a", cfg.audio_bitrate,
                "-y", output_path,
            ]
        )

    return cmd


def process_video(
    input_path: str,
    output_path: str,
    cfg: Optional[OverlayConfig] = None,
    use_docker: bool = False,
    work_dir: Optional[str] = None,
    verbose: bool = True,
) -> None:
    """Apply news overlay to a single video (original functionality)."""
    if cfg is None:
        cfg = OverlayConfig()

    cfg.layout = LayoutType.SINGLE
    cfg.video_inputs = [VideoInput(path=input_path)]

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    flt = NewsOverlayFilter(cfg)
    filter_complex, video_mappings, audio_mappings, extra_inputs = flt.build()

    cmd = _build_ffmpeg_cmd(
        [input_path], output_path, filter_complex, video_mappings, audio_mappings,
        extra_inputs, cfg, use_docker=use_docker, work_dir=work_dir,
    )

    if verbose:
        print("── FFmpeg command ──────────────────────────────────────────────")
        print(" \\\n    ".join(shlex.quote(a) for a in cmd))
        print("────────────────────────────────────────────────────────────────")

    result = subprocess.run(cmd, stderr=subprocess.PIPE if not verbose else None, text=True)

    if result.returncode != 0:
        err = result.stderr or "(captured above)"
        raise RuntimeError(f"FFmpeg failed (exit {result.returncode}):\n{err}")

    if verbose:
        print(f"\n✅  Output written to: {output_path}")


def process_video_multi(
    input_paths: List[str],
    output_path: str,
    cfg: Optional[OverlayConfig] = None,
    use_docker: bool = False,
    work_dir: Optional[str] = None,
    verbose: bool = True,
) -> None:
    """Apply news overlay to multiple videos with layout composition."""
    if cfg is None:
        cfg = OverlayConfig()

    if not cfg.video_inputs:
        cfg.video_inputs = [VideoInput(path=p) for p in input_paths]

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    flt = NewsOverlayFilter(cfg)
    filter_complex, video_mappings, audio_mappings, extra_inputs = flt.build()

    cmd = _build_ffmpeg_cmd(
        input_paths, output_path, filter_complex, video_mappings, audio_mappings,
        extra_inputs, cfg, use_docker=use_docker, work_dir=work_dir,
    )

    if verbose:
        print("── FFmpeg command ──────────────────────────────────────────────")
        print(" \\\n    ".join(shlex.quote(a) for a in cmd))
        print("────────────────────────────────────────────────────────────────")

    result = subprocess.run(cmd, stderr=subprocess.PIPE if not verbose else None, text=True)

    if result.returncode != 0:
        err = result.stderr or "(captured above)"
        raise RuntimeError(f"FFmpeg failed (exit {result.returncode}):\n{err}")

    if verbose:
        print(f"\n✅  Output written to: {output_path}")


# ── CLI ──────────────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Add a news-style overlay to video(s) with advanced audio processing."
    )

    # Video inputs
    p.add_argument("--input", help="Input video path (single video mode)")
    p.add_argument("--input1", help="First input video (for multi-video layouts)")
    p.add_argument("--input2", help="Second input video (for multi-video layouts)")
    p.add_argument("--input3", help="Third input video (for three-column layout)")
    p.add_argument("--output", required=True, help="Output video path")

    # Overlay content
    p.add_argument("--channel", default="NEWS 24", help="Channel name (top bar)")
    p.add_argument("--headline", default="BREAKING NEWS", help="Headline text (bottom bar)")
    p.add_argument("--ticker", default="Stay tuned for latest updates • More information to follow",
                   help="Scrolling ticker text")

    # Styling
    p.add_argument("--width", type=int, default=1280, help="Output width")
    p.add_argument("--height", type=int, default=720, help="Output height")
    p.add_argument("--no-border", action="store_true", help="Disable red border")
    p.add_argument("--ticker-speed", type=int, default=120, help="Ticker pixels/sec")
    p.add_argument("--font", default=None, help="Override font file path")

    # Encoding
    p.add_argument("--docker", action="store_true", help="Run inside Docker container")
    p.add_argument("--crf", type=int, default=23, help="H.264 CRF value")
    p.add_argument("--preset", default="fast", help="H.264 preset")
    p.add_argument("--audio-bitrate", default="128k", help="Audio bitrate")
    p.add_argument("--audio-codec", default="aac", help="Audio codec")

    # Multi-video layout
    p.add_argument("--layout", choices=[l.value for l in LayoutType], default="single",
                   help="Multi-video layout type")

    # Text flash
    p.add_argument("--flash-text", help="Text to flash on side")
    p.add_argument("--flash-interval", type=int, default=3, help="Seconds between flashes")
    p.add_argument("--flash-duration", type=int, default=2, help="Seconds each flash lasts")
    p.add_argument("--flash-position", choices=["left", "right", "top", "bottom"], default="right")

    # Audio controls
    p.add_argument("--audio-mix", help="Comma-separated volume weights for each video (e.g., '0.7,1.0,0.5')")
    p.add_argument("--background-music", help="Background music file")
    p.add_argument("--background-music-volume", type=float, default=0.3, help="Background music volume")
    p.add_argument("--voiceover", help="Voiceover audio file")
    p.add_argument("--voiceover-volume", type=float, default=1.0, help="Voiceover volume")
    p.add_argument("--voiceover-start", type=float, default=0.0, help="Voiceover start time (seconds)")

    # Audio ducking
    p.add_argument("--ducking", action="store_true", help="Enable audio ducking")
    p.add_argument("--ducking-threshold", type=float, default=0.5, help="Ducking threshold (0-1)")
    p.add_argument("--ducking-attack", type=float, default=0.1, help="Ducking attack time (seconds)")
    p.add_argument("--ducking-release", type=float, default=0.5, help="Ducking release time (seconds)")
    p.add_argument("--ducked-volume", type=float, default=0.2, help="Volume when ducking active")

    # Audio normalization
    p.add_argument("--normalize-audio", action="store_true", help="Enable audio normalization")
    p.add_argument("--target-lufs", type=float, default=-16.0, help="Target LUFS for normalization")

    return p.parse_args()


def main() -> None:
    args = _parse_args()

    # Determine input paths
    input_paths = []
    if args.input:
        input_paths = [args.input]
    else:
        for i in [1, 2, 3]:
            inp = getattr(args, f"input{i}", None)
            if inp:
                input_paths.append(inp)

    if not input_paths:
        print("Error: No input videos specified.")
        sys.exit(1)

    # Parse audio mix weights
    audio_mix_weights = None
    if args.audio_mix:
        audio_mix_weights = [float(w.strip()) for w in args.audio_mix.split(",")]
        if len(audio_mix_weights) != len(input_paths):
            print(
                f"Warning: Audio mix weights count ({len(audio_mix_weights)}) "
                f"doesn't match video count ({len(input_paths)})"
            )
            audio_mix_weights = None

    # Setup audio ducking
    audio_ducking = None
    if args.ducking:
        audio_ducking = AudioDucking(
            enabled=True,
            threshold=args.ducking_threshold,
            attack=args.ducking_attack,
            release=args.ducking_release,
            ducked_volume=args.ducked_volume,
            normal_volume=1.0,
        )

    # Setup text flash
    text_flash = None
    if args.flash_text:
        text_flash = TextFlash(
            text=args.flash_text,
            interval=args.flash_interval,
            duration=args.flash_duration,
            position=args.flash_position,
        )

    # Create video inputs
    video_inputs = [VideoInput(path=p) for p in input_paths]

    # Build audio tracks list
    audio_tracks = []
    if args.background_music:
        audio_tracks.append(AudioTrack(
            path=args.background_music,
            volume=args.background_music_volume,
            label="background_music",
        ))
    if args.voiceover:
        audio_tracks.append(AudioTrack(
            path=args.voiceover,
            volume=args.voiceover_volume,
            start=args.voiceover_start,
            label="voiceover",
        ))

    cfg = OverlayConfig(
        layout=LayoutType(args.layout),
        video_inputs=video_inputs,
        text_flash=text_flash,
        audio_tracks=audio_tracks,
        audio_mix_weights=audio_mix_weights,
        audio_ducking=audio_ducking,
        background_music=args.background_music,
        background_music_volume=args.background_music_volume,
        voiceover=args.voiceover,
        voiceover_volume=args.voiceover_volume,
        voiceover_start=args.voiceover_start,
        enable_audio_normalization=args.normalize_audio,
        target_audio_level=args.target_lufs,
        channel_name=args.channel,
        headline=args.headline,
        ticker_text=args.ticker,
        target_width=args.width,
        target_height=args.height,
        add_border=not args.no_border,
        ticker_speed=args.ticker_speed,
        crf=args.crf,
        preset=args.preset,
        audio_bitrate=args.audio_bitrate,
        audio_codec=args.audio_codec,
    )
    if args.font:
        cfg.font_path = args.font

    # Route to appropriate processor
    is_multi = len(input_paths) > 1 or args.layout != "single"

    if is_multi:
        process_video_multi(
            input_paths=input_paths,
            output_path=args.output,
            cfg=cfg,
            use_docker=args.docker,
            verbose=True,
        )
    else:
        process_video(
            input_path=input_paths[0],
            output_path=args.output,
            cfg=cfg,
            use_docker=args.docker,
            verbose=True,
        )


if __name__ == "__main__":
    main()