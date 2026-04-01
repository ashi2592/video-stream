"""
Part 1: YouTube API Authentication
------------------------------------
Handles OAuth2 authentication with Google/YouTube API.
Saves and reloads token to avoid re-authenticating every run.

Requirements:
    pip install google-auth google-auth-oauthlib google-api-python-client

Setup:
    1. Go to https://console.cloud.google.com/
    2. Create a project → Enable "YouTube Data API v3"
    3. Create OAuth 2.0 credentials → Download as "client_secret.json"
    4. Place "client_secret.json" in the same directory as this file
"""

import os
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

# Scopes define what permissions your app requests
SCOPES = [
    "https://www.googleapis.com/auth/youtube",          # Full YouTube account access
    "https://www.googleapis.com/auth/youtube.upload"    # Upload videos
]

TOKEN_FILE = "token.json"
CLIENT_SECRET_FILE = "client_secret.json"


def get_authenticated_service():
    """
    Authenticates with the YouTube API using OAuth2.

    - On first run: opens browser for Google login, saves token.json
    - On later runs: loads saved token.json (no browser needed)
    - Auto-refreshes expired tokens

    Returns:
        googleapiclient.discovery.Resource: Authenticated YouTube API client
    """
    creds = None

    # Load existing token if available
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        print("[AUTH] Loaded existing credentials from token.json")

    # If no valid creds, refresh or re-authenticate
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            # Silently refresh without opening browser
            creds.refresh(Request())
            print("[AUTH] Token refreshed successfully")
        else:
            # First-time login — opens browser
            print("[AUTH] No valid token found. Opening browser for login...")
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
            creds = flow.run_local_server(port=8081)
            print("[AUTH] Login successful!")

        # Save token for future runs
        with open(TOKEN_FILE, "w") as token_file:
            token_file.write(creds.to_json())
        print(f"[AUTH] Token saved to {TOKEN_FILE}")

    youtube = build("youtube", "v3", credentials=creds)
    print("[AUTH] YouTube API client ready\n")
    return youtube


def revoke_token():
    """
    Deletes the saved token to force a fresh login next time.
    Useful when switching accounts or resetting permissions.
    """
    if os.path.exists(TOKEN_FILE):
        os.remove(TOKEN_FILE)
        print("[AUTH] Token revoked. You will be asked to log in again next run.")
    else:
        print("[AUTH] No token found — nothing to revoke.")


# ── Quick test ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    youtube = get_authenticated_service()

    # Verify by fetching your channel info
    response = youtube.channels().list(part="snippet", mine=True).execute()
    channel = response["items"][0]["snippet"]
    print(f"[AUTH] Logged in as: {channel['title']}")
    print(f"[AUTH] Channel description: {channel.get('description', '(none)')[:80]}")
