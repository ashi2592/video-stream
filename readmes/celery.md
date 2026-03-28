
Step 1
# Install the venv module if not already installed
sudo apt update
sudo apt install python3-venv

# Create a virtual environment
python3 -m venv myenv

# Activate the virtual environment
source myenv/bin/activate

Step 2: Install a Message Broker 

sudo apt install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server


Option B: Install RabbitMQ (Recommended for production) 

sudo apt install rabbitmq-server
pip install celery[redis]


If using RabbitMQ as the broker:
pip install celery
# RabbitMQ is the default broker, so no extra package is needed for celery itself.


Verify the Installation

celery --version

Configuration

# Example command to start a Celery worker (adjust based on your project structure)
celery -A your_project_name worker --loglevel=info

examples: 
celery -A tasks worker --loglevel=info