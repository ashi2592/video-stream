sudo apt install git
sudo apt install git
git --version
git config --global credential.helper store


install docker

sudo apt-get update
sudo apt-get install ca-certificates curl gnupg




sudo apt update

sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
sudo systemctl status nginx


sudo nano /etc/nginx/nginx.conf

Delete everything and paste your full config 

then

sudo rm -f /etc/nginx/sites-enabled/default


sudo mkdir -p /tmp/hls /tmp/dash
sudo chmod -R 777 /tmp/hls /tmp/dash

test it
sudo nginx -t

sudo systemctl restart nginx


sudo docker pull mongo:latest

docker run --name my-mongodb \
  -d \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD="" \
  -v mongo_data:/data/db \
  mongo:latest


sudo apt update
python3 --version


sudo apt install python3 python3-pip -y

python3 --version
pip3 --version

 sudo apt install python3.12-venv