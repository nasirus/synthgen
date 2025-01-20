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
import time

load_dotenv()


class MessageConsumer:
    def __init__(self):
        self._setup_logging()
        self._initialize_db()
        self._connect_to_rabbitmq()

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

    def _connect_to_rabbitmq(self):
        """Establish connection to RabbitMQ with retry mechanism"""
        self.logger.info("Initializing RabbitMQ connection")
        while True:
            try:
                credentials = pika.PlainCredentials(
                    username=settings.RABBITMQ_USER, password=settings.RABBITMQ_PASS
                )
                parameters = pika.ConnectionParameters(
                    host=settings.RABBITMQ_HOST,
                    port=settings.RABBITMQ_PORT,
                    credentials=credentials,
                    heartbeat=600,  # 10 minutes heartbeat
                    blocked_connection_timeout=300,  # 5 minutes timeout
                    connection_attempts=3,
                    retry_delay=5,
                )
                self.connection = pika.BlockingConnection(parameters)
                self.channel = self.connection.channel()
                self.channel.queue_declare(queue="data_generation_tasks", durable=True)
                self.logger.info("RabbitMQ connection initialized successfully")
                break
            except Exception as e:
                self.logger.error(f"Failed to connect to RabbitMQ: {str(e)}")
                self.logger.info("Retrying in 5 seconds...")
                time.sleep(5)

    def _ensure_connection(self):
        """Ensure the connection is active, reconnect if necessary"""
        try:
            if not self.connection or self.connection.is_closed:
                self.logger.warning("RabbitMQ connection is closed. Reconnecting...")
                self._connect_to_rabbitmq()
            if not self.channel or self.channel.is_closed:
                self.logger.warning("RabbitMQ channel is closed. Recreating channel...")
                self.channel = self.connection.channel()
                self.channel.queue_declare(queue="data_generation_tasks", durable=True)
        except Exception as e:
            self.logger.error(f"Error ensuring connection: {str(e)}")
            self._connect_to_rabbitmq()

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
        reraise=True,
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
        """Start consuming messages with automatic recovery"""
        while True:
            try:
                self.logger.info("Starting consumer")
                self._ensure_connection()
                self.channel.basic_qos(prefetch_count=1)
                self.channel.basic_consume(
                    queue="data_generation_tasks",
                    on_message_callback=self.process_message,
                )
                self.logger.info("Started consuming messages...")
                self.channel.start_consuming()
            except pika.exceptions.ConnectionClosedByBroker:
                self.logger.warning("Connection closed by broker, retrying...")
                continue
            except pika.exceptions.AMQPChannelError as e:
                self.logger.error(f"Channel error: {str(e)}, retrying...")
                continue
            except pika.exceptions.AMQPConnectionError:
                self.logger.error("Connection was closed, retrying...")
                continue
            except Exception as e:
                self.logger.error(f"Unexpected error: {str(e)}")
                self.logger.info("Retrying in 5 seconds...")
                time.sleep(5)
                continue


if __name__ == "__main__":
    import time

    while True:
        try:
            consumer = MessageConsumer()
            consumer.start_consuming()
        except KeyboardInterrupt:
            if consumer.connection and not consumer.connection.is_closed:
                consumer.connection.close()
            break
        except Exception as e:
            logging.error(f"Main loop error: {str(e)}")
            logging.info("Restarting consumer in 5 seconds...")
            time.sleep(5)
