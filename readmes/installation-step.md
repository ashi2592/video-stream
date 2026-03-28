install wsl

wsl --install

install docker-desktop

wsl --list --verbose

wsl --install --distribution ubuntu

upgrade system
sudo apt update && sudo apt upgrade -y

add docker to user group
sudo usermod -aG docker $USER

sudo chmod -R 777 frontend


celery -A tasks worker --loglevel=info
