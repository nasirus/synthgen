import asyncio
import json
import logging
import uuid
import datetime
import platform

from core.config import settings
from schemas.task_status import TaskStatus
from services.message_queue import RabbitMQHandler
from services.storage import StorageHandler
from pydantic import BaseModel, ValidationError
from typing import Any, Dict, Optional
from services.database import bulk_insert_events



class TaskSubmission(BaseModel):
    custom_id: str
    method: str
    url: str
    api_key: str
    body: dict
    dataset: Optional[str] = None
    source: Optional[Dict[str, Any]] = None


class MetadataMessage(BaseModel):
    batch_id: str
    object_name: str
    upload_timestamp: str
    bucket_name: str


class Worker:
    def __init__(self):
        self.rabbitmq_handler = RabbitMQHandler()
        self.storage_handler = StorageHandler()
        self.logger = logging.getLogger(__name__)
        self.setup_logging()

    def setup_logging(self):
        """Configure logging for the worker."""
        self.logger.handlers.clear()
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)
        self.logger.setLevel(logging.INFO)

    async def process_message(self, message: bytes):
        """Processes a single message from the queue."""
        try:
            metadata = MetadataMessage.model_validate_json(message)
            self.logger.info(f"Received message for batch {metadata.batch_id}")

            # Download file from MinIO
            file_content = await self.storage_handler.download_file(
                bucket_name=metadata.bucket_name, object_name=metadata.object_name
            )
            self.logger.info(
                f"Downloaded file from MinIO: {metadata.object_name} for batch {metadata.batch_id}"
            )

            try:
                # Parse JSONL content and send tasks
                lines = file_content.decode("utf-8").strip().split("\n")
                total_lines = len(lines)
                timestamp = datetime.datetime.now(datetime.UTC).isoformat()
                self.logger.info(
                    f"Processing {total_lines} tasks for batch {metadata.batch_id}"
                )

                # Process in chunks
                CHUNK_SIZE = settings.CHUNK_SIZE
                for chunk_start in range(0, total_lines, CHUNK_SIZE):
                    chunk_end = min(chunk_start + CHUNK_SIZE, total_lines)
                    current_chunk = lines[chunk_start:chunk_end]

                    rows_to_copy = []
                    messages_to_publish = []

                    for line_number, line in enumerate(current_chunk, chunk_start + 1):
                        try:
                            task_data = json.loads(line)
                            if not isinstance(task_data, dict):
                                self.logger.warning(
                                    f"Skipping line {line_number}: Task data must be a JSON object, got {type(task_data)}"
                                )
                                continue

                            # Validate task data
                            TaskSubmission.model_validate(task_data)

                            message_id = str(uuid.uuid4())
                            rows_to_copy.append(
                                (
                                    message_id,
                                    metadata.batch_id,
                                    timestamp,
                                    TaskStatus.PENDING.value,
                                    task_data["custom_id"],
                                    task_data["method"],
                                    task_data["url"],
                                    json.dumps(task_data["body"]),
                                    task_data.get("dataset", None),
                                    json.dumps(task_data.get("source", None)),
                                )
                            )
                            messages_to_publish.append(
                                {
                                    "message_id": message_id,
                                    "timestamp": timestamp,
                                    "payload": task_data,
                                    "batch_id": metadata.batch_id,
                                }
                            )

                        except json.JSONDecodeError as e:
                            self.logger.error(
                                f"Invalid JSON at line {line_number} in batch {metadata.batch_id}: {str(e)}"
                            )
                        except ValidationError as e:
                            self.logger.error(
                                f"Invalid task data at line {line_number} in batch {metadata.batch_id}: {str(e)}"
                            )
                        except Exception as e:
                            self.logger.error(
                                f"Error processing task at line {line_number} in batch {metadata.batch_id}: {str(e)}"
                            )
                            continue

                    if not rows_to_copy:
                        self.logger.warning(
                            f"No valid tasks found in chunk {chunk_start}-{chunk_end} of batch {metadata.batch_id}"
                        )
                        continue

                    # Add retry logic for database operations
                    max_retries = 3
                    retry_count = 0
                    while retry_count < max_retries:
                        try:
                            # Bulk insert into database
                            await bulk_insert_events(rows_to_copy)
                            self.logger.info(
                                f"Successfully inserted chunk {chunk_start}-{chunk_end} ({len(rows_to_copy)} tasks) for batch {metadata.batch_id}"
                            )
                            break
                        except Exception as e:
                            retry_count += 1
                            if retry_count == max_retries:
                                self.logger.error(f"Failed to insert chunk after {max_retries} attempts: {str(e)}")
                                raise
                            self.logger.warning(f"Retry {retry_count}/{max_retries} for database insertion")
                            await asyncio.sleep(1 * retry_count)  # Exponential backoff

                    # Add retry logic for message publishing
                    retry_count = 0
                    while retry_count < max_retries:
                        try:
                            # Publish to RabbitMQ
                            await self.rabbitmq_handler.publish_bulk_messages(
                                messages_to_publish, queue_name="data_generation_tasks"
                            )
                            self.logger.info(
                                f"Published chunk {chunk_start}-{chunk_end} ({len(messages_to_publish)} messages) for batch {metadata.batch_id}"
                            )
                            break
                        except Exception as e:
                            retry_count += 1
                            if retry_count == max_retries:
                                self.logger.error(f"Failed to publish messages after {max_retries} attempts: {str(e)}")
                                raise
                            self.logger.warning(f"Retry {retry_count}/{max_retries} for message publishing")
                            await asyncio.sleep(1 * retry_count)

                self.logger.info(f"Finished processing batch {metadata.batch_id}")

                # Delete the processed file from MinIO
                await self.storage_handler.delete_file(
                    bucket_name=metadata.bucket_name,
                    object_name=metadata.object_name
                )
                self.logger.info(f"Deleted processed file {metadata.object_name} from MinIO")

            except Exception as e:
                self.logger.error(f"Error during processing: {str(e)}")
                raise

        except ValidationError as e:
            self.logger.error(f"Invalid message format: {str(e)}")
        except Exception as e:
            self.logger.error(f"Failed to process message: {str(e)}")

    async def consume_messages(self):
        """Connects to RabbitMQ and consumes messages from the queue."""
        self.logger.info("Starting worker...")
        try:
            await self.rabbitmq_handler.consume_messages(
                queue_name="data_generation_batch", callback=self.process_message
            )
        except Exception as e:
            await asyncio.sleep(5)
            self.logger.error(f"Error consuming messages: {str(e)}")

    async def run(self):
        while True:
            try:
                await self.consume_messages()
            except Exception as e:
                self.logger.error(f"Worker encountered an error: {e}")
                # Optional: Implement a retry mechanism with backoff
                await asyncio.sleep(5)  # Wait before restarting


async def main():
    worker = Worker()
    await worker.run()


if __name__ == "__main__":
    # Set the correct event loop policy for Windows
    if platform.system() == "Windows":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    asyncio.run(main())
