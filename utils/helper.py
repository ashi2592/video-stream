
from http.client import HTTPException
import os
import re

from fastapi import UploadFile
from config.config  import UPLOAD_DIR, MAX_FILE_SIZE

def _safe_filename(filename: str) -> str:
    name = os.path.basename(filename or "upload.mp4")
    name = re.sub(r"[^\w.\-]", "_", name)
    return name or "upload.mp4"


def _build_path(video_id: str, filename: str) -> str:
    safe = _safe_filename(filename)
    return os.path.abspath(os.path.join(UPLOAD_DIR, f"{video_id}_{safe}"))


async def _save_upload(file: UploadFile, dest_path: str) -> int:
    size = 0
    try:
        with open(dest_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_FILE_SIZE:
                    raise HTTPException(400, "File exceeds 500 MB limit.")
                f.write(chunk)
            f.flush()
            os.fsync(f.fileno())
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"File save failed: {exc}") from exc
    return size

