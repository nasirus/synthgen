from fastapi import (
    APIRouter,
    HTTPException,
    Depends,
    UploadFile,
    File,
    Query,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
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
import json
import re
from database.elastic_session import ElasticsearchClient, get_elasticsearch_client
from core.auth import get_current_user
from enum import Enum

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


class TimeSeriesDataPoint(BaseModel):
    timestamp: str
    total_tasks: int
    completed_tasks: int
    failed_tasks: int
    cached_tasks: int
    total_tokens: int
    prompt_tokens: int
    completion_tokens: int
    avg_duration_ms: int
    tokens_per_second: float


class StatsSummary(BaseModel):
    total_tasks: int
    completed_tasks: int
    failed_tasks: int
    cached_tasks: int
    processing_tasks: int
    total_tokens: int
    total_prompt_tokens: int
    total_completion_tokens: int
    average_response_time: int
    tokens_per_second: float
    cache_hit_rate: float


class UsageStatsResponse(BaseModel):
    time_range: str
    interval: str
    current_time: str
    time_series: List[TimeSeriesDataPoint]
    summary: StatsSummary


class CalendarInterval(str, Enum):
    """
    Valid Elasticsearch calendar intervals as described in the documentation.

    Calendar intervals are time-based intervals that account for irregular time periods like
    months (which can have 28-31 days) or years (which can be leap years).
    """

    MINUTE = "minute"
    MINUTE_SHORT = "1m"
    HOUR = "hour"
    HOUR_SHORT = "1h"
    DAY = "day"
    DAY_SHORT = "1d"
    WEEK = "week"
    WEEK_SHORT = "1w"
    MONTH = "month"
    MONTH_SHORT = "1M"
    QUARTER = "quarter"
    QUARTER_SHORT = "1q"
    YEAR = "year"
    YEAR_SHORT = "1y"


class TimeRange(BaseModel):
    """
    Validator for Elasticsearch date math expressions used in time range queries.
    Supports common formats like:
    - 5m (5 minutes)
    - 2h (2 hours)
    - 1d (1 day)

    Note: The 'now-' prefix is added automatically by the ElasticsearchClient.get_usage_stats method,
    so it should not be included in the time_range parameter.
    """

    time_range: str

    @field_validator("time_range")
    @classmethod
    def validate_time_range(cls, v):
        # Pattern to validate time ranges in the format of Xm, Xh, Xd
        pattern = r"^(\d+)([mhd])$"
        match = re.match(pattern, v)

        if not match:
            raise ValueError(
                "Time range must be in format 'Xm', 'Xh', or 'Xd' "
                "where X is a positive number and m=minutes, h=hours, d=days"
            )

        value, unit = match.groups()
        value = int(value)

        if value <= 0:
            raise ValueError("Time range value must be positive")

        # Validate specific unit limits if needed
        if unit == "m" and value > 1440:  # 24 hours in minutes
            raise ValueError("Minutes should not exceed 1440 (24 hours)")
        elif unit == "h" and value > 720:  # 30 days in hours
            raise ValueError("Hours should not exceed 720 (30 days)")
        elif unit == "d" and value > 365:  # 1 year in days
            raise ValueError("Days should not exceed 365 (1 year)")

        return v


@retry(
    stop=stop_after_attempt(settings.RETRY_ATTEMPTS),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.get("/batches/{batch_id}", response_model=Batch)
async def get_batch(
    batch_id: str,
    es_client: ElasticsearchClient = Depends(get_elasticsearch_client),
    current_user: str = Depends(get_current_user),
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
            TaskStatus.PROCESSING
            if batch_stats["processing_count"] > 0
            else (
                TaskStatus.PENDING
                if batch_stats["pending_count"] > 0
                else (
                    TaskStatus.FAILED
                    if batch_stats["failed_count"] > 0
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
    file: UploadFile = File(...),
    batch_id: Optional[str] = Query(default=None),
    current_user: str = Depends(get_current_user),
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
    stop=stop_after_attempt(settings.RETRY_ATTEMPTS),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.get("/batches", response_model=BatchListResponse)
async def list_batches(
    es_client: ElasticsearchClient = Depends(get_elasticsearch_client),
    current_user: str = Depends(get_current_user),
):
    logger.info("Listing batches")
    try:
        result = await es_client.list_batches()

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
    stop=stop_after_attempt(settings.RETRY_ATTEMPTS),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.get("/batches/{batch_id}/tasks/export")
async def get_batch_tasks(
    batch_id: str,
    task_status: TaskStatus = Query(TaskStatus.COMPLETED),
    es_client: ElasticsearchClient = Depends(get_elasticsearch_client),
    current_user: str = Depends(get_current_user),
):
    """
    Stream tasks for a specific batch.
    Instead of collecting all tasks in memory, tasks are streamed in chunks as they are received
    from Elasticsearch using the scroll API.
    (The endpoint now returns newline-delimited JSON; adjust the media type or stream format as needed.)
    """
    logger.info(f"Streaming tasks for batch {batch_id}")

    async def task_streamer():
        async for chunk in es_client.get_batch_tasks(batch_id, task_status):
            # Each yielded chunk is a dict containing {"tasks": [...], "total": ...}
            yield json.dumps(chunk) + "\n"

    return StreamingResponse(task_streamer(), media_type="application/x-ndjson")

@retry(
    stop=stop_after_attempt(settings.RETRY_ATTEMPTS),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.get("/batches/{batch_id}/tasks")
async def get_batch_tasks_with_pagination(
    batch_id: str,
    task_status: TaskStatus = Query(TaskStatus.COMPLETED),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=10000),
    es_client: ElasticsearchClient = Depends(get_elasticsearch_client),
    current_user: str = Depends(get_current_user),
):
    logger.info(f"Fetching tasks for batch {batch_id} with pagination")
    try:
        tasks = await es_client.get_batch_tasks_with_pagination(
            batch_id=batch_id,
            task_status=task_status,
            page=page,
            page_size=page_size,
        )
        return tasks
    except Exception as e:
        logger.error(f"Failed to fetch tasks for batch {batch_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch tasks: {str(e)}"
        )


@retry(
    stop=stop_after_attempt(settings.RETRY_ATTEMPTS),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.delete("/batches/{batch_id}", status_code=204)
async def delete_batch(
    batch_id: str,
    es_client: ElasticsearchClient = Depends(get_elasticsearch_client),
    current_user: str = Depends(get_current_user),
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


@retry(
    stop=stop_after_attempt(settings.RETRY_ATTEMPTS),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.get("/batches/{batch_id}/stats", response_model=UsageStatsResponse)
async def get_batch_usage_stats(
    batch_id: str,
    time_range: str = Query(
        "24h",
        description="Time range for analysis without 'now-' prefix (e.g., 5m, 2h, 1d)",
    ),
    interval: CalendarInterval = Query(
        CalendarInterval.HOUR_SHORT,
        description="Time bucket size using Elasticsearch calendar intervals (e.g. 1h, 1d, 1w, 1M, 1q, 1y)",
    ),
    es_client: ElasticsearchClient = Depends(get_elasticsearch_client),
    current_user: str = Depends(get_current_user),
):
    """
    Get real-time usage statistics for a batch with time-bucketed metrics.

    The interval parameter accepts the following Elasticsearch calendar intervals:
    - minute, 1m: One minute interval
    - hour, 1h: One hour interval
    - day, 1d: One day interval
    - week, 1w: One week interval
    - month, 1M: One month interval
    - quarter, 1q: One quarter interval
    - year, 1y: One year interval

    The time_range parameter format (without 'now-' prefix, which is added automatically):
    - Xm: X minutes (e.g., 30m for the last 30 minutes)
    - Xh: X hours (e.g., 6h for the last 6 hours)
    - Xd: X days (e.g., 7d for the last 7 days)
    """
    logger.info(f"Fetching usage stats for batch {batch_id}")
    try:
        # Validate the time_range parameter
        TimeRange(time_range=time_range)

        stats = await es_client.get_batch_usage_stats(
            batch_id=batch_id, time_range=time_range, interval=interval
        )

        if not stats:
            raise HTTPException(
                status_code=404,
                detail=f"No usage statistics available for batch {batch_id}",
            )

        logger.info(f"Successfully retrieved usage stats for batch {batch_id}")
        return UsageStatsResponse(**stats)

    except ValueError as ve:
        # Handle validation errors from the TimeRange validator
        logger.error(f"Invalid time_range parameter: {str(ve)}")
        raise HTTPException(
            status_code=400, detail=f"Invalid time_range parameter: {str(ve)}"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch usage stats for batch {batch_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch usage statistics: {str(e)}"
        )
