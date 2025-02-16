import json
from typing import Any, List
from dotenv import load_dotenv
from schemas.task_status import TaskStatus
from aio_pika import connect_robust, Message, DeliveryMode
from core.config import settings
import logging
from database.elastic_session import es_client

# Create a logger instance at module level
logger = logging.getLogger(__name__)
# Load environment variables
load_dotenv()


class RabbitMQHandler:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(RabbitMQHandler, cls).__new__(cls)
            cls._instance.connection = None
            cls._instance.channel = None
            cls._instance._initialized = False
        return cls._instance

    async def _initialize(self):
        """Initialize async components"""
        if self._initialized:
            return
            
        # Initialize Elasticsearch index
        await es_client.create_index_if_not_exists()
        
        # Initialize queues
        await self.connect()
        self._initialized = True

    async def ensure_initialized(self):
        """Ensure handler is initialized"""
        if not self._initialized:
            await self._initialize()

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
            # Declare queues with additional parameters
            await self.channel.declare_queue(
                name="data_generation_tasks",
                durable=True,
                auto_delete=False,
                arguments={
                    'x-queue-type': 'classic'
                }
            )
            logger.info("Declared data_generation_tasks queue")
            await self.channel.declare_queue(
                name="data_generation_batch",
                durable=True,
                auto_delete=False,
                arguments={
                    'x-queue-type': 'classic'
                }
            )
            logger.info("Declared data_generation_batch queue")

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

    async def connect_sync(self):
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
        channel.queue_declare(
            queue="data_generation_tasks",
            durable=True,
            auto_delete=False,
            arguments={
                'x-queue-type': 'classic'
            }
        )
        logger.info("Declared data_generation_tasks queue")
        channel.queue_declare(
            queue="data_generation_batch",
            durable=True,
            auto_delete=False,
            arguments={
                'x-queue-type': 'classic'
            }
        )
        logger.info("Declared data_generation_batch queue")
        connection.close()

    async def publish_bulk_messages(
        self, messages: List[dict[str, Any]], queue_name: str
    ) -> List[str]:
        """
        Asynchronously publish a batch of messages to RabbitMQ with publisher confirms.
        Each message is expected to already have keys: "message_id", "timestamp",
        "payload", and "batch_id".
        """
        await self.ensure_initialized()
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
                    routing_key=queue_name,
                    timeout=30,  # Add timeout for publish confirmation
                )

            return published_message_ids

        except Exception:
            raise

    async def publish_message(self, message: dict[str, Any], routing_key: str):
        """
        Publish a single message to the RabbitMQ queue.  This is used for
        the file upload metadata.
        """
        await self.ensure_initialized()
        logger.info(f"Publishing message to RabbitMQ: {message}")

        try:
            msg = Message(
                body=json.dumps(message).encode(),
                delivery_mode=DeliveryMode.PERSISTENT,
            )
            await self.channel.default_exchange.publish(
                msg,
                routing_key=routing_key,
                timeout=30,
            )

        except Exception:
            raise

    async def consume_messages(self, queue_name: str, callback, prefetch_count: int = 1):
        """
        Consume messages from a specified queue.
        
        Args:
            queue_name (str): Name of the queue to consume from
            callback: Callback function to process messages
            prefetch_count (int): Number of messages to prefetch (default: 1)
        """
        channel = await self.connection.channel()
        await channel.set_qos(prefetch_count=prefetch_count)
        
        # Declare the queue
        queue = await channel.declare_queue(queue_name, durable=True)

        async with queue.iterator() as queue_iter:
            async for message in queue_iter:
                try:
                    async with message.process():
                        await callback(message.body)
                except Exception as e:
                    self.logger.error(f"Error processing message: {str(e)}")
                    # Optionally implement dead letter queue handling here
