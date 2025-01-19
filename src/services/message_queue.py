import os
import json
import pika
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class RabbitMQHandler:
    def __init__(self):
        self.connection = None
        self.channel = None
        
    def connect(self):
        if not self.connection or self.connection.is_closed:
            credentials = pika.PlainCredentials(
                username=os.getenv('RABBITMQ_USER', 'guest'),
                password=os.getenv('RABBITMQ_PASS', 'guest')
            )
            parameters = pika.ConnectionParameters(
                host=os.getenv('RABBITMQ_HOST', 'localhost'),
                port=int(os.getenv('RABBITMQ_PORT', 5672)),
                credentials=credentials
            )
            self.connection = pika.BlockingConnection(parameters)
            self.channel = self.connection.channel()
            # Declare the queue
            self.channel.queue_declare(queue='data_generation_tasks')
    
    def publish_message(self, message):
        self.connect()
        self.channel.basic_publish(
            exchange='',
            routing_key='data_generation_tasks',
            body=json.dumps(message),
            properties=pika.BasicProperties(
                delivery_mode=2  # make message persistent
            )
        ) 