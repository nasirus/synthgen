import json
from typing import Any, List
from dotenv import load_dotenv
from schemas.task_status import TaskStatus
from database.session import pool
from aio_pika import connect_robust, Message, DeliveryMode
from core.config import settings
import logging

# Create a logger instance at module level
logger = logging.getLogger(__name__)
# Load environment variables
load_dotenv()



class RabbitMQHandler:
    _instance = None  # Class variable to hold the single instance

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(RabbitMQHandler, cls).__new__(cls)
            cls._instance.connection = None
            cls._instance.channel = None
            cls._instance._initialize()  # Call _initialize only once
        return cls._instance

    def _initialize(self):
        # Initialize database by ensuring the events table exists
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS events (
                        batch_id VARCHAR(255),
                        message_id VARCHAR(255) NOT NULL,
                        custom_id VARCHAR(255) NOT NULL,
                        method VARCHAR(255) NOT NULL,
                        url VARCHAR(255) NOT NULL,                       
                        body JSONB,
                        result JSONB,
                        status VARCHAR(50) NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        started_at TIMESTAMP WITH TIME ZONE,
                        completed_at TIMESTAMP WITH TIME ZONE,
                        duration INTEGER,
                        prompt_tokens INTEGER,
                        completion_tokens INTEGER,
                        total_tokens INTEGER,
                        cached BOOLEAN DEFAULT FALSE,
                        attempt INTEGER DEFAULT 0,
                        dataset VARCHAR(255),
                        source JSONB
                    )
                """
                )
        # Initialize queues
        self.connect_sync()

    def connect_sync(self):
        """Establish sync connection to RabbitMQ to declare queues"""
        import pika

        parameters = pika.ConnectionParameters(
            host=settings.RABBITMQ_HOST,
            port=settings.RABBITMQ_PORT,
            credentials=pika.PlainCredentials(
                settings.RABBITMQ_USER, settings.RABBITMQ_PASS
            ),
        )
        connection = pika.BlockingConnection(parameters)
        channel = connection.channel()
        channel.queue_declare(queue="data_generation_tasks", durable=True)
        logger.info("Declared data_generation_tasks queue")
        channel.queue_declare(queue="data_generation_batch", durable=True)
        logger.info("Declared data_generation_batch queue")
        connection.close()


    def normalize_payload(self, payload):
        if payload is None:
            return None
        elif isinstance(payload, (str, int, float, bool)):
            return payload
        elif isinstance(payload, list):
            return [self.normalize_payload(item) for item in payload]
        elif isinstance(payload, dict):
            return {k: self.normalize_payload(v) for k, v in sorted(payload.items())}
        else:
            return str(payload)

    async def connect(self):
        """Establish async connection to RabbitMQ"""
        if not self.connection or self.connection.is_closed:
            self.connection = await connect_robust(
                host=settings.RABBITMQ_HOST,
                port=settings.RABBITMQ_PORT,
                login=settings.RABBITMQ_USER,
                password=settings.RABBITMQ_PASS,
            )
            self.channel = await self.connection.channel()

    async def ensure_connection(self):
        """Ensure that async connection and channel are available"""
        try:
            if not self.connection or self.connection.is_closed:
                await self.connect()
            elif not self.channel or self.channel.is_closed:
                self.channel = await self.connection.channel()
        except Exception:
            await self.connect()

    async def publish_bulk_messages(self, messages: List[dict[str, Any]]) -> List[str]:
        """
        Asynchronously publish a batch of messages to RabbitMQ with publisher confirms.
        Each message is expected to already have keys: "message_id", "timestamp",
        "payload", and "batch_id".
        """
        await self.ensure_connection()
        published_message_ids = [msg["message_id"] for msg in messages]

        try:
            # Enable publisher confirms if not already enabled
            await self.channel.set_qos(prefetch_count=settings.CHUNK_SIZE)

            # Publish all messages with confirms
            for message_data in messages:
                msg = Message(
                    body=json.dumps(message_data).encode(),
                    delivery_mode=DeliveryMode.PERSISTENT,
                    message_id=message_data["message_id"],
                    headers={"status": TaskStatus.PENDING.value},
                )
                await self.channel.default_exchange.publish(
                    msg,
                    routing_key="data_generation_tasks",
                    timeout=30,  # Add timeout for publish confirmation
                )

            return published_message_ids

        except Exception:
            raise

    async def publish_message(self, message: dict[str, Any]):
        """
        Publish a single message to the RabbitMQ queue.  This is used for
        the file upload metadata.
        """
        await self.ensure_connection()
        logger.info(f"Publishing message to RabbitMQ: {message}")
        try:
            msg = Message(
                body=json.dumps(message).encode(),
                delivery_mode=DeliveryMode.PERSISTENT,
            )
            await self.channel.default_exchange.publish(
                msg,
                routing_key="data_generation_batch",
                timeout=30,
            )
        except Exception:
            raise
