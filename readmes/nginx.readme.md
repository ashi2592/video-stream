docker stop rtmp-server && docker rm rtmp-server

docker run -d \
  -p 1935:1935 \
  -p 8080:8080 \
  -v $(pwd)/config/nginx.conf:/etc/nginx/nginx.conf:ro \
  --name rtmp-server \
  alqutami/rtmp-hls



mkdir -p $(pwd)/data/hls/live $(pwd)/data/hls/processed
mkdir -p $(pwd)/data/dash/live $(pwd)/data/dash/processed
chmod -R 777 $(pwd)/data
mkdir -p /tmp/hls/live
mkdir -p /tmp/hls/processed
mkdir -p /tmp/dash/live
mkdir -p /tmp/dash/processed
chmod -R 777 /tmp/hls /tmp/dash

docker stop rtmp-server && docker rm rtmp-server

docker run -d \
  -p 1935:1935 \
  -p 8080:8080 \
  -v $(pwd)/config/nginx.conf:/etc/nginx/nginx.conf:ro \
  -v $(pwd)/data/hls:/tmp/hls \
  -v $(pwd)/data/dash:/tmp/dash \
  --name rtmp-server \
  alqutami/rtmp-hls

  
# Should return "ok"
curl http://localhost:8080/health

# Should return XML with stream stats
curl http://localhost:8080/stat


ffmpeg -re -i input.mp4 -c copy -f flv rtmp://localhost:1935/live/ddsds44434


rtmp://192.168.31.124:1935/live/stream_key - use to stream it