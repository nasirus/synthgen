from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from models.event import Event
from schemas.status import TaskStatus
from database.session import get_db
from datetime import datetime
from typing import Optional

router = APIRouter()
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
