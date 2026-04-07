# News Overlay Templates + Streaming System

## Folder structure

```
news_overlay_templates/
├── template_livewire.json            ← Base "livewire" template (from original JSON)
├── template_breaking_news_alert.json ← High-urgency breaking news, red palette
├── template_split_screen_debate.json ← Side-by-side debate / interview, blue
├── template_market_watch.json        ← Finance / markets, green palette, featured layout
├── template_weather_report.json      ← Storm / weather alerts, purple
├── template_sports_live.json         ← Live scores, triple-col, amber
├── template_election_night.json      ← Election results, 1920×1080, featured
│
├── stream_router.py                  ← FastAPI streaming router (replaces old stream_router.py)
└── seed_templates.py                 ← Seed script: loads all JSONs → MongoDB
```

---

## 1. Seed templates into MongoDB

```bash
# Install deps if needed
pip install pymongo

# Seed all templates (upserts by name — safe to re-run)
python news_overlay_templates/seed_templates.py

# Start fresh (drop first, then seed)
python news_overlay_templates/seed_templates.py --drop

# Dry-run: see what would be inserted without writing
python news_overlay_templates/seed_templates.py --dry-run

# Custom folder
python news_overlay_templates/seed_templates.py --folder /path/to/templates
```

Environment variables:
| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string |
| `DB_NAME` | `livewire` | Database name |

---

## 2. Mount the streaming router

In `main.py`:

```python
from routers.stream_router import router as stream_router
app.include_router(stream_router)
```

---

## 3. API endpoints

### Stream lifecycle

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/stream/key` | Generate a new stream key + all connection URLs |
| `POST` | `/stream/start` | Start FFmpeg with overlay applied from a template |
| `POST` | `/stream/end` | Stop the FFmpeg process for a stream key |
| `GET` | `/stream/active` | Active streams from nginx-rtmp stat XML |
| `GET` | `/stream/sessions` | In-memory FFmpeg session registry |
| `GET` | `/stream/preview-filter/{template_id}` | Preview the FFmpeg `-vf` filter for any template |

### Starting a stream with a template

```bash
# 1. Get a stream key
curl http://localhost:8000/stream/key

# 2. Find a template ID (from /templates endpoint)
curl http://localhost:8000/templates

# 3. Start the stream with overlay
curl -X POST http://localhost:8000/stream/start \
  -H "Content-Type: application/json" \
  -d '{"stream_key": "YOUR_KEY", "template_id": "MONGO_OBJECT_ID"}'

# 4. Push video via FFmpeg
ffmpeg -re -i input.mp4 -c copy -f flv rtmp://localhost:1935/live/YOUR_KEY

# 5. Watch the processed stream
vlc rtmp://localhost:1935/live_processed/YOUR_KEY
# or HLS
vlc http://localhost:8080/live/YOUR_KEY/index.m3u8

# 6. Stop
curl -X POST http://localhost:8000/stream/end \
  -H "Content-Type: application/json" \
  -d '{"stream_key": "YOUR_KEY"}'
```

---

## 4. Template catalogue

| Template | Layout | Resolution | Use case |
|----------|--------|-----------|----------|
| `livewire` | Single | 1280×720 | General-purpose live news |
| `breaking_news_alert` | Single | 1280×720 | Urgent breaking stories |
| `split_screen_debate` | 2-Column | 1280×720 | Live debates / interviews |
| `market_watch` | Featured | 1280×720 | Finance / business coverage |
| `weather_report` | 2-Row | 1280×720 | Weather alerts |
| `sports_live` | 3-Column | 1280×720 | Live scores / multi-feed sport |
| `election_night` | Featured | 1920×1080 | Election results coverage |

---

## 5. nginx-rtmp config snippet

Ensure your `nginx.conf` has both the `live` and `live_processed` applications,
and points the stat and hook URLs at your FastAPI server:

```nginx
rtmp {
    server {
        listen 1935;

        application live {
            live on;
            on_publish http://localhost:8000/stream/hook/publish;
            on_publish_done http://localhost:8000/stream/hook/publish_done;
        }

        application live_processed {
            live on;
            hls on;
            hls_path /tmp/hls;
            hls_fragment 2s;
            hls_playlist_length 10s;
        }
    }
}

http {
    server {
        listen 8080;
        location /live {
            types { application/vnd.apple.mpegurl m3u8; }
            root /tmp/hls;
        }
        location /stat {
            rtmp_stat all;
            rtmp_stat_stylesheet stat.xsl;
        }
    }
}
```

---

## 6. Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PUBLIC_HOST` | _(auto-detected)_ | Force a fixed LAN IP / hostname |
| `RTMP_PORT` | `1935` | RTMP server port |
| `HLS_PORT` | `8080` | nginx HLS HTTP port |
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection |
| `DB_NAME` | `livewire` | MongoDB database |