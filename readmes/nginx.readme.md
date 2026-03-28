docker stop nginx-rtmp && docker rm nginx-rtmp

docker run -d \
  -p 1935:1935 \
  -p 8080:8080 \
  -v $(pwd)/config/nginx.conf:/etc/nginx/nginx.conf:ro \
  --name nginx-rtmp \
  tiangolo/nginx-rtmp



# Should return "ok"
curl http://localhost:8080/health

# Should return XML with stream stats
curl http://localhost:8080/stat


ffmpeg -re -i input.mp4 -c copy -f flv rtmp://localhost:1935/live/testkey