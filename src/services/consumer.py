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
from concurrent.futures import ThreadPoolExecutor
import logging.handlers
import concurrent.futures
from sqlalchemy import text

load_dotenv()


class MessageConsumer:
    def __init__(self):
        self._setup_logging()
        self._initialize_db()
        self._connect_to_rabbitmq()
        self.executor = ThreadPoolExecutor(max_workers=settings.MAX_PARALLEL_TASKS)

    def _setup_logging(self):
        self.logger = logging.getLogger(__name__)
        self.logger.setLevel(logging.INFO)

        # Create handlers
        console_handler = logging.StreamHandler()
        file_handler = logging.handlers.RotatingFileHandler(
            "consumer.log", maxBytes=10485760, backupCount=5  # 10MB
        )

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
        stop=stop_after_attempt(settings.MAX_RETRIES),
        wait=wait_exponential(multiplier=2, min=4, max=60),
        reraise=True,
        before_sleep=lambda retry_state: logging.info(
            f"Retrying LLM request attempt {retry_state.attempt_number}"
        ),
    )
    def _send_llm_request(self, payload):
        return completion(model=payload["model"], messages=payload["messages"])

    def _get_cached_completion(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Check if there's a cached completion for the given payload"""
        db_session = self.SessionLocal()
        try:
            # Normalize the payload to match the database format
            payload_json = json.dumps(payload, sort_keys=True)

            # Use direct string comparison with escaped quotes
            event = (
                db_session.query(Event)
                .filter(Event.status == TaskStatus.COMPLETED.value)
                .filter(Event.payload == payload_json)
                .first()
            )

            if event and event.result:
                self.logger.info("Found cached completion for payload")
                cached_result = json.loads(event.result)
                # Reset usage data for cached results
                cached_result["usage"] = {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0
                }
                cached_result["cached"] = True
                return cached_result
            return None
        except Exception as e:
            self.logger.error(f"Error checking cache: {str(e)}")
            return None
        finally:
            db_session.close()

    def process_message(self, ch, method, properties, body):
        # Capture message data
        message_data = json.loads(body)
        message_id = message_data["message_id"]
        payload = message_data["payload"]

        self.logger.info(f"Scheduling message {message_id} for processing")

        # Submit to thread pool
        self.executor.submit(
            self.process_message_async, ch, method, body, message_id, payload
        )

    def process_message_async(self, ch, method, body, message_id, payload):
        start_time = time.time()
        try:
            self.logger.debug(
                f"No cache found. Updating status to PROCESSING for message {message_id}"
            )
            self._update_event_status(message_id, TaskStatus.PROCESSING)

            self.logger.debug(f"Checking cache for message {message_id}")

            # Check for cached completion based on payload
            cached_result = self._get_cached_completion(payload)
            if cached_result:
                self.logger.info(f"Using cached completion for message {message_id}")
                self._update_event_status(
                    message_id, TaskStatus.COMPLETED, cached_result
                )
                return

            self.logger.debug(f"Sending request to LLM for message {message_id}")
            response = self._send_llm_request(payload)

            result = {
                "completion": response.choices[0].message.content,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                },
                "cached": False,
            }

            self.logger.debug(f"Updating status to COMPLETED for message {message_id}")
            self._update_event_status(message_id, TaskStatus.COMPLETED, result)
            self.logger.info(f"Successfully processed message {message_id}")

        except concurrent.futures.TimeoutError:
            self.logger.error(f"Message {message_id} processing timed out")
            self._update_event_status(
                message_id, TaskStatus.FAILED, {"error": "Processing timeout"}
            )
        except Exception as e:
            self.logger.error(
                f"Error processing message {message_id}: {str(e)}", exc_info=True
            )
            self._update_event_status(message_id, TaskStatus.FAILED, {"error": str(e)})
        finally:
            processing_time = time.time() - start_time
            self.logger.info(
                f"Message {message_id} processed in {processing_time:.2f} seconds"
            )
            # Use add_callback_threadsafe to ack in the main thread
            self.connection.add_callback_threadsafe(
                lambda: self.callback_ack(ch, method.delivery_tag)
            )

    def callback_ack(self, ch, delivery_tag):
        """Acknowledge the message in the main thread"""
        if ch.is_open:
            ch.basic_ack(delivery_tag)
        else:
            self.logger.warning(
                "Channel closed, message %s not acknowledged", delivery_tag
            )

    def start_consuming(self):
        """Start consuming messages with automatic recovery"""
        while True:
            try:
                self.logger.info("Starting consumer")
                self._ensure_connection()
                self.channel.basic_qos(prefetch_count=settings.MAX_PARALLEL_TASKS)
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
