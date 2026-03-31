from fastapi import APIRouter, Request
import subprocess
import os
import socket
import uuid
import httpx
import xml.etree.ElementTree as ET
from config.config  import NGINX_STAT, HLS_BASE_URL


router = APIRouter(prefix="/stream", tags=["Streaming"])

# store running ffmpeg processes (in-memory)
active_processes = {}


@router.post("/start")
async def stream_start(req: Request):
    form = await req.form()

    stream_key = form.get("name")

    print(f"🚀 Stream started: {stream_key}")

    # start FFmpeg for overlay
    cmd = [
        "ffmpeg",
        "-i", f"rtmp://localhost/live/{stream_key}",
        "-vf", "drawtext=text='LIVE':x=10:y=10:fontsize=24:fontcolor=white",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-c:a", "aac",
        "-f", "flv",
        f"rtmp://localhost/live_processed/{stream_key}"
    ]

    process = subprocess.Popen(cmd)
    active_processes[stream_key] = process

    return {"status": "started", "stream_key": stream_key}


@router.post("/end")
async def stream_end(req: Request):
    form = await req.form()

    stream_key = form.get("name")

    print(f"🛑 Stream ended: {stream_key}")

    process = active_processes.get(stream_key)
    if process:
        process.kill()
        del active_processes[stream_key]

    return {"status": "stopped", "stream_key": stream_key}






# ── Add this helper near the top of main.py ───────────────────────────────────

def _lan_ip() -> str:
    """
    Best-effort LAN IP detection.
    Priority:
      1. PUBLIC_HOST env var  (set this in docker-compose for a fixed address)
      2. socket trick         (connects a UDP socket to 8.8.8.8 to find default route IP)
      3. fallback to hostname
    """
    forced = os.getenv("PUBLIC_HOST")          # e.g. "192.168.1.42" or "stream.myhost.com"
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
    



@router.get("/key")
def get_stream_key(request: Request):
    """
    Generate a unique RTMP stream key.

    Returns both localhost URLs (for the same machine) and
    LAN/device URLs (for phones, tablets, OBS on other machines).

    Env vars:
      PUBLIC_HOST   — override the detected LAN IP with a fixed hostname/IP
      RTMP_PORT     — RTMP port (default 1935)
      HLS_PORT      — nginx HLS port (default 8080)
    """
    stream_key = str(uuid.uuid4()).replace("-", "")

    rtmp_port = os.getenv("RTMP_PORT", "1935")
    hls_port  = os.getenv("HLS_PORT",  "8080")

    # ── Same-machine URLs (always localhost) ──────────────────────────────────
    local_rtmp = f"rtmp://localhost:{rtmp_port}/live/{stream_key}"
    local_hls  = f"{HLS_BASE_URL}/{stream_key}/index.m3u8"

    # ── Other-device URLs (LAN IP) ────────────────────────────────────────────
    lan_ip     = _lan_ip()
    device_rtmp = f"rtmp://{lan_ip}:{rtmp_port}/live/{stream_key}"
    device_hls  = f"http://{lan_ip}:{hls_port}/live/{stream_key}/index.m3u8"

    return {
        "stream_key": stream_key,

        # ── Local (same machine) ──────────────────────────────────────────────
        "rtmp_url":  local_rtmp,       # kept for backward-compat
        "hls_url":   local_hls,        # kept for backward-compat

        # ── Other devices on the network ──────────────────────────────────────
        "device_rtmp_url": device_rtmp,
        "device_hls_url":  device_hls,

        "lan_ip": lan_ip,

        "instructions": {
            "obs_local":    f"Server: rtmp://localhost:{rtmp_port}/live   Key: {stream_key}",
            "obs_device":   f"Server: rtmp://{lan_ip}:{rtmp_port}/live   Key: {stream_key}",
            "ffmpeg_local": f"ffmpeg -re -i input.mp4 -c copy -f flv rtmp://localhost:{rtmp_port}/live/{stream_key}",
            "ffmpeg_device":f"ffmpeg -re -i input.mp4 -c copy -f flv rtmp://{lan_ip}:{rtmp_port}/live/{stream_key}",
            "vlc_hls":      f"vlc {device_hls}",
            "phone_player": f"Open in phone browser or VLC:  {device_hls}",
        },
    }




@router.get("/active")
async def get_active_streams():
    """
    Query nginx-rtmp stat endpoint and return all currently live stream keys.
    Useful for the frontend to know if a stream is actually broadcasting.
    """
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(NGINX_STAT)
        root = ET.fromstring(r.text)

        streams = []
        for stream in root.findall(".//stream"):
            name_el = stream.find("name")
            if name_el is None:
                continue
            key = name_el.text or ""
            bw_el    = stream.find("bw_video")
            nclients = stream.find("nclients")
            streams.append({
                "stream_key": key,
                "hls_url":    f"{HLS_BASE_URL}/{key}/index.m3u8",
                "rtmp_url":   f"rtmp://localhost:1935/live/{key}",
                "bw_kbps":    int(bw_el.text or 0) // 1000 if bw_el is not None else 0,
                "viewers":    int(nclients.text or 0) if nclients is not None else 0,
            })
        return {"active": streams, "count": len(streams)}

    except httpx.RequestError as e:
        # nginx not reachable — return empty rather than 500
        return {"active": [], "count": 0, "warning": f"nginx-rtmp stat unreachable: {e}"}
    except ET.ParseError:
        return {"active": [], "count": 0, "warning": "Could not parse nginx stat XML"}

