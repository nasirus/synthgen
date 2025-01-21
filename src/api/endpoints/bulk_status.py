from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from models.event import Event
from schemas.status import TaskStatus
from database.session import get_db

router = APIRouter()
USE_API_PREFIX = True


class BulkTaskStatusResponse(BaseModel):
    batch_id: str
    total_tasks: int
    completed_tasks: int
    failed_tasks: int
    pending_tasks: int
    task_status: TaskStatus


@router.get("/batches/{batch_id}", response_model=BulkTaskStatusResponse)
async def get_bulk_task_status(batch_id: str, db: Session = Depends(get_db)):
    try:
        # Query to get counts of tasks in different states
        task_counts = (
            db.query(
                Event.status,
                func.count(Event.message_id).label('count')
            )
            .filter(Event.batch_id == batch_id)
            .group_by(Event.status)
            .all()
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
                pending_count = count

        total_tasks = completed_count + failed_count + pending_count

        # Determine overall task status
        if pending_count > 0:
            task_status = TaskStatus.PENDING
        elif failed_count > 0:
            task_status = TaskStatus.FAILED
        else:
            task_status = TaskStatus.COMPLETED

        return BulkTaskStatusResponse(
            batch_id=batch_id,
            total_tasks=total_tasks,
            completed_tasks=completed_count,
            failed_tasks=failed_count,
            pending_tasks=pending_count,
            task_status=task_status,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch bulk task status: {str(e)}"
        )
