import json
from typing import Any
import uuid
import datetime
from dotenv import load_dotenv
from schemas.status import TaskStatus
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from models.event import Base, Event
from core.config import settings
from aio_pika import connect_robust, Message, DeliveryMode

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
        # Initialize async database connection
        database_url = (
            f"postgresql+asyncpg://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
            f"@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
        )
        self.db_engine = create_async_engine(database_url)

        # Create session factory for async sessions
        self.SessionLocal = sessionmaker(
            self.db_engine, 
            class_=AsyncSession, 
            expire_on_commit=False
        )

    async def create_tables(self):
        """Create database tables asynchronously"""
        async with self.db_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    def normalize_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Normalize the payload to ensure consistent field ordering"""
        if isinstance(payload, dict):
            return {k: self.normalize_payload(v) for k, v in sorted(payload.items())}
        return payload

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
            await self.channel.declare_queue(
                "data_generation_tasks",
                durable=True
            )

    async def ensure_connection(self):
        """Ensure that async connection and channel are available"""
        try:
            if not self.connection or self.connection.is_closed:
                await self.connect()
            elif not self.channel or self.channel.is_closed:
                self.channel = await self.connection.channel()
        except Exception:
            await self.connect()

    async def publish_message(self, message: dict[str, Any], batch_id: str = None) -> str:
        """
        Asynchronously publish a message to RabbitMQ
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
            message = Message(
                body=json.dumps(message_with_metadata).encode(),
                delivery_mode=DeliveryMode.PERSISTENT,
                message_id=message_id,
                headers={"status": TaskStatus.PENDING.value}
            )

            await self.channel.default_exchange.publish(
                message,
                routing_key="data_generation_tasks"
            )

            async with self.SessionLocal() as db_session:
                event = Event(
                    message_id=message_id,
                    batch_id=batch_id,
                    created_at=timestamp,
                    status=TaskStatus.PENDING.value,
                    payload=json.dumps(normalized_payload),
                )
                db_session.add(event)
                await db_session.commit()

            return message_id

        except Exception:
            # If first attempt fails, try one more time
            await self.connect()
            message = Message(
                body=json.dumps(message_with_metadata).encode(),
                delivery_mode=DeliveryMode.PERSISTENT,
                message_id=message_id,
                headers={"status": TaskStatus.PENDING.value}
            )
            await self.channel.default_exchange.publish(
                message,
                routing_key="data_generation_tasks"
            )
            
            async with self.SessionLocal() as db_session:
                event = Event(
                    message_id=message_id,
                    batch_id=batch_id,
                    created_at=timestamp,
                    status=TaskStatus.PENDING.value,
                    payload=json.dumps(normalized_payload),
                )
                db_session.add(event)
                await db_session.commit()

            return message_id
