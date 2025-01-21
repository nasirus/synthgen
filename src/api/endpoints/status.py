from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from models.event import Event
from database.session import get_db
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

# Create Pydantic model for response
class EventResponse(BaseModel):
    message_id: str
    batch_id: Optional[str]
    status: str
    payload: str
    result: Optional[str]
    prompt_tokens: Optional[int]
    completion_tokens: Optional[int]
    total_tokens: Optional[int]
    cached: bool
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration: Optional[int]

    class Config:
        from_attributes = True  # Allows Pydantic to read data from SQLAlchemy models

router = APIRouter()
USE_API_PREFIX = True


@router.get("/tasks/{message_id}", response_model=EventResponse)
async def get_task_status(message_id: str, db: Session = Depends(get_db)):
    try:
        event: Event = db.query(Event).filter(Event.message_id == message_id).first()

        if not event:
            raise HTTPException(
                status_code=404, detail=f"Task with message_id {message_id} not found"
            )

        return event

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch task status: {str(e)}"
        )
