"""
Part 3: YouTube Livestream
---------------------------
Creates a YouTube live broadcast, binds it to an RTMP stream,
transitions it LIVE, and stops it when done.

Flow:
    1. create_live_stream()   → gets RTMP URL + Stream Key
    2. create_broadcast()     → creates the YouTube broadcast event
    3. bind_stream()          → links stream → broadcast
    4. [Push video via FFmpeg or OBS using RTMP URL + Key]
    5. start_live()           → transitions broadcast to "live"
    6. stop_live()            → transitions broadcast to "complete"

FFmpeg push command (run in a separate terminal after step 3):
    ffmpeg -re -i input.mp4 \
        -c:v libx264 -preset veryfast -b:v 3000k \
        -c:a aac -b:a 128k \
        -f flv rtmp://<RTMP_URL>/<STREAM_KEY>

Requirements:
    pip install google-api-python-client

Usage:
    from auth import get_authenticated_service
    from livestream import run_full_livestream

    youtube = get_authenticated_service()
    run_full_livestream(youtube)
"""

import datetime
from auth import get_authenticated_service


def create_live_stream(youtube, title: str = "My Stream", resolution: str = "1080p") -> dict:
    """
    Creates a YouTube live stream (the RTMP ingest endpoint).

    Args:
        youtube:     Authenticated YouTube API client
        title:       Stream title
        resolution:  Stream resolution — "1080p" | "720p" | "480p" | "360p" | "240p"

    Returns:
        dict with keys: stream_id, rtmp_url, stream_key
    """
    response = youtube.liveStreams().insert(
        part="snippet,cdn,status",
        body={
            "snippet": {
                "title": title
            },
            "cdn": {
                "format": resolution,
                "ingestionType": "rtmp",
                "frameRate": "30fps",
                "resolution": resolution
            }
        }
    ).execute()

    stream_id  = response["id"]
    rtmp_url   = response["cdn"]["ingestionInfo"]["ingestionAddress"]
    stream_key = response["cdn"]["ingestionInfo"]["streamName"]

    print(f"[STREAM] Stream created!")
    print(f"[STREAM] Stream ID  : {stream_id}")
    print(f"[STREAM] RTMP URL   : {rtmp_url}")
    print(f"[STREAM] Stream Key : {stream_key}")
    print(f"\n[STREAM] FFmpeg command to push video:")
    print(f"  ffmpeg -re -i input.mp4 \\")
    print(f"    -c:v libx264 -preset veryfast -b:v 3000k \\")
    print(f"    -c:a aac -b:a 128k \\")
    print(f"    -f flv {rtmp_url}/{stream_key}\n")

    return {
        "stream_id":  stream_id,
        "rtmp_url":   rtmp_url,
        "stream_key": stream_key
    }


def create_broadcast(
    youtube,
    title: str = "My Live Broadcast",
    description: str = "",
    privacy: str = "public",
    enable_auto_start: bool = True,
    enable_auto_stop: bool = True,
    enable_dvr: bool = True
) -> str:
    """
    Creates a YouTube live broadcast event.

    Args:
        youtube:            Authenticated YouTube API client
        title:              Broadcast title shown on YouTube
        description:        Broadcast description
        privacy:            "public" | "private" | "unlisted"
        enable_auto_start:  Auto-start when stream data is detected
        enable_auto_stop:   Auto-stop when stream ends
        enable_dvr:         Allow viewers to rewind during live stream

    Returns:
        str: Broadcast ID
    """
    # Schedule start time as now (required by API even for immediate streams)
    scheduled_start = datetime.datetime.utcnow().isoformat("T") + "Z"

    response = youtube.liveBroadcasts().insert(
        part="snippet,status,contentDetails",
        body={
            "snippet": {
                "title": title,
                "description": description,
                "scheduledStartTime": scheduled_start
            },
            "status": {
                "privacyStatus": privacy,
                "selfDeclaredMadeForKids": False
            },
            "contentDetails": {
                "enableAutoStart": enable_auto_start,
                "enableAutoStop":  enable_auto_stop,
                "enableDvr":       enable_dvr,
                "recordFromStart": True,         # Save replay after stream
                "enableEmbed":     True
            }
        }
    ).execute()

    broadcast_id  = response["id"]
    broadcast_url = f"https://www.youtube.com/watch?v={broadcast_id}"

    print(f"[BROADCAST] Broadcast created!")
    print(f"[BROADCAST] Broadcast ID  : {broadcast_id}")
    print(f"[BROADCAST] Broadcast URL : {broadcast_url}\n")

    return broadcast_id


def bind_stream(youtube, broadcast_id: str, stream_id: str):
    """
    Binds (links) a live stream to a broadcast.
    Must be done before going live.

    Args:
        youtube:        Authenticated YouTube API client
        broadcast_id:   Broadcast ID from create_broadcast()
        stream_id:      Stream ID from create_live_stream()
    """
    youtube.liveBroadcasts().bind(
        part="id,contentDetails",
        id=broadcast_id,
        streamId=stream_id
    ).execute()

    print(f"[BIND] Stream {stream_id} bound to broadcast {broadcast_id} ✅\n")


def start_live(youtube, broadcast_id: str):
    """
    Transitions the broadcast to LIVE status.
    The stream must already be receiving video data via RTMP.

    Args:
        youtube:        Authenticated YouTube API client
        broadcast_id:   Broadcast ID to go live
    """
    youtube.liveBroadcasts().transition(
        broadcastStatus="live",
        id=broadcast_id,
        part="status"
    ).execute()

    print(f"[LIVE] 🔴 Broadcast {broadcast_id} is now LIVE!")
    print(f"[LIVE] Watch: https://www.youtube.com/watch?v={broadcast_id}\n")


def stop_live(youtube, broadcast_id: str):
    """
    Transitions the broadcast to COMPLETE (ended) status.
    The stream recording will be saved as a replay video.

    Args:
        youtube:        Authenticated YouTube API client
        broadcast_id:   Broadcast ID to stop
    """
    youtube.liveBroadcasts().transition(
        broadcastStatus="complete",
        id=broadcast_id,
        part="status"
    ).execute()

    print(f"[LIVE] ⏹️  Broadcast {broadcast_id} stopped.")
    print(f"[LIVE] Replay saved at: https://www.youtube.com/watch?v={broadcast_id}\n")


def get_stream_status(youtube, stream_id: str) -> str:
    """
    Checks if YouTube is receiving your RTMP stream yet.
    Call this after pushing video — wait for "active" before going live.

    Args:
        youtube:    Authenticated YouTube API client
        stream_id:  Stream ID from create_live_stream()

    Returns:
        str: Stream status — "active" | "inactive" | "error"
    """
    response = youtube.liveStreams().list(
        part="status",
        id=stream_id
    ).execute()

    status = response["items"][0]["status"]["streamStatus"]
    health = response["items"][0]["status"].get("healthStatus", {}).get("status", "unknown")

    print(f"[STATUS] Stream status : {status}")
    print(f"[STATUS] Health status : {health}")
    return status


def run_full_livestream(youtube):
    """
    Full end-to-end livestream flow with interactive prompts.
    """
    print("=" * 55)
    print("  YouTube Livestream — Full Flow")
    print("=" * 55 + "\n")

    # Step 1: Create stream (get RTMP credentials)
    stream = create_live_stream(youtube, title="My Live Stream", resolution="1080p")

    # Step 2: Create broadcast event
    broadcast_id = create_broadcast(
        youtube,
        title="My Live Broadcast",
        description="Live via Python API",
        privacy="public"
    )

    # Step 3: Link them together
    bind_stream(youtube, broadcast_id, stream["stream_id"])

    # Step 4: Push RTMP video
    print("[ACTION] Now push your video using the FFmpeg command above.")
    print("[ACTION] Or use OBS with the RTMP URL + Stream Key.\n")
    input("Press Enter once FFmpeg/OBS is running and pushing video...")

    # Optional: check stream health
    print()
    status = get_stream_status(youtube, stream["stream_id"])
    if status != "active":
        print("[WARNING] Stream not active yet. Wait a few seconds and try again.")
        input("Press Enter when ready to go LIVE anyway...")

    # Step 5: Go live
    start_live(youtube, broadcast_id)
    input("\nPress Enter to STOP the broadcast...\n")

    # Step 6: End stream
    stop_live(youtube, broadcast_id)

    print("\n[DONE] Livestream complete! ✅")
    print(f"[DONE] Replay: https://www.youtube.com/watch?v={broadcast_id}")


# ── Quick test ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    youtube = get_authenticated_service()
    run_full_livestream(youtube)
