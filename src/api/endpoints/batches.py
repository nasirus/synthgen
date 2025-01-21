from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from models.event import Event
from schemas.status import TaskStatus
from database.session import get_db
from datetime import datetime
from typing import Optional, List
from services.message_queue import RabbitMQHandler
import json
import uuid
from .tasks import TaskRequest

router = APIRouter()
rabbitmq_handler = RabbitMQHandler()
USE_API_PREFIX = True


class BulkTaskStatusResponse(BaseModel):
    batch_id: str
    batch_status: TaskStatus
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration: Optional[int]
    total_tasks: int
    completed_tasks: int
    failed_tasks: int
    pending_tasks: int
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
    message_id: str
    status: TaskStatus
    payload: dict
    result: Optional[dict]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration: Optional[int]
    total_tokens: Optional[int]
    prompt_tokens: Optional[int]
    completion_tokens: Optional[int]


class BatchTasksResponse(BaseModel):
    tasks: List[TaskDetail]
    total: int
    page: int
    page_size: int


@router.get("/batches/{batch_id}", response_model=BulkTaskStatusResponse)
async def get_bulk_task_status(batch_id: str, db: Session = Depends(get_db)):
    try:
        # Combined query for both task counts and batch details
        batch_stats = (
            db.query(
                Event.batch_id,
                func.min(Event.created_at).label("created_at"),
                func.min(Event.started_at).label("started_at"),
                func.max(Event.completed_at).label("completed_at"),
                func.sum(Event.duration).label("duration"),
                func.sum(Event.total_tokens).label("total_tokens"),
                func.sum(Event.prompt_tokens).label("prompt_tokens"),
                func.sum(Event.completion_tokens).label("completion_tokens"),
                func.sum(case(
                    (Event.status == TaskStatus.COMPLETED.value, 1),
                    else_=0
                )).label("completed_count"),
                func.sum(case(
                    (Event.status == TaskStatus.FAILED.value, 1),
                    else_=0
                )).label("failed_count"),
                func.count(Event.message_id).label("total_count")
            )
            .filter(Event.batch_id == batch_id)
            .group_by(Event.batch_id)
            .first()
        )

        if not batch_stats:
            raise HTTPException(
                status_code=404, detail=f"No tasks found for batch_id {batch_id}"
            )

        completed_count = batch_stats.completed_count
        failed_count = batch_stats.failed_count
        total_count = batch_stats.total_count
        pending_count = total_count - (completed_count + failed_count)

        # Determine overall batch status
        batch_status = (
            TaskStatus.PENDING if pending_count > 0
            else TaskStatus.FAILED if failed_count > 0
            else TaskStatus.COMPLETED
        )

        response_data = {
            "batch_id": batch_id,
            "batch_status": batch_status,
            "created_at": batch_stats.created_at,
            "started_at": batch_stats.started_at,
            "completed_at": batch_stats.completed_at,
            "duration": batch_stats.duration,
            "total_tasks": batch_stats.total_count,
            "completed_tasks": batch_stats.completed_count,
            "failed_tasks": batch_stats.failed_count,
            "pending_tasks": batch_stats.total_count - (batch_stats.completed_count + batch_stats.failed_count),
            "total_tokens": batch_stats.total_tokens or 0,
            "prompt_tokens": batch_stats.prompt_tokens or 0,
            "completion_tokens": batch_stats.completion_tokens or 0,
        }

        return BulkTaskStatusResponse(**response_data)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch bulk task status: {str(e)}"
        )


async def process_bulk_tasks(content: bytes, batch_id: str):
    try:
        lines = content.decode("utf-8").strip().split("\n")
        for line in lines:
            try:
                task_data = json.loads(line)
                task_request = TaskRequest(**task_data)
                queue_data = task_request.model_dump()
                await rabbitmq_handler.publish_message(queue_data, batch_id)
            except Exception as e:
                # Log the error but continue processing other tasks
                print(f"Error processing task in batch {batch_id}: {str(e)}")
    except Exception as e:
        print(f"Error processing batch {batch_id}: {str(e)}")


@router.post("/batches", response_model=BulkTaskResponse)
async def submit_bulk_tasks(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
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


@router.get("/batches/{batch_id}/export")
async def export_batch_data(
    batch_id: str,
    format: str = Query("json", enum=["json", "jsonl"]),
    chunk_size: Optional[int] = Query(1000, gt=0, le=10000),
    include_fields: Optional[str] = Query(
        None, description="Comma-separated list of fields to include"
    ),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """
    Export all data associated with a specific batch_id.
    Supports streaming response in different formats with field filtering.

    Args:
        batch_id: The batch ID to export
        format: Output format (json, jsonl, or csv)
        chunk_size: Number of records to process at once
        include_fields: Optional comma-separated list of fields to include
    """
    try:
        # Parse included fields if specified
        fields = include_fields.split(",") if include_fields else None

        async def generate_data():
            offset = 0
            while True:
                events: List[Event] = (
                    db.query(Event)
                    .filter(Event.batch_id == batch_id)
                    .limit(chunk_size)
                    .offset(offset)
                    .all()
                )

                if not events:
                    break

                for event in events:
                    event_data = {
                        "batch_id": event.batch_id,
                        "message_id": str(event.message_id),
                        "status": event.status,
                        "payload": event.payload,
                        "result": event.result,
                        "created_at": event.created_at.isoformat(),
                        "duration": event.duration,
                    }

                    # Filter fields if specified
                    if fields:
                        event_data = {
                            k: v for k, v in event_data.items() if k in fields
                        }

                    if format == "jsonl":
                        yield json.dumps(event_data) + "\n"
                    elif format == "json":
                        yield json.dumps(event_data) + ","

                offset += chunk_size

        # Set appropriate content type and filename
        filename = f"batch_{batch_id}_export.{format}"

        headers = {
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": "application/json",
        }

        return StreamingResponse(
            generate_data(),
            headers=headers,
        )

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to export batch data: {str(e)}"
        )


@router.get("/batches", response_model=BatchListResponse)
async def list_batches(
    page: int = Query(1, gt=0),
    page_size: int = Query(50, gt=0, le=100),
    db: Session = Depends(get_db)
):
    try:
        # Calculate offset
        offset = (page - 1) * page_size

        # Get unique batch IDs with pagination
        batch_ids = (
            db.query(Event.batch_id)
            .distinct()
            .order_by(Event.batch_id.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )

        # Get total number of unique batches
        total_batches = db.query(Event.batch_id).distinct().count()

        # Get status for each batch
        batches = []
        for (batch_id,) in batch_ids:
            batch_status = await get_bulk_task_status(batch_id, db)
            batches.append(batch_status)

        return BatchListResponse(
            batches=batches,
            total=total_batches,
            page=page,
            page_size=page_size
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch batch list: {str(e)}"
        )


@router.get("/batches/{batch_id}/tasks", response_model=BatchTasksResponse)
async def get_batch_tasks(
    batch_id: str,
    page: int = Query(1, gt=0),
    page_size: int = Query(50, gt=0, le=100),
    db: Session = Depends(get_db)
):
    try:
        # Calculate offset
        offset = (page - 1) * page_size

        # Get total count of tasks in batch
        total_tasks = db.query(Event).filter(Event.batch_id == batch_id).count()

        # Get paginated tasks
        tasks = (
            db.query(Event)
            .filter(Event.batch_id == batch_id)
            .order_by(Event.created_at.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )

        if not tasks and page == 1:
            raise HTTPException(
                status_code=404,
                detail=f"No tasks found for batch_id {batch_id}"
            )

        task_details = [
            TaskDetail(
                message_id=str(task.message_id),
                status=TaskStatus(task.status),
                payload=json.loads(task.payload) if task.payload else None,
                result=json.loads(task.result) if task.result else None,
                created_at=task.created_at,
                started_at=task.started_at,
                completed_at=task.completed_at,
                duration=task.duration,
                total_tokens=task.total_tokens,
                prompt_tokens=task.prompt_tokens,
                completion_tokens=task.completion_tokens
            )
            for task in tasks
        ]

        return BatchTasksResponse(
            tasks=task_details,
            total=total_tasks,
            page=page,
            page_size=page_size
        )

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse JSON data: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch batch tasks: {str(e)}"
        )
