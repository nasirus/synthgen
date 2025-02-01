import json
from typing import Any, List
import uuid
import datetime
from dotenv import load_dotenv
from schemas.task_status import TaskStatus
from database.session import pool
from aio_pika import connect_robust, Message, DeliveryMode
from core.config import settings

# Load environment variables
load_dotenv()


class RabbitMQHandler:
    def __init__(self):
        self.connection = None
        self.channel = None
        self._initialize()

    def _initialize(self):
        # Initialize database by ensuring the events table exists
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS events (
                        batch_id VARCHAR(255),
                        message_id VARCHAR(255) NOT NULL,
                        status VARCHAR(50) NOT NULL,
                        payload JSONB,
                        result JSONB,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        started_at TIMESTAMP WITH TIME ZONE,
                        completed_at TIMESTAMP WITH TIME ZONE,
                        duration INTEGER,
                        prompt_tokens INTEGER,
                        completion_tokens INTEGER,
                        total_tokens INTEGER,
                        cached BOOLEAN DEFAULT FALSE
                    )
                """
                )

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
            await self.channel.declare_queue("data_generation_tasks", durable=True)

    async def ensure_connection(self):
        """Ensure that async connection and channel are available"""
        try:
            if not self.connection or self.connection.is_closed:
                await self.connect()
            elif not self.channel or self.channel.is_closed:
                self.channel = await self.connection.channel()
        except Exception:
            await self.connect()

    async def publish_message(
        self, message: dict[str, Any], batch_id: str = None
    ) -> str:
        """
        Asynchronously publish a single message to RabbitMQ
        """
        await self.ensure_connection()

        message_id = str(uuid.uuid4())
        timestamp = datetime.datetime.now(datetime.UTC)
        normalized_payload = self.normalize_payload(message)

        message_with_metadata = {
            "message_id": message_id,
            "timestamp": timestamp.isoformat(),
            "payload": normalized_payload,
            "batch_id": batch_id,
        }

        try:
            with pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO events (message_id, batch_id, created_at, status, payload)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        (
                            message_id,
                            batch_id,
                            timestamp,
                            TaskStatus.PENDING.value,
                            json.dumps(normalized_payload),
                        ),
                    )

            msg = Message(
                body=json.dumps(message_with_metadata).encode(),
                delivery_mode=DeliveryMode.PERSISTENT,
                message_id=message_id,
                headers={"status": TaskStatus.PENDING.value},
            )

            await self.channel.default_exchange.publish(
                msg, routing_key="data_generation_tasks"
            )

            return message_id

        except Exception:
            raise

    async def publish_bulk_messages(
        self, messages: List[dict[str, Any]]
    ) -> List[str]:
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
                    timeout=30  # Add timeout for publish confirmation
                )
            
            return published_message_ids

        except Exception:
            raise
