
````markdown
# 🎬 StreamForge Backend

FastAPI-based backend for video upload, processing (FFmpeg), live streaming, and delivery via AWS S3.

---

## 🚀 Features

- 📤 Video upload API
- ⚙️ Async processing with Celery + Redis
- 🎞 FFmpeg pipeline (HLS, MP4, WebM)
- 🏷 Dynamic overlays (watermark + timestamp)
- ☁️ AWS S3 storage + CloudFront delivery
- 📡 RTMP live streaming support
- 🗄 MongoDB for metadata storage

---

## 🧱 Tech Stack

| Layer        | Technology        |
|--------------|------------------|
| Backend      | FastAPI (Python 3.11) |
| Queue        | Celery + Redis   |
| Database     | MongoDB          |
| Processing   | FFmpeg           |
| Storage      | AWS S3           |
| Streaming    | nginx-rtmp       |

---

## ⚙️ Setup

### 🔹 Option 1: Docker (Recommended)

```bash
docker-compose up --build
````

### Services

| Service | URL                                                      |
| ------- | -------------------------------------------------------- |
| API     | [http://localhost:8000](http://localhost:8000)           |
| Docs    | [http://localhost:8000/docs](http://localhost:8000/docs) |
| Redis   | localhost:6379                                           |
| MongoDB | localhost:27017                                          |
| RTMP    | rtmp://localhost:1935/live                               |

---

## 💻 Option 2: Local Development

### 1. Create virtual environment

```bash
python3 -m venv .venv
```

### 2. Activate

```bash
source .venv/bin/activate
```

(Windows)

```bash
.venv\Scripts\Activate
```

---

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

---

### 4. Run FastAPI

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2 --reload
```

---

### 5. Run Celery Worker

```bash
celery -A tasks worker --loglevel=info
```

---

### 6. Start Redis

```bash
redis-server
```

---

### 7. Start MongoDB

```bash
mongod --dbpath /data/db
```

---

## 🔁 Workflow

```
Client → FastAPI → Celery → FFmpeg → S3 → Playback URLs
```

---

## 📡 API Endpoints

| Method | Endpoint            | Description         |
| ------ | ------------------- | ------------------- |
| POST   | `/upload`           | Upload video        |
| GET    | `/status/{task_id}` | Processing status   |
| GET    | `/video/{id}/urls`  | Playback URLs       |
| GET    | `/stream/key`       | Generate stream key |
| GET    | `/health`           | Health check        |

---

## 🔐 Environment Variables

Create `.env` file:

```env
MONGO_URI=mongodb://root:password@localhost:27017
REDIS_URL=redis://localhost:6379/0

AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=ap-south-1
S3_BUCKET=your_bucket

SECRET_KEY=your_secret
```

---

## 🎞 FFmpeg Pipeline

* Codec: H.264 (libx264)
* CRF: 23
* Output:

  * HLS (720p / 480p / 360p)
  * MP4
  * WebM (VP9)

---

## 🛠 Troubleshooting

| Issue              | Solution               |
| ------------------ | ---------------------- |
| Celery not working | Check Redis connection |
| Mongo error        | Verify MONGO_URI       |
| Upload fails       | Check file size limits |
| FFmpeg error       | Ensure installed       |

---

## 📁 Project Structure

```
backend/
├── main.py
├── tasks.py
├── ffmpeg_utils.py
├── s3_utils.py
├── models_pymongo.py
├── requirements.txt
└── Dockerfile
```

---

## ✅ Production Checklist

* [ ] Use strong `SECRET_KEY`
* [ ] Use IAM role instead of AWS keys
* [ ] Enable S3 versioning
* [ ] Setup CloudFront CDN
* [ ] Add rate limiting
* [ ] Monitor Celery (Flower)

---

## 📜 License

MIT License

