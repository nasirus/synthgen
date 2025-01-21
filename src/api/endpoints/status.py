from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from models.event import Event
from database.session import get_db
from datetime import datetime
import json

router = APIRouter()
USE_API_PREFIX = True

class TaskStatusResponse(BaseModel):
    message_id: str
    status: str
    result: Optional[dict] = None
    created_at: datetime
    duration: int

@router.get("/tasks/{message_id}", response_model=TaskStatusResponse)
async def get_task_status(message_id: str, db: Session = Depends(get_db)):
    try:
        event = db.query(Event).filter(Event.message_id == message_id).first()
        
        if not event:
            raise HTTPException(
                status_code=404,
                detail=f"Task with message_id {message_id} not found"
            )
        
        result = None
        if event.result:
            result = json.loads(event.result)
            
        return TaskStatusResponse(
            message_id=event.message_id,
            status=event.status,
            result=result,
            created_at=event.created_at,
            duration=event.duration
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch task status: {str(e)}"
        ) 