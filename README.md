# StreamForge — Video Upload & Live Streaming Platform

Mobile-first video platform with upload, FFmpeg compression, dynamic frame overlays,
multi-format transcoding (HLS / MP4 / WebM), and AWS S3 storage.

---

## Stack

| Layer        | Technology                          |
|--------------|-------------------------------------|
| Frontend     | React 18 + Vite (PWA, mobile-first) |
| Backend      | FastAPI (Python 3.11)               |
| Processing   | FFmpeg (libx264, libvpx-vp9, HLS)  |
| Task Queue   | Celery + Redis                      |
| Database     | PostgreSQL 16                       |
| Storage      | AWS S3 + CloudFront CDN             |
| Live Stream  | nginx-rtmp-module                   |

---

## Quick Start

### 1. Clone & configure

```bash
cp .env.example .env
# Edit .env — fill in AWS credentials and S3 bucket name
```

### 2. Start all services

```bash
docker compose up --build
```

| Service         | URL / Port                    |
|-----------------|-------------------------------|
| Frontend        | http://localhost:3000         |
| FastAPI docs    | http://localhost:8000/docs    |
| Celery monitor  | http://localhost:5555         |
| RTMP ingest     | rtmp://localhost:1935/live    |

---

## Video Upload Flow

```
Mobile Browser
  └─ POST /upload (multipart video file)
       └─ FastAPI saves to /tmp/uploads
            └─ Celery task queued
                 └─ FFmpeg pipeline:
                      1. Compress (CRF 23, libx264)
                      2. Burn dynamic overlay (ID watermark + timestamp)
                      3. Multi-bitrate HLS (720p / 480p / 360p)
                      4. WebM VP9 fallback (480p)
                 └─ Upload all files to S3
                 └─ Cleanup local temp files
  └─ GET /status/{task_id}  ← poll until SUCCESS
  └─ GET /video/{id}/urls   ← get playback URLs
```

### FFmpeg Compression Settings

| Setting        | Value           | Notes                           |
|----------------|-----------------|---------------------------------|
| Video codec    | libx264         | H.264, universal browser support|
| CRF            | 23              | 0=lossless, 51=worst; 23=balanced|
| Preset         | fast            | Speed vs compression tradeoff   |
| Audio          | AAC 128k        | Stereo                          |
| Output scale   | 1280×720        | Letterboxed, aspect preserved   |
| HLS segments   | 6s each         | VOD; use 2s for live            |
| HLS variants   | 720p/480p/360p  | Adaptive bitrate                |

### Dynamic Frame Overlays

Two overlays are burned into every video:

1. **Video ID watermark** (top-left) — semi-transparent box with the first 8 chars of the video UUID
2. **Live timestamp** (top-right) — current date/time stamped per-frame

To customise overlays, edit `ffmpeg_utils.py` → the `vf_filter` string.
FFmpeg drawtext filter reference: https://ffmpeg.org/ffmpeg-filters.html#drawtext

---

## Live Streaming Flow

```
OBS / Larix / Mobile camera
  └─ RTMP → nginx:1935/live/{stream_key}
       └─ nginx-rtmp triggers FFmpeg on-publish
            └─ Writes HLS segments to /tmp/hls/
       └─ nginx serves /hls/{stream_key}.m3u8
  └─ Viewer: VideoPlayer (HLS.js) pulls segments
```

### Stream from OBS

1. Open OBS → Settings → Stream
2. Service: **Custom**
3. Server: `rtmp://your-server-ip/live`
4. Stream Key: value from `GET /stream/key`

### Stream from Mobile

Use **Larix Broadcaster** (iOS/Android):
- Settings → Connections → New
- URL: `rtmp://your-server-ip/live/{stream_key}`

---

## API Reference

| Method | Endpoint                  | Description                        |
|--------|---------------------------|------------------------------------|
| POST   | `/upload`                 | Upload video file                  |
| GET    | `/status/{task_id}`       | Poll processing status             |
| GET    | `/video/{id}/urls`        | Get HLS / MP4 / WebM playback URLs |
| GET    | `/stream/key`             | Generate RTMP stream key           |
| GET    | `/health`                 | Health check                       |
| GET    | `/docs`                   | Interactive API docs (Swagger UI)  |

---

## AWS S3 Setup

### Bucket policy (public read for CloudFront)

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::your-bucket-name/*"
  }]
}
```

### CORS configuration (required for HLS.js)

```json
[{
  "AllowedHeaders": ["*"],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedOrigins": ["*"],
  "ExposeHeaders": ["ETag"]
}]
```

### Recommended S3 region

Use `ap-south-1` (Mumbai) for lowest latency from India.

---

## Environment Variables

| Variable              | Required | Description                             |
|-----------------------|----------|-----------------------------------------|
| `AWS_ACCESS_KEY_ID`   | Yes      | AWS IAM key                             |
| `AWS_SECRET_ACCESS_KEY` | Yes    | AWS IAM secret                          |
| `AWS_REGION`          | Yes      | e.g. `ap-south-1`                       |
| `S3_BUCKET`           | Yes      | S3 bucket name                          |
| `CLOUDFRONT_URL`      | No       | CDN base URL (faster delivery)          |
| `REDIS_URL`           | Yes      | Redis connection string                 |
| `DATABASE_URL`        | Yes      | PostgreSQL connection string            |
| `SECRET_KEY`          | Yes      | App secret for signing tokens           |

---

## Development (without Docker)

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Celery worker (separate terminal)
celery -A tasks worker --loglevel=info

# Frontend
cd frontend
npm install
npm run dev
```

---

## Production Checklist

- [ ] Set strong `SECRET_KEY` and `POSTGRES_PASSWORD` in `.env`
- [ ] Use IAM role instead of access keys on EC2/ECS
- [ ] Enable S3 versioning for uploaded videos
- [ ] Set up CloudFront distribution for global CDN
- [ ] Configure SSL/TLS (certbot or AWS ACM)
- [ ] Set `DEBUG=false`
- [ ] Add rate limiting to `/upload` endpoint
- [ ] Monitor Celery queue depth (Flower dashboard on :5555)
- [ ] Set `client_max_body_size` in nginx for your max file size

---

## File Structure

```
video-platform/
├── backend/
│   ├── main.py           # FastAPI routes
│   ├── tasks.py          # Celery workers
│   ├── ffmpeg_utils.py   # FFmpeg pipeline
│   ├── s3_utils.py       # S3 multipart upload + URLs
│   ├── models.py         # SQLAlchemy ORM models
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── components/
│   │       ├── VideoUploader.jsx   # Upload + progress + playback
│   │       ├── LiveStreamer.jsx    # RTMP key generator
│   │       └── VideoPlayer.jsx    # HLS.js adaptive player
│   ├── public/manifest.json       # PWA manifest
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
├── nginx/
│   └── nginx.conf         # RTMP + HTTP proxy
├── docker-compose.yml
├── .env.example
└── README.md
```
