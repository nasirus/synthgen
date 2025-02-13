from fastapi import (
    APIRouter,
    HTTPException,
    Depends,
    UploadFile,
    File,
    Query,
)
from pydantic import BaseModel
from psycopg import Connection
from psycopg.rows import dict_row
from database.session import get_async_db
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
    page: int
    page_size: int
    batches: List[Batch]


class BatchTasksResponse(BaseModel):
    total: int
    page: int
    page_size: int
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
async def get_batch(batch_id: str, db: Connection = Depends(get_async_db)):
    logger.info(f"Fetching status for batch {batch_id}")
    try:
        async with db.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT 
                    batch_id,
                    MIN(created_at) as created_at,
                    MIN(started_at) as started_at,
                    MAX(completed_at) as completed_at,
                    EXTRACT(EPOCH FROM (MAX(completed_at) - MIN(created_at)))::integer as duration,
                    SUM(total_tokens) as total_tokens,
                    SUM(prompt_tokens) as prompt_tokens,
                    SUM(completion_tokens) as completion_tokens,
                    SUM(CASE WHEN status = %s THEN 1 ELSE 0 END) as completed_count,
                    SUM(CASE WHEN status = %s THEN 1 ELSE 0 END) as failed_count,
                    SUM(CASE WHEN status = %s THEN 1 ELSE 0 END) as processing_count,
                    COUNT(message_id) as total_count,
                    SUM(CASE WHEN cached = TRUE THEN 1 ELSE 0 END) as cached_count
                FROM events
                WHERE batch_id = %s
                GROUP BY batch_id
            """,
                (
                    TaskStatus.COMPLETED.value,
                    TaskStatus.FAILED.value,
                    TaskStatus.PROCESSING.value,
                    batch_id,
                ),
            )

            batch_stats = await cur.fetchone()

        if not batch_stats:
            raise HTTPException(
                status_code=404, detail=f"No tasks found for batch_id {batch_id}"
            )

        completed_count = batch_stats["completed_count"]
        failed_count = batch_stats["failed_count"]
        processing_count = batch_stats["processing_count"]
        total_count = batch_stats["total_count"]
        pending_count = total_count - (
            completed_count + failed_count + processing_count
        )

        batch_status = (
            TaskStatus.PENDING
            if pending_count > 0
            else (
                TaskStatus.FAILED
                if failed_count > 0
                else (
                    TaskStatus.PROCESSING
                    if processing_count > 0
                    else TaskStatus.COMPLETED
                )
            )
        )

        response = Batch(
            batch_id=batch_id,
            batch_status=batch_status,
            created_at=batch_stats["created_at"],
            started_at=batch_stats["started_at"],
            completed_at=batch_stats["completed_at"],
            duration=batch_stats["duration"],
            total_tasks=batch_stats["total_count"],
            completed_tasks=completed_count,
            failed_tasks=failed_count,
            pending_tasks=pending_count,
            processing_tasks=processing_count,
            cached_tasks=batch_stats["cached_count"],
            total_tokens=batch_stats["total_tokens"] or 0,
            prompt_tokens=batch_stats["prompt_tokens"] or 0,
            completion_tokens=batch_stats["completion_tokens"] or 0,
        )

        logger.info(f"Successfully retrieved status for batch {batch_id}")
        return response

    except HTTPException:
        logger.error(f"HTTP error while fetching batch {batch_id}")
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
            bucket_name=settings.S3_BUCKET_NAME,
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
            "bucket_name": settings.S3_BUCKET_NAME,
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
    db: Connection = Depends(get_async_db),
):
    logger.info(f"Listing batches - page: {page}, page_size: {page_size}")
    try:
        offset = (page - 1) * page_size

        async with db.cursor(row_factory=dict_row) as cur:
            # Get total count of non-null batch_ids
            await cur.execute(
                "SELECT COUNT(DISTINCT batch_id) AS total_batches FROM events WHERE batch_id IS NOT NULL"
            )
            total_batches = (await cur.fetchone())["total_batches"]

            # Get all batch statistics in a single query
            await cur.execute(
                """
                SELECT 
                    e.batch_id,
                    MIN(e.created_at) as created_at,
                    MIN(e.started_at) as started_at,
                    MAX(e.completed_at) as completed_at,
                    EXTRACT(EPOCH FROM (MAX(e.completed_at) - MIN(e.created_at)))::integer as duration,
                    SUM(e.total_tokens) as total_tokens,
                    SUM(e.prompt_tokens) as prompt_tokens,
                    SUM(e.completion_tokens) as completion_tokens,
                    SUM(CASE WHEN e.status = %s THEN 1 ELSE 0 END) as completed_count,
                    SUM(CASE WHEN e.status = %s THEN 1 ELSE 0 END) as failed_count,
                    SUM(CASE WHEN e.status = %s THEN 1 ELSE 0 END) as processing_count,
                    COUNT(e.message_id) as total_count,
                    SUM(CASE WHEN e.cached = TRUE THEN 1 ELSE 0 END) as cached_count
                FROM events e
                WHERE e.batch_id IS NOT NULL
                GROUP BY e.batch_id
                ORDER BY MIN(e.created_at) DESC
                LIMIT %s OFFSET %s
                """,
                (
                    TaskStatus.COMPLETED.value,
                    TaskStatus.FAILED.value,
                    TaskStatus.PROCESSING.value,
                    page_size,
                    offset,
                ),
            )

            batch_stats = await cur.fetchall()

        batches = []
        for stats in batch_stats:
            completed_count = stats["completed_count"]
            failed_count = stats["failed_count"]
            processing_count = stats["processing_count"]
            total_count = stats["total_count"]
            pending_count = total_count - (
                completed_count + failed_count + processing_count
            )

            batch_status = (
                TaskStatus.PENDING
                if pending_count > 0
                else (
                    TaskStatus.FAILED
                    if failed_count > 0
                    else (
                        TaskStatus.PROCESSING
                        if processing_count > 0
                        else TaskStatus.COMPLETED
                    )
                )
            )

            batch = Batch(
                batch_id=stats["batch_id"],
                batch_status=batch_status,
                created_at=stats["created_at"],
                started_at=stats["started_at"],
                completed_at=stats["completed_at"],
                duration=stats["duration"],
                total_tasks=stats["total_count"],
                completed_tasks=completed_count,
                failed_tasks=failed_count,
                pending_tasks=pending_count,
                processing_tasks=processing_count,
                cached_tasks=stats["cached_count"],
                total_tokens=stats["total_tokens"] or 0,
                prompt_tokens=stats["prompt_tokens"] or 0,
                completion_tokens=stats["completion_tokens"] or 0,
            )
            batches.append(batch)

        return BatchListResponse(
            batches=batches, total=total_batches, page=page, page_size=page_size
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
    page: int = Query(1, gt=0),
    page_size: int = Query(50, gt=0, le=100),
    db: Connection = Depends(get_async_db),
):
    logger.info(
        f"Fetching tasks for batch {batch_id} - page: {page}, page_size: {page_size}"
    )
    try:
        offset = (page - 1) * page_size

        async with db.cursor(row_factory=dict_row) as cur:
            # Get total count
            await cur.execute(
                "SELECT COUNT(*) FROM events WHERE batch_id = %s", (batch_id,)
            )
            total_tasks = (await cur.fetchone())["count"]

            # Get paginated tasks
            await cur.execute(
                """
                SELECT *
                FROM events
                WHERE batch_id = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """,
                (batch_id, page_size, offset),
            )

            tasks = await cur.fetchall()

        if not tasks and page == 1:
            raise HTTPException(
                status_code=404, detail=f"No tasks found for batch_id {batch_id}"
            )

        task_details = [
            Task(
                message_id=str(task["message_id"]),
                batch_id=task["batch_id"],
                status=TaskStatus(task["status"]),
                cached=task["cached"] or False,
                body=task["body"],
                result=task["result"],
                created_at=task["created_at"],
                started_at=task["started_at"],
                completed_at=task["completed_at"],
                duration=task["duration"],
                total_tokens=task["total_tokens"],
                prompt_tokens=task["prompt_tokens"],
                completion_tokens=task["completion_tokens"],
                queue_position=None,
                dataset=task["dataset"],
                source=task["source"],
            )
            for task in tasks
        ]

        return BatchTasksResponse(
            tasks=task_details, total=total_tasks, page=page, page_size=page_size
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
async def delete_batch(batch_id: str, db: Connection = Depends(get_async_db)):
    logger.info(f"Deleting batch {batch_id}")
    try:
        async with db.cursor(row_factory=dict_row) as cur:
            # First check if the batch exists
            await cur.execute(
                "SELECT COUNT(*) FROM events WHERE batch_id = %s", (batch_id,)
            )
            count = (await cur.fetchone())["count"]

            if count == 0:
                raise HTTPException(
                    status_code=404, detail=f"Batch {batch_id} not found"
                )

            # Delete all events associated with the batch
            await cur.execute("DELETE FROM events WHERE batch_id = %s", (batch_id,))
            await db.commit()

            logger.info(f"Successfully deleted batch {batch_id}")
            return None

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete batch {batch_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete batch: {str(e)}")
