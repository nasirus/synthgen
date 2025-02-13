import asyncio
import json
import logging
import uuid
import datetime
import platform
import base64
from hashlib import sha256

from core.config import settings
from schemas.task_status import TaskStatus
from services.message_queue import RabbitMQHandler
from services.storage import StorageHandler
from pydantic import BaseModel, ValidationError
from typing import Any, Dict, Optional
from database.elastic_session import get_elasticsearch_client


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
        self.es_client = get_elasticsearch_client()

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

    async def bulk_insert_elasticsearch(self, documents: list) -> None:
        """Helper function to perform bulk insert into Elasticsearch."""
        bulk_data = []
        for doc in documents:
            # Add the action line
            bulk_data.append({"index": {"_index": "events", "_id": doc["message_id"]}})
            # Add the document data line
            bulk_data.append({
                "message_id": doc["message_id"],
                "batch_id": doc["batch_id"],
                "created_at": doc["created_at"],
                "status": doc["status"],
                "custom_id": doc["custom_id"],
                "method": doc["method"],
                "url": doc["url"],
                "body_hash": doc["body_hash"],
                "body": doc["body"],
                "dataset": doc["dataset"],
                "source": doc["source"],
                "attempt": 0
            })

        if bulk_data:
            await self.es_client.client.bulk(operations=bulk_data, refresh=True)

    async def process_message(self, message: bytes):
        """Processes a single message from the queue."""
        try:
            metadata = MetadataMessage.model_validate_json(message)
            self.logger.info(f"Received message for batch {metadata.batch_id}")

            # Download file from Storage
            file_content = await self.storage_handler.download_file(
                bucket_name=metadata.bucket_name, object_name=metadata.object_name
            )
            self.logger.info(
                f"Downloaded file from storage: {metadata.object_name} for batch {metadata.batch_id}"
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

                    messages_to_publish = []
                    es_documents = []

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
                            # Ensure consistent JSON serialization with compact format
                            body_json = json.dumps(task_data["body"], sort_keys=True, separators=(',', ':'))
                            hasher = sha256()
                            hasher.update(body_json.encode('utf-8'))
                            body_hash = base64.b64encode(hasher.digest()).decode('utf-8')

                            # Prepare Elasticsearch document
                            es_documents.append({
                                "message_id": message_id,
                                "batch_id": metadata.batch_id,
                                "created_at": timestamp,
                                "status": TaskStatus.PENDING.value,
                                "custom_id": task_data["custom_id"],
                                "method": task_data["method"],
                                "url": task_data["url"],
                                "body_hash": body_hash,
                                "body": task_data["body"],
                                "dataset": task_data.get("dataset", None),
                                "source": task_data.get("source", None)
                            })

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

                    if not es_documents:
                        self.logger.warning(
                            f"No valid tasks found in chunk {chunk_start}-{chunk_end} of batch {metadata.batch_id}"
                        )
                        continue

                    # Add retry logic for database operations
                    max_retries = 3
                    retry_count = 0
                    while retry_count < max_retries:
                        try:
                            # Bulk insert into Elasticsearch
                            await self.bulk_insert_elasticsearch(es_documents)
                            self.logger.info(
                                f"Successfully inserted chunk {chunk_start}-{chunk_end} ({len(es_documents)} tasks) into Elasticsearch for batch {metadata.batch_id}"
                            )
                            break
                        except Exception as e:
                            retry_count += 1
                            if retry_count == max_retries:
                                self.logger.error(f"Failed to insert chunk after {max_retries} attempts: {str(e)}")
                                raise
                            self.logger.warning(f"Retry {retry_count}/{max_retries} for database insertion")
                            await asyncio.sleep(1 * retry_count)

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

                # Delete the processed file from Storage
                await self.storage_handler.delete_file(
                    bucket_name=metadata.bucket_name,
                    object_name=metadata.object_name
                )
                self.logger.info(f"Deleted processed file {metadata.object_name} from storage")

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

    async def initialize(self):
        await self.rabbitmq_handler.ensure_initialized()
        # Add other async initialization code here


async def main():
    worker = Worker()
    await worker.initialize()
    await worker.run()


if __name__ == "__main__":
    # Set the correct event loop policy for Windows
    if platform.system() == "Windows":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    asyncio.run(main())
