from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
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


@router.get("/bulk-status/{batch_id}", response_model=BulkTaskStatusResponse)
async def get_bulk_task_status(batch_id: str, db: Session = Depends(get_db)):
    try:
        events = db.query(Event).filter(Event.batch_id == batch_id).all()

        if not events:
            raise HTTPException(
                status_code=404, detail=f"No tasks found for batch_id {batch_id}"
            )

        completed_count = 0
        failed_count = 0
        pending_count = 0

        for event in events:
            if event.status == TaskStatus.COMPLETED.value:
                completed_count += 1
            elif event.status == TaskStatus.FAILED.value:
                failed_count += 1
            else:
                pending_count += 1

        # If there are pending tasks, the batch is pending
        # If there are failed tasks, the batch is failed
        # If there are completed tasks, the batch is completed
        if pending_count > 0:
            task_status = TaskStatus.PENDING
        elif failed_count > 0:
            task_status = TaskStatus.FAILED
        else:
            task_status = TaskStatus.COMPLETED

        return BulkTaskStatusResponse(
            batch_id=batch_id,
            total_tasks=len(events),
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
