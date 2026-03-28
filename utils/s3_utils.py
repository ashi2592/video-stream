"""
s3_utils.py
-----------
AWS S3 helpers:
  - Multipart upload for large files
  - Folder upload (walks directory, preserves structure)
  - Presigned URL generation (falls back to CloudFront if configured)
"""

import boto3
import os
import logging
from pathlib import Path
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

S3_BUCKET  = os.getenv("S3_BUCKET", "your-video-bucket")
CDN_BASE   = os.getenv("CLOUDFRONT_URL", "")   # e.g. https://d123abc.cloudfront.net
AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")  # Mumbai — closest to Bihar/India

s3 = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=AWS_REGION,
)

# Correct MIME types for video files — critical for browser playback
CONTENT_TYPES = {
    ".m3u8": "application/vnd.apple.mpegurl",
    ".ts":   "video/mp2t",
    ".mp4":  "video/mp4",
    ".webm": "video/webm",
    ".m4s":  "video/iso.segment",
}

# Long cache for immutable segments; no-cache for playlists (they update)
CACHE_CONTROL = {
    ".m3u8": "no-cache, no-store, must-revalidate",
    ".ts":   "public, max-age=31536000, immutable",
    ".mp4":  "public, max-age=31536000, immutable",
    ".webm": "public, max-age=31536000, immutable",
}


def upload_file_to_s3(local_path: str, s3_key: str):
    """Upload a single file with correct content-type and cache headers."""
    suffix = Path(local_path).suffix.lower()
    content_type  = CONTENT_TYPES.get(suffix, "application/octet-stream")
    cache_control = CACHE_CONTROL.get(suffix, "public, max-age=86400")

    file_size = os.path.getsize(local_path)

    # Use multipart for files > 50 MB
    if file_size > 50 * 1024 * 1024:
        _multipart_upload(local_path, s3_key, content_type, cache_control)
    else:
        s3.upload_file(
            local_path, S3_BUCKET, s3_key,
            ExtraArgs={
                "ContentType": content_type,
                "CacheControl": cache_control,
                "ACL": "public-read",
            }
        )
    logger.info(f"Uploaded {s3_key} ({file_size // 1024} KB)")


def _multipart_upload(local_path: str, s3_key: str, content_type: str, cache_control: str):
    """S3 multipart upload for files > 50 MB."""
    CHUNK_SIZE = 10 * 1024 * 1024  # 10 MB per part

    mpu = s3.create_multipart_upload(
        Bucket=S3_BUCKET, Key=s3_key,
        ContentType=content_type, CacheControl=cache_control,
    )
    upload_id = mpu["UploadId"]
    parts = []

    try:
        with open(local_path, "rb") as f:
            part_number = 1
            while chunk := f.read(CHUNK_SIZE):
                response = s3.upload_part(
                    Bucket=S3_BUCKET, Key=s3_key,
                    UploadId=upload_id, PartNumber=part_number, Body=chunk
                )
                parts.append({"PartNumber": part_number, "ETag": response["ETag"]})
                part_number += 1

        s3.complete_multipart_upload(
            Bucket=S3_BUCKET, Key=s3_key,
            UploadId=upload_id,
            MultipartUpload={"Parts": parts}
        )
    except Exception as exc:
        s3.abort_multipart_upload(Bucket=S3_BUCKET, Key=s3_key, UploadId=upload_id)
        raise exc


def upload_folder_to_s3(local_dir: str, s3_prefix: str):
    """Walk a local directory and upload every file to S3 under s3_prefix/."""
    for file_path in Path(local_dir).rglob("*"):
        if file_path.is_file():
            relative = file_path.relative_to(local_dir)
            s3_key = f"{s3_prefix}/{relative}"
            upload_file_to_s3(str(file_path), s3_key)


def generate_presigned_url(s3_key: str, expiry: int = 3600) -> str:
    """
    Return a playback URL.
    - If CloudFront is configured: returns CDN URL (no expiry, no signing overhead).
    - Otherwise: returns a time-limited presigned S3 URL.
    """
    if CDN_BASE:
        return f"{CDN_BASE.rstrip('/')}/{s3_key}"
    try:
        return s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET, "Key": s3_key},
            ExpiresIn=expiry,
        )
    except ClientError as e:
        logger.error(f"Could not generate presigned URL for {s3_key}: {e}")
        return ""
