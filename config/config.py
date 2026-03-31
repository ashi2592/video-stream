# config/config.py
import os

UPLOAD_DIR    = os.getenv("UPLOAD_DIR",     os.path.join(os.getcwd(), "uploads"))
OUTPUT_DIR    = os.getenv("OUTPUT_DIR",     os.path.join(os.getcwd(), "outputs"))
MEDIA_BASE    = os.getenv("MEDIA_BASE_URL", "http://localhost:8000")
RTMP_BASE     = os.getenv("RTMP_BASE",      "rtmp://localhost:1935/live")
HLS_BASE_URL  = os.getenv("HLS_BASE_URL",   "http://localhost:8080/hls")
NGINX_STAT    = os.getenv("NGINX_STAT_URL", "http://localhost:8080/stat")
REDIS_URL     = os.getenv("REDIS_URL",      "redis://localhost:6379/0")
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 500 * 1024 * 1024))