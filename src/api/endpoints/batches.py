from fastapi import (
    APIRouter,
    HTTPException,
    Depends,
    UploadFile,
    File,
    Query,
    BackgroundTasks,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from psycopg import Connection
from psycopg.rows import dict_row
from schemas.status import TaskStatus
from database.session import get_db
from datetime import datetime
from typing import Optional, List
from services.message_queue import RabbitMQHandler
import json
import uuid
from .tasks import TaskRequest
from tenacity import retry, stop_after_attempt, wait_exponential
from core.config import settings
import logging

router = APIRouter()
rabbitmq_handler = RabbitMQHandler()
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


class BulkTaskStatusResponse(BaseModel):
    # Identifiers
    batch_id: str

    # Status Overview
    batch_status: TaskStatus
    total_tasks: int
    completed_tasks: int
    failed_tasks: int
    pending_tasks: int
    cached_tasks: int

    # Timing Information
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration: Optional[int]

    # Token Usage
    total_tokens: int
    prompt_tokens: int
    completion_tokens: int


class BulkTaskResponse(BaseModel):
    batch_id: str
    rows: int


class BatchListResponse(BaseModel):
    batches: List[BulkTaskStatusResponse]
    total: int
    page: int
    page_size: int


class TaskDetail(BaseModel):
    # Identifiers
    message_id: str

    # Status and Result
    status: TaskStatus
    cached: Optional[bool]

    # Input/Output
    payload: dict
    result: Optional[dict]

    # Timing Information
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration: Optional[int]

    # Token Usage
    total_tokens: Optional[int]
    prompt_tokens: Optional[int]
    completion_tokens: Optional[int]


class BatchTasksResponse(BaseModel):
    tasks: List[TaskDetail]
    total: int
    page: int
    page_size: int


@retry(
    stop=stop_after_attempt(settings.MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.get("/batches/{batch_id}", response_model=BulkTaskStatusResponse)
async def get_bulk_task_status(batch_id: str, db: Connection = Depends(get_db)):
    logger.info(f"Fetching status for batch {batch_id}")
    try:
        with db.cursor(row_factory=dict_row) as cur:
            cur.execute(
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
                    COUNT(message_id) as total_count,
                    SUM(CASE WHEN cached = TRUE THEN 1 ELSE 0 END) as cached_count
                FROM events
                WHERE batch_id = %s
                GROUP BY batch_id
            """,
                (TaskStatus.COMPLETED.value, TaskStatus.FAILED.value, batch_id),
            )

            batch_stats = cur.fetchone()

        if not batch_stats:
            raise HTTPException(
                status_code=404, detail=f"No tasks found for batch_id {batch_id}"
            )

        completed_count = batch_stats["completed_count"]
        failed_count = batch_stats["failed_count"]
        total_count = batch_stats["total_count"]
        pending_count = total_count - (completed_count + failed_count)

        batch_status = (
            TaskStatus.PENDING
            if pending_count > 0
            else TaskStatus.FAILED if failed_count > 0 else TaskStatus.COMPLETED
        )

        response_data = {
            "batch_id": batch_id,
            "batch_status": batch_status,
            "created_at": batch_stats["created_at"],
            "started_at": batch_stats["started_at"],
            "completed_at": batch_stats["completed_at"],
            "duration": batch_stats["duration"],
            "total_tasks": batch_stats["total_count"],
            "completed_tasks": completed_count,
            "failed_tasks": failed_count,
            "pending_tasks": pending_count,
            "cached_tasks": batch_stats["cached_count"],
            "total_tokens": batch_stats["total_tokens"] or 0,
            "prompt_tokens": batch_stats["prompt_tokens"] or 0,
            "completion_tokens": batch_stats["completion_tokens"] or 0,
        }

        logger.info(f"Successfully retrieved status for batch {batch_id}")
        return BulkTaskStatusResponse(**response_data)

    except HTTPException:
        logger.error(f"HTTP error while fetching batch {batch_id}")
        raise
    except Exception as e:
        logger.error(f"Failed to fetch status for batch {batch_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch bulk task status: {str(e)}"
        )


async def process_bulk_tasks(content: bytes, batch_id: str):
    logger.info(f"Processing bulk tasks for batch {batch_id}")
    try:
        lines = content.decode("utf-8").strip().split("\n")
        logger.info(f"Processing {len(lines)} tasks for batch {batch_id}")
        for line_number, line in enumerate(lines, 1):
            try:
                task_data = json.loads(line)

                if not isinstance(task_data, dict):
                    raise ValueError(
                        f"Task data must be a JSON object, got {type(task_data)}"
                    )

                task_request = TaskRequest(**task_data)
                queue_data = task_request.model_dump()
                await rabbitmq_handler.publish_message(queue_data, batch_id)
            except json.JSONDecodeError as e:
                logger.error(
                    f"Invalid JSON at line {line_number} in batch {batch_id}: {str(e)}"
                )
            except Exception as e:
                logger.error(
                    f"Error processing task at line {line_number} in batch {batch_id}: {str(e)}"
                )
                logger.error(f"Problematic line content: {line}")
                raise  # Re-raise to see full traceback
    except Exception as e:
        logger.error(f"Error processing batch {batch_id}: {str(e)}")
        raise  # Re-raise to see full traceback


@router.post("/batches", response_model=BulkTaskResponse)
async def submit_bulk_tasks(
    background_tasks: BackgroundTasks, file: UploadFile = File(...)
):
    logger.info(f"Received bulk task submission: {file.filename}")
    if not file.filename.endswith(".jsonl"):
        raise HTTPException(status_code=400, detail="Only JSONL files are supported")

    try:
        batch_id = str(uuid.uuid4())
        content = await file.read()
        lines = content.decode("utf-8").strip().split("\n")
        rows = len(lines)

        # Schedule the message processing in the background
        background_tasks.add_task(process_bulk_tasks, content, batch_id)

        return BulkTaskResponse(batch_id=batch_id, rows=rows)

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to process bulk request: {str(e)}"
        )


@retry(
    stop=stop_after_attempt(settings.MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.get("/batches/{batch_id}/export")
async def export_batch_data(
    batch_id: str,
    format: str = Query("json", enum=["json", "jsonl"]),
    chunk_size: Optional[int] = Query(1000, gt=0, le=10000),
    include_fields: Optional[str] = Query(
        None, description="Comma-separated list of fields to include"
    ),
    db: Connection = Depends(get_db),
) -> StreamingResponse:
    logger.info(f"Exporting batch {batch_id} data in {format} format")
    try:
        fields = include_fields.split(",") if include_fields else None

        async def generate_data():
            offset = 0
            with db.cursor(row_factory=dict_row) as cur:
                while True:
                    cur.execute(
                        """
                        SELECT *
                        FROM events
                        WHERE batch_id = %s
                        ORDER BY created_at
                        LIMIT %s OFFSET %s
                    """,
                        (batch_id, chunk_size, offset),
                    )

                    events = cur.fetchall()
                    if not events:
                        break

                    for event in events:
                        event_data = {
                            # Identifiers
                            "batch_id": event["batch_id"],
                            "message_id": str(event["message_id"]),
                            # Status and Result
                            "status": event["status"],
                            "cached": event["cached"] or False,
                            # Input/Output
                            "payload": event["payload"],
                            "result": event["result"],
                            # Timing Information
                            "created_at": event["created_at"].isoformat(),
                            "started_at": (
                                event["started_at"].isoformat()
                                if event["started_at"]
                                else None
                            ),
                            "completed_at": (
                                event["completed_at"].isoformat()
                                if event["completed_at"]
                                else None
                            ),
                            "duration": event["duration"],
                            # Token Usage
                            "prompt_tokens": event["prompt_tokens"],
                            "completion_tokens": event["completion_tokens"],
                            "total_tokens": event["total_tokens"],
                        }

                        if fields:
                            event_data = {
                                k: v for k, v in event_data.items() if k in fields
                            }

                        if format == "jsonl":
                            yield json.dumps(event_data) + "\n"
                        elif format == "json":
                            yield json.dumps(event_data) + ","

                    offset += chunk_size

        filename = f"batch_{batch_id}_export.{format}"
        headers = {
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": "application/json",
        }

        return StreamingResponse(generate_data(), headers=headers)

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to export batch data: {str(e)}"
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
    db: Connection = Depends(get_db),
):
    logger.info(f"Listing batches - page: {page}, page_size: {page_size}")
    try:
        offset = (page - 1) * page_size

        with db.cursor(row_factory=dict_row) as cur:
            # Get total count of non-null batch_ids
            cur.execute(
                "SELECT COUNT(DISTINCT batch_id) FROM events WHERE batch_id IS NOT NULL"
            )
            total_batches = cur.fetchone()["count"]

            # Modified query to order by earliest created_at for each batch
            cur.execute(
                """
                SELECT batch_id
                FROM (
                    SELECT DISTINCT batch_id, MIN(created_at) AS created_at
                    FROM events
                    WHERE batch_id IS NOT NULL
                    GROUP BY batch_id
                    ORDER BY MIN(created_at) DESC
                ) t1
                LIMIT %s OFFSET %s
            """,
                (page_size, offset),
            )

            batch_ids = [row["batch_id"] for row in cur.fetchall()]

        # Get status for each batch
        batches = []
        for batch_id in batch_ids:
            try:
                batch_status = await get_bulk_task_status(batch_id, db)
                batches.append(batch_status)
            except HTTPException as e:
                logger.warning(f"Skipping batch {batch_id} due to error: {str(e)}")
                continue

        return BatchListResponse(
            batches=batches, total=total_batches, page=page, page_size=page_size
        )

    except Exception as e:
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
    db: Connection = Depends(get_db),
):
    logger.info(
        f"Fetching tasks for batch {batch_id} - page: {page}, page_size: {page_size}"
    )
    try:
        offset = (page - 1) * page_size

        with db.cursor(row_factory=dict_row) as cur:
            # Get total count
            cur.execute("SELECT COUNT(*) FROM events WHERE batch_id = %s", (batch_id,))
            total_tasks = cur.fetchone()["count"]

            # Get paginated tasks
            cur.execute(
                """
                SELECT *
                FROM events
                WHERE batch_id = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """,
                (batch_id, page_size, offset),
            )

            tasks = cur.fetchall()

        if not tasks and page == 1:
            raise HTTPException(
                status_code=404, detail=f"No tasks found for batch_id {batch_id}"
            )

        task_details = [
            TaskDetail(
                message_id=str(task["message_id"]),
                status=TaskStatus(task["status"]),
                cached=task["cached"] or False,
                payload=task["payload"],
                result=task["result"],
                created_at=task["created_at"],
                started_at=task["started_at"],
                completed_at=task["completed_at"],
                duration=task["duration"],
                total_tokens=task["total_tokens"],
                prompt_tokens=task["prompt_tokens"],
                completion_tokens=task["completion_tokens"],
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
