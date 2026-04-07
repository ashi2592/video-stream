sudo apt update
sudo apt install -y docker.io
sudo systemctl enable --now docker



docker pull redis:latest
docker run -d --name redis-server -p 6379:6379 redis:latest