from fastapi import (
    APIRouter,
    HTTPException,
    Depends,
    UploadFile,
    File,
    Query,
)
from pydantic import BaseModel
from schemas.batch import Batch
from schemas.task import Task
from schemas.task_status import TaskStatus
from typing import Any, Dict, List, Optional
from services.message_queue import RabbitMQHandler
from services.storage import StorageHandler
import uuid
from tenacity import retry, stop_after_attempt, wait_exponential
from core.config import settings
import logging
import datetime
from database.elastic_session import ElasticsearchClient, get_elasticsearch_client

router = APIRouter()
rabbitmq_handler = RabbitMQHandler()
storage_handler = StorageHandler()
USE_API_PREFIX = True

# Create a logger instance at module level
logger = logging.getLogger(__name__)


def setup_logging():
    """Configure logging for batches endpoints"""
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


# Set up logging when module is loaded
setup_logging()


class BulkTaskResponse(BaseModel):
    batch_id: str
    total_tasks: int


class BatchListResponse(BaseModel):
    total: int
    batches: List[Batch]


class BatchTasksResponse(BaseModel):
    total: int
    tasks: List[Task]


class TaskSubmission(BaseModel):
    custom_id: str
    method: str
    url: str
    api_key: str
    body: dict
    dataset: Optional[str] = None
    source: Optional[Dict[str, Any]] = None


class TaskListSubmission(BaseModel):
    tasks: List[TaskSubmission]


@retry(
    stop=stop_after_attempt(settings.MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.get("/batches/{batch_id}", response_model=Batch)
async def get_batch(
    batch_id: str, es_client: ElasticsearchClient = Depends(get_elasticsearch_client)
):
    logger.info(f"Fetching status for batch {batch_id}")
    try:
        batch_stats = await es_client.get_batch_stats(batch_id)
        if not batch_stats:
            logger.info(f"No tasks found for batch_id {batch_id}")
            raise HTTPException(
                status_code=404, detail=f"No tasks found for batch_id {batch_id}"
            )

        # Calculate batch status
        batch_status = (
            TaskStatus.PENDING
            if batch_stats["pending_count"] > 0
            else (
                TaskStatus.FAILED
                if batch_stats["failed_count"] > 0
                else (
                    TaskStatus.PROCESSING
                    if batch_stats["processing_count"] > 0
                    else TaskStatus.COMPLETED
                )
            )
        )

        response = Batch(
            batch_id=batch_stats["batch_id"],
            batch_status=batch_status,
            created_at=batch_stats["created_at"],
            started_at=batch_stats["started_at"],
            completed_at=batch_stats["completed_at"],
            duration=batch_stats["duration"],
            total_tasks=batch_stats["total_count"],
            completed_tasks=batch_stats["completed_count"],
            failed_tasks=batch_stats["failed_count"],
            pending_tasks=batch_stats["pending_count"],
            processing_tasks=batch_stats["processing_count"],
            cached_tasks=batch_stats["cached_count"],
            total_tokens=batch_stats["total_tokens"],
            prompt_tokens=batch_stats["prompt_tokens"],
            completion_tokens=batch_stats["completion_tokens"],
        )

        logger.info(f"Successfully retrieved status for batch {batch_id}")
        return response

    except HTTPException:
        # Re-raise HTTP exceptions (like 404) without wrapping them
        raise
    except Exception as e:
        logger.error(f"Failed to fetch status for batch {batch_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch bulk task status: {str(e)}"
        )


@router.post("/batches", response_model=BulkTaskResponse)
async def submit_bulk_tasks(
    file: UploadFile = File(...), batch_id: Optional[str] = Query(default=None)
):
    logger.info(f"Received bulk task submission: {file.filename}")
    if not file.filename.endswith(".jsonl"):
        raise HTTPException(status_code=400, detail="Only JSONL files are supported")

    try:
        batch_id = batch_id or str(uuid.uuid4())
        content = await file.read()
        total_tasks = len(content.decode("utf-8").strip().split("\n"))

        # Generate unique identifier for the file
        file_id = str(uuid.uuid4())
        # Create object name with unique identifier
        object_name = f"batches/{batch_id}/{file.filename}_{file_id}"

        # Upload file to MinIO
        await storage_handler.upload_file(
            bucket_name=settings.MINIO_BUCKET_NAME,
            object_name=object_name,
            file_data=content,
        )
        logger.info(f"Uploaded file to MinIO: {object_name}")

        # Send message to RabbitMQ
        timestamp = datetime.datetime.now(datetime.UTC).isoformat()
        message = {
            "batch_id": batch_id,
            "object_name": object_name,
            "upload_timestamp": timestamp,
            "bucket_name": settings.MINIO_BUCKET_NAME,
        }
        await rabbitmq_handler.publish_message(message, "data_generation_batch")
        logger.info(f"Sent metadata message to RabbitMQ for batch {batch_id}")

        return BulkTaskResponse(batch_id=batch_id, total_tasks=total_tasks)

    except Exception as e:
        logger.error(f"Failed to process bulk request: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to process bulk request: {str(e)}"
        )


@retry(
    stop=stop_after_attempt(settings.MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.get("/batches", response_model=BatchListResponse)
async def list_batches(
    page: int = Query(1, gt=0),
    page_size: int = Query(50, gt=0, le=100),
    es_client: ElasticsearchClient = Depends(get_elasticsearch_client),
):
    logger.info(f"Listing batches - page: {page}, page_size: {page_size}")
    try:
        result = await es_client.list_batches(page, page_size)

        batches = [Batch(**batch_data) for batch_data in result["batches"]]

        return BatchListResponse(
            batches=batches,
            total=result["total"],
        )

    except Exception as e:
        logger.error(f"Failed to fetch batch list: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch batch list: {str(e)}"
        )


@retry(
    stop=stop_after_attempt(settings.MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.get("/batches/{batch_id}/tasks", response_model=BatchTasksResponse)
async def get_batch_tasks(
    batch_id: str,
    es_client: ElasticsearchClient = Depends(get_elasticsearch_client),
):
    logger.info(f"Fetching tasks for batch {batch_id}")
    try:
        result = await es_client.get_batch_tasks(batch_id)

        if not result["tasks"]:
            raise HTTPException(
                status_code=404, detail=f"No tasks found for batch_id {batch_id}"
            )

        task_details = [Task(**task) for task in result["tasks"]]

        return BatchTasksResponse(
            tasks=task_details,
            total=result["total"],
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch batch tasks: {str(e)}"
        )


@retry(
    stop=stop_after_attempt(settings.MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.delete("/batches/{batch_id}", status_code=204)
async def delete_batch(
    batch_id: str, es_client: ElasticsearchClient = Depends(get_elasticsearch_client)
):
    logger.info(f"Deleting batch {batch_id}")
    try:
        # Delete all documents with the given batch_id
        await es_client.client.delete_by_query(
            index="events", body={"query": {"term": {"batch_id": batch_id}}}
        )

        logger.info(f"Successfully deleted batch {batch_id}")
        return None

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete batch {batch_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete batch: {str(e)}")
