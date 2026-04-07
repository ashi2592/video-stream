"""
routers/stream_router.py — RTMP streaming router with multi-source slot support.

New in this version:
  • Accepts per-slot media sources (file path, RTMP, HLS, webcam)
  • Builds FFmpeg lavfi/overlay filter graphs for multi-source split-screen layouts
  • Single-source: drawtext overlays as before
  • Multi-source (2–3 slots): xstack or overlay compositing + drawtext overlay chain
  • Upload endpoint for video/image media files (/upload/media)
"""

from __future__ import annotations

import os
import shutil
import socket
import subprocess
import uuid
import httpx
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

from bson import ObjectId
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel

from config.config import NGINX_STAT, HLS_BASE_URL
from utils.mongo_model import templates_collection

router = APIRouter(prefix="/stream", tags=["Streaming"])

# ── In-memory session store ───────────────────────────────────────────────────
# { stream_key: { process, template_id, template_name, started_at, sources } }
active_processes: dict[str, dict] = {}

# ── Media upload storage ──────────────────────────────────────────────────────
MEDIA_DIR = Path(os.getenv("MEDIA_DIR", "/tmp/overlay_media"))
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_BASE_URL = os.getenv("MEDIA_BASE_URL", "http://localhost:8000/media")


# =============================================================================
# Helpers
# =============================================================================

def _lan_ip() -> str:
    forced = os.getenv("PUBLIC_HOST")
    if forced:
        return forced
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return socket.gethostname()


def _sanitize_drawtext(text: str) -> str:
    """Escape text for FFmpeg drawtext filter."""
    text = text.encode("ascii", errors="ignore").decode("ascii")
    for ch, esc in [("\\", "\\\\"), ("'", "\\'"), (":", "\\:"), ("[", "\\["), ("]", "\\]")]:
        text = text.replace(ch, esc)
    return text


# =============================================================================
# Source resolution
# =============================================================================

class SlotSource(BaseModel):
    """Per-slot media source descriptor sent from the frontend."""
    slot_id: int
    content_type: str = "video"        # video | image | livestream | text | carousel
    source_type: str = "none"          # file | path | rtmp | hls | webcam | none
    file_path: Optional[str] = None    # server-side absolute path (file upload or path mode)
    stream_url: Optional[str] = None   # rtmp:// or http://…m3u8
    stream_key: Optional[str] = None   # shorthand key → rtmp://localhost/live/<key>


def _resolve_ffmpeg_input(src: SlotSource, rtmp_port: str = "1935") -> tuple[list[str], list[str]]:
    """
    Returns (input_args, filter_input_label_hint) for one slot source.

    input_args  — the FFmpeg -i … plus any source-specific flags
    Returns empty list for 'none' sources (will use black lavfi pad instead).
    """
    st = src.source_type

    if st == "none" or not (src.file_path or src.stream_url or src.stream_key):
        # Black silent source
        return ["-f", "lavfi", "-i", f"color=c=black:s=1280x720:r=30"], []

    if st in ("file", "path"):
        path = src.file_path or ""
        if src.content_type == "image":
            # Loop image as video
            return ["-loop", "1", "-i", path], []
        return ["-re", "-stream_loop", "-1", "-i", path], []

    if st == "rtmp":
        url = src.stream_url or f"rtmp://localhost:{rtmp_port}/live/{src.stream_key}"
        return ["-i", url], []

    if st == "hls":
        url = src.stream_url or ""
        return ["-i", url], []

    if st == "webcam":
        dev = src.file_path or "0"
        if dev.startswith("/dev/"):
            return ["-f", "v4l2", "-i", dev], []
        # Windows / macOS index
        return ["-f", "dshow", "-i", f"video={dev}"], []

    # Fallback: treat as a generic URL
    return ["-i", src.stream_url or src.file_path or ""], []


# =============================================================================
# Overlay filter builder
# =============================================================================

def _build_overlay_filter_chain(cfg: dict) -> str:
    """Build drawtext/drawbox overlay elements only (no layout compositing)."""
    filters: list[str] = []
    font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    font_light = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

    H = cfg.get("height", 720)
    top_h, hl_h = 56, 52
    show_highlight = cfg.get("show_highlight", True)
    show_ticker = cfg.get("show_ticker", True)
    hh = 34 if show_highlight else 0
    th = 32 if show_ticker else 0

    top_bar  = cfg.get("top_bar_color",      "#1a1a2e").lstrip("#")
    hl_bar   = cfg.get("headline_bar_color", "#c0392b").lstrip("#")
    hi_bg    = cfg.get("highlight_bg_color", "#2c3e50").lstrip("#")
    tk_bg    = cfg.get("ticker_bg_color",    "#1a1a2e").lstrip("#")
    tk_fg    = cfg.get("ticker_color",       "#f1c40f").lstrip("#")
    badge_c  = cfg.get("badge_color",        "#e74c3c").lstrip("#")

    filters.append(f"drawbox=x=0:y=0:w=iw:h={top_h}:color=0x{top_bar}@1.0:t=fill")
    channel = _sanitize_drawtext(cfg.get("channel_name", "NEWS 24"))
    filters.append(f"drawtext=fontfile='{font}':text='{channel}':x=(w-tw)/2:y=({top_h}-th)/2:fontsize=22:fontcolor=white")

    hl_y = H - hl_h - hh - th
    filters.append(f"drawbox=x=0:y={hl_y}:w=iw:h={hl_h}:color=0x{hl_bar}@1.0:t=fill")
    badge = _sanitize_drawtext(cfg.get("badge_text", "BREAKING"))
    if badge:
        filters.append(f"drawbox=x=12:y={hl_y+12}:w=110:h=28:color=0x{badge_c}@1.0:t=fill")
        filters.append(f"drawtext=fontfile='{font}':text='{badge}':x=18:y={hl_y+18}:fontsize=13:fontcolor=white")
    headline = _sanitize_drawtext(cfg.get("headline", ""))
    if headline:
        filters.append(f"drawtext=fontfile='{font_light}':text='{headline}':x=136:y={hl_y+(hl_h-16)//2}:fontsize=16:fontcolor=white")

    if show_highlight:
        hi_y = H - hh - th
        hi_text = _sanitize_drawtext(cfg.get("highlight_text", ""))
        filters.append(f"drawbox=x=0:y={hi_y}:w=iw:h={hh}:color=0x{hi_bg}@1.0:t=fill")
        if hi_text:
            filters.append(f"drawtext=fontfile='{font_light}':text='{hi_text}':x=14:y={hi_y+(hh-14)//2}:fontsize=14:fontcolor=white")

    if show_ticker:
        tk_y = H - th
        tk_text = _sanitize_drawtext(cfg.get("ticker_text", ""))
        speed = cfg.get("ticker_speed", 80)
        filters.append(f"drawbox=x=0:y={tk_y}:w=iw:h={th}:color=0x{tk_bg}@1.0:t=fill")
        if tk_text:
            est_tw = len(tk_text) * 9
            filters.append(
                f"drawtext=fontfile='{font}':text='{tk_text}  •  {tk_text}'"
                f":x=w-mod(t*{speed}\\,w+{est_tw}):y={tk_y+(th-14)//2}:fontsize=14:fontcolor=0x{tk_fg}"
            )

    return ",".join(filters)


def _build_multi_source_cmd(
    stream_key: str,
    slot_sources: list[SlotSource],
    overlay_filter: Optional[str],
    layout_id: str,
    width: int,
    height: int,
    rtmp_port: str = "1935",
) -> list[str]:
    """
    Build an FFmpeg command that:
      1. Takes N input sources (one per slot)
      2. Composites them using xstack (for grid layouts) or overlay (for featured)
      3. Applies the overlay drawtext/drawbox chain on top
      4. Re-encodes and publishes to live_processed/<stream_key>
    """
    cmd = ["ffmpeg"]

    # ── Collect inputs ────────────────────────────────────────────────────────
    n = len(slot_sources)
    input_args_per_slot: list[list[str]] = []
    for src in slot_sources:
        args, _ = _resolve_ffmpeg_input(src, rtmp_port)
        input_args_per_slot.append(args)
        cmd += args

    output_url = f"rtmp://localhost:{rtmp_port}/live_processed/{stream_key}"
    scale_w, scale_h = width, height

    # ── Build filter_complex ──────────────────────────────────────────────────
    filter_complex_parts: list[str] = []

    if n == 1:
        # Single source — scale to output size
        filter_complex_parts.append(f"[0:v]scale={scale_w}:{scale_h}[base]")
        video_out = "[base]"

    elif n == 2:
        half_w = scale_w // 2
        half_h = scale_h // 2

        if layout_id in ("split-v",):
            # Side by side
            filter_complex_parts.append(f"[0:v]scale={half_w}:{scale_h}[v0]")
            filter_complex_parts.append(f"[1:v]scale={half_w}:{scale_h}[v1]")
            filter_complex_parts.append(f"[v0][v1]hstack=inputs=2[base]")
        else:
            # Top / bottom (split-h)
            filter_complex_parts.append(f"[0:v]scale={scale_w}:{half_h}[v0]")
            filter_complex_parts.append(f"[1:v]scale={scale_w}:{half_h}[v1]")
            filter_complex_parts.append(f"[v0][v1]vstack=inputs=2[base]")

        video_out = "[base]"

    elif n == 3:
        if layout_id == "triple-col":
            col_w = scale_w // 3
            filter_complex_parts.append(f"[0:v]scale={col_w}:{scale_h}[v0]")
            filter_complex_parts.append(f"[1:v]scale={col_w}:{scale_h}[v1]")
            filter_complex_parts.append(f"[2:v]scale={col_w}:{scale_h}[v2]")
            filter_complex_parts.append(f"[v0][v1][v2]hstack=inputs=3[base]")

        elif layout_id == "triple-row":
            row_h = scale_h // 3
            filter_complex_parts.append(f"[0:v]scale={scale_w}:{row_h}[v0]")
            filter_complex_parts.append(f"[1:v]scale={scale_w}:{row_h}[v1]")
            filter_complex_parts.append(f"[2:v]scale={scale_w}:{row_h}[v2]")
            filter_complex_parts.append(f"[v0][v1][v2]vstack=inputs=3[base]")

        elif layout_id == "featured":
            # Slot 0: top 60%, Slot 1: bottom-left 40%, Slot 2: bottom-right 40%
            feat_h = int(scale_h * 0.6)
            side_h = scale_h - feat_h
            side_w = scale_w // 2
            filter_complex_parts.append(f"[0:v]scale={scale_w}:{feat_h}[vfeat]")
            filter_complex_parts.append(f"[1:v]scale={side_w}:{side_h}[va]")
            filter_complex_parts.append(f"[2:v]scale={side_w}:{side_h}[vb]")
            filter_complex_parts.append(f"[va][vb]hstack=inputs=2[vbottom]")
            filter_complex_parts.append(f"[vfeat][vbottom]vstack=inputs=2[base]")

        else:
            # Fallback: xstack 1x3 grid
            filter_complex_parts.append(f"[0:v]scale={scale_w//3}:{scale_h}[v0]")
            filter_complex_parts.append(f"[1:v]scale={scale_w//3}:{scale_h}[v1]")
            filter_complex_parts.append(f"[2:v]scale={scale_w//3}:{scale_h}[v2]")
            filter_complex_parts.append(f"[v0][v1][v2]hstack=inputs=3[base]")

        video_out = "[base]"

    else:
        # More than 3: fallback to first input only
        filter_complex_parts.append(f"[0:v]scale={scale_w}:{scale_h}[base]")
        video_out = "[base]"

    # ── Apply overlay drawtext chain ──────────────────────────────────────────
    if overlay_filter:
        filter_complex_parts.append(f"{video_out}split[overlay_in]")
        filter_complex_parts.append(f"[overlay_in]{overlay_filter}[vout]")
        final_video = "[vout]"
    else:
        filter_complex_parts.append(f"{video_out}drawtext=text='LIVE':x=10:y=10:fontsize=24:fontcolor=white[vout]")
        final_video = "[vout]"

    # ── Audio mix: amix all input audio streams ───────────────────────────────
    if n > 1:
        audio_inputs = "".join(f"[{i}:a?]" for i in range(n))
        filter_complex_parts.append(f"{audio_inputs}amix=inputs={n}:duration=longest[aout]")
        audio_map = ["-map", "[aout]"]
    else:
        audio_map = ["-map", "0:a?"]

    fc = ";".join(filter_complex_parts)

    cmd += [
        "-filter_complex", fc,
        "-map", final_video,
        *audio_map,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-b:v", "3000k",
        "-maxrate", "3000k",
        "-bufsize", "6000k",
        "-g", "60",
        "-c:a", "aac",
        "-b:a", "128k",
        "-f", "flv",
        output_url,
    ]

    return cmd


# =============================================================================
# Request schemas
# =============================================================================

class StreamStartRequest(BaseModel):
    stream_key: str
    template_id: Optional[str] = None
    # Per-slot sources; if empty, falls back to the OBS/RTMP input path
    slot_sources: Optional[Dict[str, Any]] = None


class StreamStopRequest(BaseModel):
    stream_key: str


# =============================================================================
# Routes
# =============================================================================

@router.post("/start", summary="Start a multi-source overlay-processed stream")
async def stream_start(body: StreamStartRequest):
    """
    Start streaming with optional per-slot media sources.

    - **stream_key**: RTMP key clients publish to
    - **template_id**: MongoDB ObjectId of an overlay template
    - **slot_sources**: dict of slot_id → SlotSource (from the Sources tab)
      If omitted, a single RTMP input at rtmp://localhost/live/<stream_key> is used.
    """
    stream_key = body.stream_key.strip()
    if not stream_key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="stream_key is required.")
    if stream_key in active_processes:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Stream already active.")

    # ── Resolve template ──────────────────────────────────────────────────────
    overlay_filter: Optional[str] = None
    template_name: Optional[str] = None
    layout_id = "single"
    width, height = 1280, 720

    if body.template_id:
        try:
            oid = ObjectId(body.template_id)
        except Exception:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid template_id.")
        doc = templates_collection.find_one({"_id": oid})
        if not doc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Template not found.")
        cfg = doc.get("config", {})
        overlay_filter = _build_overlay_filter_chain(cfg)
        template_name = doc.get("name")
        layout_id = cfg.get("layout_id", "single")
        width = cfg.get("width", 1280)
        height = cfg.get("height", 720)

    # ── Parse slot sources ────────────────────────────────────────────────────
    rtmp_port = os.getenv("RTMP_PORT", "1935")
    parsed_sources: list[SlotSource] = []

    if body.slot_sources:
        for slot_id_str, src_dict in sorted(body.slot_sources.items(), key=lambda x: int(x[0])):
            try:
                src = SlotSource(slot_id=int(slot_id_str), **{k: v for k, v in src_dict.items() if k != "slot_id"})
                parsed_sources.append(src)
            except Exception as e:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Invalid slot source {slot_id_str}: {e}")

    # Fallback: single RTMP input (OBS publishes here)
    if not parsed_sources:
        parsed_sources = [SlotSource(
            slot_id=0, content_type="video", source_type="rtmp",
            stream_url=f"rtmp://localhost:{rtmp_port}/live/{stream_key}",
        )]

    # ── Build & launch FFmpeg ─────────────────────────────────────────────────
    cmd = _build_multi_source_cmd(
        stream_key=stream_key,
        slot_sources=parsed_sources,
        overlay_filter=overlay_filter,
        layout_id=layout_id,
        width=width,
        height=height,
        rtmp_port=rtmp_port,
    )

    try:
        process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except FileNotFoundError:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail="FFmpeg not found.")

    active_processes[stream_key] = {
        "process": process,
        "template_id": body.template_id,
        "template_name": template_name,
        "started_at": datetime.utcnow().isoformat(),
        "sources": [s.model_dump() for s in parsed_sources],
        "layout_id": layout_id,
    }

    hls_url = f"{HLS_BASE_URL}/{stream_key}.m3u8"
    print(f"🚀 Stream started: {stream_key} | layout={layout_id} | sources={len(parsed_sources)} | pid={process.pid}")

    return {
        "status": "started",
        "stream_key": stream_key,
        "template": template_name,
        "hls_url": hls_url,
        "pid": process.pid,
        "sources": len(parsed_sources),
        "layout": layout_id,
    }


@router.post("/end", summary="Stop an active stream")
async def stream_end(body: StreamStopRequest):
    """Stop the FFmpeg process for the given stream key."""
    stream_key = body.stream_key.strip()
    session = active_processes.get(stream_key)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Stream not found or already stopped.")

    proc: subprocess.Popen = session["process"]
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        import signal, os
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)

    del active_processes[stream_key]
    print(f"🛑 Stream stopped: {stream_key}")
    return {"status": "stopped", "stream_key": stream_key}


@router.post("/hook/publish", include_in_schema=False)
async def hook_on_publish(req: Request):
    form = await req.form()
    print(f"📡 nginx hook: published — key={form.get('name', '')}")
    return {"status": "ok"}


@router.post("/hook/publish_done", include_in_schema=False)
async def hook_on_publish_done(req: Request):
    form = await req.form()
    key = form.get("name", "")
    session = active_processes.pop(key, None)
    if session:
        session["process"].kill()
    print(f"📡 nginx hook: ended — key={key}")
    return {"status": "ok"}


@router.get("/key", summary="Generate a stream key with all connection URLs")
def get_stream_key():
    stream_key = uuid.uuid4().hex
    rtmp_port = os.getenv("RTMP_PORT", "1935")
    hls_port  = os.getenv("HLS_PORT",  "8080")
    lan_ip    = _lan_ip()
    local_rtmp  = f"rtmp://localhost:{rtmp_port}/live/{stream_key}"
    local_hls   = f"{HLS_BASE_URL}/{stream_key}/index.m3u8"
    device_rtmp = f"rtmp://{lan_ip}:{rtmp_port}/live/{stream_key}"
    device_hls  = f"http://{lan_ip}:{hls_port}/live/{stream_key}/index.m3u8"
    return {
        "stream_key": stream_key,
        "rtmp_url": local_rtmp, "hls_url": local_hls,
        "device_rtmp_url": device_rtmp, "device_hls_url": device_hls,
        "lan_ip": lan_ip,
        "instructions": {
            "obs_local":     f"Server: rtmp://localhost:{rtmp_port}/live   Key: {stream_key}",
            "obs_device":    f"Server: rtmp://{lan_ip}:{rtmp_port}/live   Key: {stream_key}",
            "ffmpeg_local":  f"ffmpeg -re -i input.mp4 -c copy -f flv {local_rtmp}",
            "ffmpeg_device": f"ffmpeg -re -i input.mp4 -c copy -f flv {device_rtmp}",
            "vlc_hls":       f"vlc {device_hls}",
        },
    }


@router.get("/active", summary="List active streams from nginx-rtmp stat")
async def get_active_streams():
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(NGINX_STAT)
        root = ET.fromstring(r.text)
        streams = []
        for stream in root.findall(".//stream"):
            name_el = stream.find("name")
            if name_el is None: continue
            key = name_el.text or ""
            bw_el = stream.find("bw_video")
            nc_el = stream.find("nclients")
            session = active_processes.get(key, {})
            streams.append({
                "stream_key": key,
                "hls_url": f"{HLS_BASE_URL}/{key}/index.m3u8",
                "rtmp_url": f"rtmp://localhost:1935/live/{key}",
                "bw_kbps": int(bw_el.text or 0) // 1000 if bw_el is not None else 0,
                "viewers": int(nc_el.text or 0) if nc_el is not None else 0,
                "template_name": session.get("template_name"),
                "layout": session.get("layout_id"),
                "sources": session.get("sources"),
                "started_at": session.get("started_at"),
            })
        return {"active": streams, "count": len(streams)}
    except httpx.RequestError as e:
        return {"active": [], "count": 0, "warning": f"nginx-rtmp unreachable: {e}"}
    except ET.ParseError:
        return {"active": [], "count": 0, "warning": "Could not parse nginx stat XML"}


@router.get("/sessions", summary="List in-memory FFmpeg sessions")
def get_sessions():
    result = []
    for key, session in active_processes.items():
        proc: subprocess.Popen = session["process"]
        result.append({
            "stream_key": key, "pid": proc.pid, "running": proc.poll() is None,
            "template_name": session.get("template_name"),
            "layout": session.get("layout_id"),
            "source_count": len(session.get("sources", [])),
            "started_at": session.get("started_at"),
            "hls_url": f"{HLS_BASE_URL}/{key}/index.m3u8",
        })
    return {"sessions": result, "count": len(result)}


@router.get("/preview-filter/{template_id}", summary="Preview FFmpeg filter for a template")
def preview_filter(template_id: str):
    try:
        oid = ObjectId(template_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid template_id.")
    doc = templates_collection.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Template not found.")
    cfg = doc.get("config", {})
    f = _build_overlay_filter_chain(cfg)
    return {"template_id": template_id, "template_name": doc.get("name"), "filter": f}


# =============================================================================
# Media file upload
# =============================================================================

@router.post("/upload/media", summary="Upload a video or image file for slot assignment")
async def upload_media(
    file: UploadFile = File(...),
    slot_id: int = Form(0),
    media_type: str = Form("video"),
):
    """
    Upload a video or image file to be used as a slot source.
    Returns the server-side path and a public URL for preview.
    """
    ext = Path(file.filename or "upload").suffix or (".mp4" if media_type == "video" else ".jpg")
    safe_name = f"slot{slot_id}_{uuid.uuid4().hex}{ext}"
    dest = MEDIA_DIR / safe_name

    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    return {
        "path": str(dest),
        "url": f"{MEDIA_BASE_URL}/{safe_name}",
        "filename": file.filename,
        "slot_id": slot_id,
        "media_type": media_type,
        "size_bytes": dest.stat().st_size,
    }