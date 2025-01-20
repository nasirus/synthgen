import json
import pika
from litellm import completion
from typing import Dict, Any
from datetime import datetime
from models.event import Base, Event
from schemas.status import TaskStatus
from core.config import settings
import logging
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential
from database.session import engine, SessionLocal

load_dotenv()


class MessageConsumer:
    def __init__(self):
        self._setup_logging()
        self._initialize_db()
        self._initialize_rabbitmq()

    def _setup_logging(self):
        self.logger = logging.getLogger(__name__)
        self.logger.setLevel(logging.INFO)

        # Create handlers
        console_handler = logging.StreamHandler()
        file_handler = logging.FileHandler("consumer.log")

        # Create formatters and add it to handlers
        log_format = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        console_handler.setFormatter(log_format)
        file_handler.setFormatter(log_format)

        # Add handlers to the logger
        self.logger.addHandler(console_handler)
        self.logger.addHandler(file_handler)

    def _initialize_db(self):
        self.logger.info("Initializing database connection")
        Base.metadata.create_all(bind=engine)
        self.SessionLocal = SessionLocal
        self.logger.info("Database connection initialized successfully")

    def _initialize_rabbitmq(self):
        self.logger.info("Initializing RabbitMQ connection")
        credentials = pika.PlainCredentials(
            username=settings.RABBITMQ_USER, password=settings.RABBITMQ_PASS
        )
        parameters = pika.ConnectionParameters(
            host=settings.RABBITMQ_HOST,
            port=settings.RABBITMQ_PORT,
            credentials=credentials,
        )
        self.connection = pika.BlockingConnection(parameters)
        self.channel = self.connection.channel()
        self.channel.queue_declare(queue="data_generation_tasks", durable=True)
        self.logger.info("RabbitMQ connection initialized successfully")

    def _update_event_status(
        self, message_id: str, status: TaskStatus, result: Dict[str, Any] = None
    ):
        self.logger.debug(f"Updating event status for message {message_id} to {status}")
        db_session = self.SessionLocal()
        try:
            event = (
                db_session.query(Event).filter(Event.message_id == message_id).first()
            )
            if event:
                event.status = status.value
                if result:
                    event.result = json.dumps(result)
                updated_at = datetime.now()
                event.updated_at = updated_at
                event.duration = (updated_at - event.created_at).total_seconds()
                db_session.commit()
        finally:
            db_session.close()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        reraise=True
    )
    def _send_llm_request(self, payload):
        return completion(model=payload["model"], messages=payload["messages"])

    def process_message(self, ch, method, properties, body):
        message_data = json.loads(body)
        message_id = message_data["message_id"]
        payload = message_data["payload"]

        self.logger.info(f"Processing message {message_id}")

        try:
            self.logger.debug(f"Updating status to PROCESSING for message {message_id}")
            self._update_event_status(message_id, TaskStatus.PROCESSING)

            self.logger.debug(f"Sending request to LLM for message {message_id}")
            response = self._send_llm_request(payload)

            result = {
                "completion": response.choices[0].message.content,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                },
            }

            self.logger.debug(f"Updating status to COMPLETED for message {message_id}")
            self._update_event_status(message_id, TaskStatus.COMPLETED, result)
            self.logger.info(f"Successfully processed message {message_id}")

        except Exception as e:
            self.logger.error(
                f"Error processing message {message_id}: {str(e)}", exc_info=True
            )
            self._update_event_status(message_id, TaskStatus.FAILED, {"error": str(e)})
        finally:
            ch.basic_ack(delivery_tag=method.delivery_tag)
            self.logger.debug(f"Acknowledged message {message_id}")

    def start_consuming(self):
        self.logger.info("Starting consumer")
        self.channel.basic_qos(prefetch_count=1)
        self.channel.basic_consume(
            queue="data_generation_tasks", on_message_callback=self.process_message
        )
        self.logger.info("Started consuming messages...")
        self.channel.start_consuming()


if __name__ == "__main__":
    consumer = MessageConsumer()
    consumer.start_consuming()
