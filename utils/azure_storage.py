"""
azure_storage.py
----------------
Azure Blob Storage helpers (drop-in replacement for s3_utils.py):
  - Chunked upload for large files
  - Folder upload (walks directory, preserves structure)
  - SAS URL generation (falls back to CDN/Front Door if configured)
"""

import os
import logging
from pathlib import Path
from azure.storage.blob import (
    BlobServiceClient,
    BlobClient,
    ContentSettings,
    generate_blob_sas,
    BlobSasPermissions,
)
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

AZURE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
AZURE_ACCOUNT_NAME      = os.getenv("AZURE_STORAGE_ACCOUNT_NAME", "yourstorageaccount")
AZURE_ACCOUNT_KEY       = os.getenv("AZURE_STORAGE_ACCOUNT_KEY", "")
CONTAINER_NAME          = os.getenv("AZURE_CONTAINER_NAME", "your-video-container")
CDN_BASE                = os.getenv("AZURE_CDN_URL", "")

# ── Client — no extra kwargs ──────────────────────────────────────────────────
blob_service: BlobServiceClient = BlobServiceClient.from_connection_string(
    AZURE_CONNECTION_STRING
)

CONTENT_TYPES = {
    ".m3u8": "application/vnd.apple.mpegurl",
    ".ts":   "video/mp2t",
    ".mp4":  "video/mp4",
    ".webm": "video/webm",
    ".m4s":  "video/iso.segment",
}

CACHE_CONTROL = {
    ".m3u8": "no-cache, no-store, must-revalidate",
    ".ts":   "public, max-age=31536000, immutable",
    ".mp4":  "public, max-age=31536000, immutable",
    ".webm": "public, max-age=31536000, immutable",
}


def upload_file_to_blob(local_path: str, blob_name: str):
    """Upload a single file with correct content-type and cache headers."""
    suffix        = Path(local_path).suffix.lower()
    content_type  = CONTENT_TYPES.get(suffix, "application/octet-stream")
    cache_control = CACHE_CONTROL.get(suffix, "public, max-age=86400")
    file_size     = os.path.getsize(local_path)

    blob_client: BlobClient = blob_service.get_blob_client(
        container=CONTAINER_NAME, blob=blob_name
    )
    content_settings = ContentSettings(
        content_type=content_type,
        cache_control=cache_control,
    )

    with open(local_path, "rb") as data:
        blob_client.upload_blob(
            data,
            overwrite=True,
            content_settings=content_settings,
            # ✅ no max_single_put_size anywhere — SDK handles chunking automatically
        )

    logger.info(f"Uploaded {blob_name} ({file_size // 1024} KB)")


def upload_folder_to_blob(local_dir: str, blob_prefix: str):
    """Walk a local directory and upload every file to Azure under blob_prefix/."""
    for file_path in Path(local_dir).rglob("*"):
        if file_path.is_file():
            relative  = file_path.relative_to(local_dir)
            blob_name = f"{blob_prefix}/{relative}"
            upload_file_to_blob(str(file_path), blob_name)


def generate_sas_url(blob_name: str, expiry_seconds: int = 3600) -> str:
    """
    Return a playback URL.
    - If CDN is configured: returns CDN URL directly.
    - Otherwise: returns a time-limited SAS URL.
    """
    if CDN_BASE:
        return f"{CDN_BASE.rstrip('/')}/{blob_name}"

    try:
        sas_token = generate_blob_sas(
            account_name=AZURE_ACCOUNT_NAME,
            container_name=CONTAINER_NAME,
            blob_name=blob_name,
            account_key=AZURE_ACCOUNT_KEY,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.now(timezone.utc) + timedelta(seconds=expiry_seconds),
        )
        return (
            f"https://{AZURE_ACCOUNT_NAME}.blob.core.windows.net"
            f"/{CONTAINER_NAME}/{blob_name}?{sas_token}"
        )
    except Exception as e:
        logger.error(f"Could not generate SAS URL for {blob_name}: {e}")
        return ""