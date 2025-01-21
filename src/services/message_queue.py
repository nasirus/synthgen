import json
import pika
import uuid
import datetime
from dotenv import load_dotenv
from schemas.status import TaskStatus
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models.event import Base, Event
from core.config import settings

# Load environment variables
load_dotenv()


class RabbitMQHandler:
    def __init__(self):
        self.connection = None
        self.channel = None
        self.db_engine = None
        self.SessionLocal = None
        self._initialize()

    def _initialize(self):
        # Initialize database connection
        database_url = (
            f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
            f"@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
        )
        self.db_engine = create_engine(database_url)

        # Create tables if they don't exist
        Base.metadata.create_all(bind=self.db_engine)

        # Create session factory
        self.SessionLocal = sessionmaker(
            autocommit=False, autoflush=False, bind=self.db_engine
        )

        # Initialize RabbitMQ connection
        self.connect()

        # Declare the queue with consistent parameters
        self.channel.queue_declare(
            queue="data_generation_tasks",
            durable=True,
        )

    def connect(self):
        if not self.connection or self.connection.is_closed:
            credentials = pika.PlainCredentials(
                username=settings.RABBITMQ_USER,
                password=settings.RABBITMQ_PASS,
            )
            parameters = pika.ConnectionParameters(
                host=settings.RABBITMQ_HOST,
                port=settings.RABBITMQ_PORT,
                credentials=credentials,
            )
            self.connection = pika.BlockingConnection(parameters)
            self.channel = self.connection.channel()

    def ensure_connection(self):
        """Ensure that connection and channel are available"""
        try:
            if not self.connection or self.connection.is_closed:
                self.connect()
            elif not self.channel or self.channel.is_closed:
                self.channel = self.connection.channel()
                # Don't declare the queue here, as it's already declared in connect()
        except (
            pika.exceptions.AMQPConnectionError,
            pika.exceptions.AMQPChannelError
        ):
            # If there's any connection issue, try to reconnect
            self.connect()

    def normalize_payload(self, payload):
        """Normalize the payload to ensure consistent field ordering"""
        if isinstance(payload, dict):
            # Sort keys and recursively normalize nested dictionaries
            return {k: self.normalize_payload(v) for k, v in sorted(payload.items())}
        elif isinstance(payload, list):
            # Normalize each item in the list
            return [self.normalize_payload(item) for item in payload]
        else:
            # Return the item as is if it's not a dict or list
            return payload

    def publish_message(self, message, batch_id: str = None) -> str:
        self.ensure_connection()
        # Generate a unique message ID
        message_id = str(uuid.uuid4())
        timestamp = datetime.datetime.now(datetime.UTC).isoformat()

        # Normalize the payload to ensure consistent field ordering
        normalized_payload = self.normalize_payload(message)

        # Add metadata to the message
        message_with_metadata = {
            "message_id": message_id,
            "timestamp": timestamp,
            "payload": normalized_payload,
            "batch_id": batch_id,
        }

        # Publish message to RabbitMQ
        try:
            self.channel.basic_publish(
                exchange="",
                routing_key="data_generation_tasks",
                body=json.dumps(message_with_metadata),
                properties=pika.BasicProperties(
                    delivery_mode=2,  # make message persistent
                    message_id=message_id,
                ),
            )
        except (pika.exceptions.AMQPConnectionError, pika.exceptions.AMQPChannelError):
            # If publishing fails due to connection issues, try one more time
            self.connect()
            self.channel.basic_publish(
                exchange="",
                routing_key="data_generation_tasks",
                body=json.dumps(message_with_metadata),
                properties=pika.BasicProperties(
                    delivery_mode=2,
                    message_id=message_id,
                    headers={"status": TaskStatus.PENDING.value},
                ),
            )

        # Log event to database
        db_session = self.SessionLocal()
        try:
            event = Event(
                message_id=message_id,
                batch_id=batch_id,
                created_at=timestamp,
                status=TaskStatus.PENDING.value,
                payload=json.dumps(normalized_payload),
            )
            db_session.add(event)
            db_session.commit()
        finally:
            db_session.close()

        return message_id