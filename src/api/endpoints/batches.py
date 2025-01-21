from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
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


@router.get("/batches/{batch_id}", response_model=BulkTaskStatusResponse)
async def get_bulk_task_status(batch_id: str, db: Session = Depends(get_db)):
    try:
        # Query to get counts of tasks in different states
        task_counts = (
            db.query(Event.status, func.count(Event.message_id).label("count"))
            .filter(Event.batch_id == batch_id)
            .group_by(Event.status)
            .all()
        )

        # Query to get batch details including created_at
        batch_details = (
            db.query(
                Event.batch_id,
                func.min(Event.created_at).label("created_at"),
                func.min(Event.started_at).label("started_at"),
                func.max(Event.completed_at).label("completed_at"),
                func.sum(Event.duration).label("duration"),
                func.sum(Event.total_tokens).label("total_tokens"),
                func.sum(Event.prompt_tokens).label("prompt_tokens"),
                func.sum(Event.completion_tokens).label("completion_tokens"),
            )
            .filter(Event.batch_id == batch_id)
            .group_by(Event.batch_id)
            .first()
        )

        if not task_counts:
            raise HTTPException(
                status_code=404, detail=f"No tasks found for batch_id {batch_id}"
            )

        # Initialize counters
        completed_count = 0
        failed_count = 0
        pending_count = 0

        # Process the counts
        for status, count in task_counts:
            if status == TaskStatus.COMPLETED.value:
                completed_count = count
            elif status == TaskStatus.FAILED.value:
                failed_count = count
            else:
                pending_count += count  # Sum all other statuses as pending

        total_tasks = completed_count + failed_count + pending_count

        # Determine overall batch status
        if pending_count > 0:
            batch_status = TaskStatus.PENDING
        elif failed_count > 0:
            batch_status = TaskStatus.FAILED
        else:
            batch_status = TaskStatus.COMPLETED

        # Handle potential None values for sum fields
        total_tokens = batch_details.total_tokens or 0
        prompt_tokens = batch_details.prompt_tokens or 0
        completion_tokens = batch_details.completion_tokens or 0

        return BulkTaskStatusResponse(
            batch_id=batch_id,
            batch_status=batch_status,
            created_at=batch_details.created_at,
            started_at=batch_details.started_at,
            completed_at=batch_details.completed_at,
            duration=batch_details.duration,
            total_tasks=total_tasks,
            completed_tasks=completed_count,
            failed_tasks=failed_count,
            pending_tasks=pending_count,
            total_tokens=total_tokens,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch bulk task status: {str(e)}"
        )


@router.post("/batches", response_model=BulkTaskResponse)
async def submit_bulk_tasks(file: UploadFile = File(...)):
    if not file.filename.endswith(".jsonl"):
        raise HTTPException(status_code=400, detail="Only JSONL files are supported")

    batch_id = str(uuid.uuid4())

    try:
        content = await file.read()
        lines = content.decode("utf-8").strip().split("\n")
        rows = len(lines)

        for line in lines:
            try:
                task_data = json.loads(line)
                task_request = TaskRequest(**task_data)

                # Prepare task data for queue
                queue_data = task_request.model_dump()

                # Publish to queue using the async method
                await rabbitmq_handler.publish_message(queue_data, batch_id)

            except Exception as e:
                raise HTTPException(
                    status_code=500, detail=f"Failed to process bulk request: {str(e)}"
                )

        return BulkTaskResponse(batch_id=batch_id, rows=rows)

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to process bulk request: {str(e)}"
        )


@router.get("/batches/{batch_id}/export")
async def export_batch_data(
    batch_id: str,
    format: str = Query("json", enum=["json", "jsonl", "csv"]),
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
