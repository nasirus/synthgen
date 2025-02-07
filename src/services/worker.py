import asyncio
import json
import logging

from core.config import settings
from services.message_queue import RabbitMQHandler
from services.storage import StorageHandler
from pydantic import BaseModel, ValidationError
from typing import Any, Dict, Optional


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

            # Parse JSONL content and send tasks
            lines = file_content.decode("utf-8").strip().split("\n")
            total_lines = len(lines)
            self.logger.info(
                f"Processing {total_lines} tasks for batch {metadata.batch_id}"
            )

            # Process in chunks
            CHUNK_SIZE = settings.CHUNK_SIZE
            for chunk_start in range(0, total_lines, CHUNK_SIZE):
                chunk_end = min(chunk_start + CHUNK_SIZE, total_lines)
                current_chunk = lines[chunk_start:chunk_end]

                messages_to_publish = []
                for line_number, line in enumerate(current_chunk, chunk_start + 1):
                    try:
                        task_data = json.loads(line)
                        # Validate task data
                        TaskSubmission.model_validate(task_data)

                        message_id = task_data.get(
                            "message_id"
                        )  # Get message_id if present in the task
                        if not message_id:
                            self.logger.warning(
                                f"Skipping line {line_number} in batch {metadata.batch_id}: Missing 'message_id'"
                            )
                            continue

                        messages_to_publish.append(
                            {
                                "message_id": message_id,
                                "timestamp": metadata.upload_timestamp,
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

                if messages_to_publish:
                    await self.rabbitmq_handler.publish_bulk_messages(
                        messages_to_publish, queue_name="data_generation_task"
                    )
                    self.logger.info(
                        f"Published chunk {chunk_start}-{chunk_end} ({len(messages_to_publish)} messages) for batch {metadata.batch_id}"
                    )
                else:
                    self.logger.warning(
                        f"No valid tasks found in chunk {chunk_start}-{chunk_end} of batch {metadata.batch_id}"
                    )

            self.logger.info(f"Finished processing batch {metadata.batch_id}")

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
    asyncio.run(main())
