# RTMP Streaming Server Setup (Docker + FFmpeg)

This guide helps you set up a local RTMP server using Docker and stream video using FFmpeg.

---

## 🚀 Step 1: Pull Docker Image

Download the RTMP-enabled NGINX image:

```bash
docker pull alfg/nginx-rtmp
```

---

## ▶️ Step 2: Run RTMP Server

Start the container:

```bash
docker run -d \
  --name rtmp-server \
  -p 1935:1935 \
  -p 8080:80 \
  alfg/nginx-rtmp
```

---

## ✅ Step 3: Verify Server

Check if container is running:

```bash
docker ps
```

Check logs:

```bash
docker logs rtmp-server
```

---

## ⚙️ Step 4: RTMP Configuration

Default RTMP block:

```nginx
application live {
    live on;
    record off;
}
```

---

## 🔗 RTMP URL Format (IMPORTANT)

```
rtmp://localhost:1935/live/<stream_key>
```

### Example:

```
rtmp://localhost:1935/live/test123
```

---

## 🐳 Step 5: Inspect NGINX Config (Optional)

```bash
docker exec -it rtmp-server cat /etc/nginx/nginx.conf
```

---

## 🎥 Step 6: Test Streaming with FFmpeg

Stream a video file:

```bash
ffmpeg -re -i raw.mp4 \
  -c:v libx264 \
  -c:a aac \
  -f flv \
  rtmp://localhost:1935/live/test
```

---

## 📺 Notes

* Port `1935` → RTMP ingest
* Port `8080` → HTTP (for stats or playback if configured)
* Replace `raw.mp4` with your input video
* Replace `test` with your desired stream key

---

## 🧪 Troubleshooting

* Ensure ports are not already in use
* Check logs: `docker logs rtmp-server`
* Verify FFmpeg installation: `ffmpeg -version`

---

## 🎉 You're Ready!

You now have a working RTMP server and can stream video locally.



docker run -d \
  -p 1935:1935 \
  -p 8080:8080 \
  -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro \
  --name nginx-rtmp \
  tiangolo/nginx-rtmp