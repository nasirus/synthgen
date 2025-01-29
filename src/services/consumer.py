import json
import pika
from typing import Dict, Any
import datetime
from schemas.task_status import TaskStatus
from core.config import settings
import logging
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential
from database.session import pool
import time
from concurrent.futures import ThreadPoolExecutor
import logging.handlers
import concurrent.futures
from utils.llm_utils import send_llm_request
import psycopg
from psycopg.rows import dict_row

load_dotenv(override=True)

# Create a single logger instance at module level
logger = logging.getLogger(__name__)


class MessageConsumer:
    def __init__(self):
        self.connection = None
        self.channel = None
        self._connect_to_rabbitmq()
        self.executor = ThreadPoolExecutor(max_workers=settings.MAX_PARALLEL_TASKS)

    @classmethod
    def setup_logging(cls):
        # Remove all existing handlers
        logger.handlers.clear()

        # Add single handler with formatter
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)

    def _connect_to_rabbitmq(self):
        """Establish connection to RabbitMQ with retry mechanism"""
        logger.info("Initializing RabbitMQ connection")
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
                logger.info("RabbitMQ connection initialized successfully")
                break
            except Exception as e:
                logger.error(f"Failed to connect to RabbitMQ: {str(e)}")
                logger.info("Retrying in 5 seconds...")
                time.sleep(5)

    def _ensure_connection(self):
        """Ensure the connection is active, reconnect if necessary"""
        try:
            if not self.connection or self.connection.is_closed:
                logger.warning("RabbitMQ connection is closed. Reconnecting...")
                self._connect_to_rabbitmq()
            if not self.channel or self.channel.is_closed:
                logger.warning("RabbitMQ channel is closed. Recreating channel...")
                self.channel = self.connection.channel()
                self.channel.queue_declare(queue="data_generation_tasks", durable=True)
        except Exception as e:
            logger.error(f"Error ensuring connection: {str(e)}")
            self._connect_to_rabbitmq()

    @retry(
        stop=stop_after_attempt(settings.MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        reraise=True,
    )
    def _update_event_status(
        self,
        message_id: str,
        status: TaskStatus,
        result: Dict[str, Any] = None,
        metadata: Dict[str, Any] = None,
    ):
        logger.debug(f"Updating event status for message {message_id} to {status}")
        try:
            with pool.connection() as conn:
                with conn.cursor() as cur:
                    current_time = datetime.datetime.now(datetime.UTC)

                    update_fields = ["status = %s"]
                    params = [status.value]

                    if status == TaskStatus.PROCESSING:
                        update_fields.append("started_at = %s")
                        params.append(current_time)

                    if status in [TaskStatus.COMPLETED, TaskStatus.FAILED]:
                        update_fields.append("completed_at = %s")
                        params.append(current_time)

                        cur.execute(
                            "SELECT started_at FROM events WHERE message_id = %s",
                            (message_id,),
                        )
                        event_data = cur.fetchone()
                        # Calculate duration if started_at exists
                        if event_data and event_data[0]:
                            duration = int(
                                (current_time - event_data[0]).total_seconds()
                            )
                            update_fields.append("duration = %s")
                            params.append(duration)
                        else:
                            # If no started_at, set it now along with duration = 0
                            update_fields.extend(["started_at = %s", "duration = %s"])
                            params.extend([current_time, 0])

                    if result:
                        update_fields.append("result = %s")
                        params.append(json.dumps(result))

                    if metadata:
                        if "usage" in metadata:
                            update_fields.extend(
                                [
                                    "prompt_tokens = %s",
                                    "completion_tokens = %s",
                                    "total_tokens = %s",
                                ]
                            )
                            params.extend(
                                [
                                    metadata["usage"].get("prompt_tokens", 0),
                                    metadata["usage"].get("completion_tokens", 0),
                                    metadata["usage"].get("total_tokens", 0),
                                ]
                            )
                        update_fields.append("cached = %s")
                        params.append(metadata.get("cached", False))

                    params.append(message_id)
                    query = f"""
                        UPDATE events 
                        SET {', '.join(update_fields)}
                        WHERE message_id = %s
                        RETURNING id
                    """
                    cur.execute(query, params)

                    # Check if any row was actually updated
                    if cur.rowcount == 0:
                        logger.error(f"No event found with message_id: {message_id}")
                        raise ValueError(
                            f"Event not found with message_id: {message_id}"
                        )
        except psycopg.errors.UnicodeError as e:
            logger.error(
                f"Unicode error while updating status for message {message_id}: {str(e)}"
            )
            # Update status as failed with the error message
            self._update_event_status(
                message_id,
                TaskStatus.FAILED,
                {"error": f"Database encoding error: {str(e)}"},
            )
            raise

    @retry(
        stop=stop_after_attempt(settings.MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        reraise=True,
    )
    def _get_cached_completion(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Check if there's a cached completion for the given payload"""
        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    SELECT result 
                    FROM events 
                    WHERE status = %s 
                    AND payload = %s
                    LIMIT 1
                """,
                    (TaskStatus.COMPLETED.value, json.dumps(payload)),
                )

                result = cur.fetchone()
                if result and result["result"]:
                    logger.info("Found cached completion for payload")
                    cached_result = result["result"]
                    cached_result["usage"] = {
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                        "total_tokens": 0,
                    }
                    cached_result["cached"] = True
                    return cached_result
                return None

    def process_message(self, ch, method, properties, body):
        # Capture message data
        message_data = json.loads(body)
        message_id = message_data["message_id"]
        payload = message_data["payload"]

        logger.info(f"Scheduling message {message_id} for processing")

        # Submit to thread pool
        self.executor.submit(
            self.process_message_async, ch, method, body, message_id, payload
        )

    def process_message_async(self, ch, method, body, message_id, payload):
        start_time = time.time()
        try:
            logger.debug(f"Updating status to PROCESSING for message {message_id}")
            self._update_event_status(message_id, TaskStatus.PROCESSING)

            logger.debug(f"Checking cache for message {message_id}")

            # Check for cached completion based on payload
            cached_result = self._get_cached_completion(payload)
            if cached_result:
                logger.info(f"Using cached completion for message {message_id}")
                # Store only the completion in result
                result = {"completion": cached_result["completion"]}
                # Pass usage and cached status separately to update_event_status
                metadata = {
                    "usage": {
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                        "total_tokens": 0,
                    },
                    "cached": True,
                }
                self._update_event_status(
                    message_id, TaskStatus.COMPLETED, result, metadata
                )
                return

            logger.debug(f"Sending request to LLM for message {message_id}")
            response = send_llm_request(payload)

            # Store only the completion in result
            result = {"completion": response.choices[0].message.content}

            # Pass usage and cached status separately
            metadata = {
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                },
                "cached": False,
            }

            logger.debug(f"Updating status to COMPLETED for message {message_id}")
            self._update_event_status(
                message_id, TaskStatus.COMPLETED, result, metadata
            )
            logger.info(f"Successfully processed message {message_id}")

        except concurrent.futures.TimeoutError:
            logger.error(f"Message {message_id} processing timed out")
            self._update_event_status(
                message_id, TaskStatus.FAILED, {"error": "Processing timeout"}
            )
        except Exception as e:
            logger.error(
                f"Error processing message {message_id}: {str(e)}", exc_info=True
            )
            self._update_event_status(message_id, TaskStatus.FAILED, {"error": str(e)})
        finally:
            processing_time = time.time() - start_time
            logger.info(
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
            logger.warning("Channel closed, message %s not acknowledged", delivery_tag)

    def start_consuming(self):
        """Start consuming messages with automatic recovery"""
        while True:
            try:
                logger.info("Starting consumer")
                self._ensure_connection()
                self.channel.basic_qos(prefetch_count=settings.MAX_PARALLEL_TASKS)
                self.channel.basic_consume(
                    queue="data_generation_tasks",
                    on_message_callback=self.process_message,
                )
                logger.info("Started consuming messages...")
                self.channel.start_consuming()
            except pika.exceptions.ConnectionClosedByBroker:
                logger.warning("Connection closed by broker, retrying...")
                continue
            except pika.exceptions.AMQPChannelError as e:
                logger.error(f"Channel error: {str(e)}, retrying...")
                continue
            except pika.exceptions.AMQPConnectionError:
                logger.error("Connection was closed, retrying...")
                continue
            except Exception as e:
                logger.error(f"Unexpected error: {str(e)}")
                logger.info("Retrying in 5 seconds...")
                time.sleep(5)
                continue


if __name__ == "__main__":
    import time

    # Setup logging once at startup
    MessageConsumer.setup_logging()

    try:
        consumer = MessageConsumer()
        consumer.start_consuming()
    except KeyboardInterrupt:
        if consumer.connection and not consumer.connection.is_closed:
            consumer.connection.close()
    except Exception as e:
        logger.error(f"Main loop error: {str(e)}")
        logger.info("Restarting consumer in 5 seconds...")
        time.sleep(5)
