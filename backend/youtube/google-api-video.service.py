import os
import datetime
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from googleapiclient.http import MediaFileUpload

SCOPES = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.upload"
]

def get_authenticated_service():
    creds = None

    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)

    if not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file(
            "client_secret.json", SCOPES
        )
        creds = flow.run_local_server(port=8080)

        with open("token.json", "w") as token:
            token.write(creds.to_json())

    return build("youtube", "v3", credentials=creds)

def create_live_stream(youtube):
    request = youtube.liveStreams().insert(
        part="snippet,cdn",
        body={
            "snippet": {"title": "My Stream"},
            "cdn": {
                "format": "1080p",
                "ingestionType": "rtmp"
            }
        }
    )
    response = request.execute()

    stream_id = response["id"]
    stream_key = response["cdn"]["ingestionInfo"]["streamName"]
    rtmp_url = response["cdn"]["ingestionInfo"]["ingestionAddress"]

    print("RTMP URL:", rtmp_url)
    print("Stream Key:", stream_key)

    return stream_id

def bind_stream(youtube, broadcast_id, stream_id):
    youtube.liveBroadcasts().bind(
        part="id,contentDetails",
        id=broadcast_id,
        streamId=stream_id
    ).execute()

def start_live(youtube, broadcast_id):
    youtube.liveBroadcasts().transition(
        broadcastStatus="live",
        id=broadcast_id,
        part="status"
    ).execute()

def stop_live(youtube, broadcast_id):
    youtube.liveBroadcasts().transition(
        broadcastStatus="complete",
        id=broadcast_id,
        part="status"
    ).execute()

from googleapiclient.http import MediaFileUpload

def upload_video(youtube, file_path):
    request = youtube.videos().insert(
        part="snippet,status",
        body={
            "snippet": {
                "title": "Uploaded Video",
                "description": "Uploaded via Python API"
            },
            "status": {
                "privacyStatus": "public"
            }
        },
        media_body=MediaFileUpload(file_path, resumable=True)
    )

    response = request.execute()
    print("Uploaded Video ID:", response["id"])


if __name__ == "__main__":
    youtube = get_authenticated_service()

    # 🔴 Live Setup
    stream_id = create_live_stream(youtube)
    broadcast_id = create_broadcast(youtube)

    bind_stream(youtube, broadcast_id, stream_id)

    print("Now push video using RTMP (FFmpeg/mobile)")
    input("Press Enter to go LIVE...")

    start_live(youtube, broadcast_id)

    input("Press Enter to STOP...")
    stop_live(youtube, broadcast_id)

    # 🎥 Upload Example
    upload_video(youtube, "sample.mp4")
