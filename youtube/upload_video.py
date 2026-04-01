"""
Part 2: YouTube Video Upload
-----------------------------
Uploads an MP4 video to YouTube with progress tracking.

Note on HLS:
    YouTube does NOT accept .m3u8 / HLS files directly.
    Convert HLS → MP4 first using FFmpeg:
        ffmpeg -i playlist.m3u8 -c copy output.mp4

Requirements:
    pip install google-api-python-client

Usage:
    from auth import get_authenticated_service
    from upload_video import upload_video

    youtube = get_authenticated_service()
    upload_video(youtube, "output.mp4", title="My Video")
"""

import os
from googleapiclient.http import MediaFileUpload
from auth import get_authenticated_service


# YouTube video category IDs (common ones)
CATEGORIES = {
    "film":         "1",
    "autos":        "2",
    "music":        "10",
    "pets":         "15",
    "sports":       "17",
    "gaming":       "20",
    "people":       "22",
    "comedy":       "23",
    "entertainment":"24",
    "news":         "25",
    "tech":         "28",
    "travel":       "19",
}


def upload_video(
    youtube,
    file_path: str,
    title: str = "Uploaded Video",
    description: str = "Uploaded via Python API",
    tags: list = None,
    category: str = "people",      # See CATEGORIES dict above
    privacy: str = "public",       # "public" | "private" | "unlisted"
    chunk_size_mb: int = 10
) -> str:
    """
    Uploads a video file to YouTube with chunked resumable upload.

    Args:
        youtube:        Authenticated YouTube API client (from auth.py)
        file_path:      Path to the .mp4 file to upload
        title:          Video title shown on YouTube
        description:    Video description
        tags:           List of tag strings, e.g. ["python", "tutorial"]
        category:       Category key from CATEGORIES dict (default: "people")
        privacy:        Privacy setting — "public", "private", or "unlisted"
        chunk_size_mb:  Upload chunk size in MB (default: 10MB)

    Returns:
        str: YouTube video ID of the uploaded video

    Raises:
        FileNotFoundError: If the video file doesn't exist
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Video file not found: {file_path}")

    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    print(f"[UPLOAD] File     : {file_path}")
    print(f"[UPLOAD] Size     : {file_size_mb:.1f} MB")
    print(f"[UPLOAD] Title    : {title}")
    print(f"[UPLOAD] Privacy  : {privacy}")
    print(f"[UPLOAD] Starting upload...\n")

    category_id = CATEGORIES.get(category, "22")

    # Build request body
    body = {
        "snippet": {
            "title": title,
            "description": description,
            "tags": tags or [],
            "categoryId": category_id
        },
        "status": {
            "privacyStatus": privacy,
            "selfDeclaredMadeForKids": False
        }
    }

    # MediaFileUpload handles chunking and resumable upload
    media = MediaFileUpload(
        file_path,
        mimetype="video/mp4",
        resumable=True,
        chunksize=chunk_size_mb * 1024 * 1024
    )

    request = youtube.videos().insert(
        part="snippet,status",
        body=body,
        media_body=media
    )

    # Upload loop — sends chunks and tracks progress
    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            percent = int(status.progress() * 100)
            filled = int(percent / 2)
            bar = "█" * filled + "░" * (50 - filled)
            uploaded_mb = file_size_mb * status.progress()
            print(f"\r  [{bar}] {percent}%  ({uploaded_mb:.1f}/{file_size_mb:.1f} MB)", end="", flush=True)

    print()  # newline after progress bar

    video_id = response["id"]
    video_url = f"https://www.youtube.com/watch?v={video_id}"

    print(f"\n[UPLOAD] ✅ Upload complete!")
    print(f"[UPLOAD] Video ID  : {video_id}")
    print(f"[UPLOAD] Video URL : {video_url}\n")

    return video_id


def delete_video(youtube, video_id: str):
    """
    Permanently deletes a YouTube video by its ID.
    Use with caution — this cannot be undone.

    Args:
        youtube:    Authenticated YouTube API client
        video_id:   YouTube video ID to delete
    """
    youtube.videos().delete(id=video_id).execute()
    print(f"[UPLOAD] 🗑️  Video {video_id} deleted.")


# ── Quick test ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Make sure you have a valid "output.mp4" in the same directory
    TEST_FILE = "input.mp4"

    youtube = get_authenticated_service()

    video_id = upload_video(
        youtube,
        file_path=TEST_FILE,
        title="My Test Upload",
        description="Uploaded using YouTube Data API v3 + Python",
        tags=["python", "api", "youtube"],
        category="tech",
        privacy="unlisted"          # Use "unlisted" for testing
    )

    print(f"Done! Watch here: https://www.youtube.com/watch?v={video_id}")
