from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from services.message_queue import RabbitMQHandler
from datetime import datetime
from sqlalchemy.orm import Session
from models.event import Event
from database.session import get_db
from fastapi import Depends

router = APIRouter()
rabbitmq_handler = RabbitMQHandler()
USE_API_PREFIX = True


class TaskResponse(BaseModel):
    message_id: str


class Message(BaseModel):
    role: str = Field(
        ..., description="Role of the message sender (e.g., 'developer', 'user')"
    )
    content: str = Field(..., description="Content of the message")


class TaskRequest(BaseModel):
    model: str = Field(..., description="The model to be used (e.g., 'gpt-4')")
    messages: List[Message] = Field(
        ..., description="List of messages for the conversation"
    )


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


@router.post("/tasks", response_model=TaskResponse)
async def submit_task(request: TaskRequest):
    try:
        task_data = {
            "model": request.model,
            "messages": [msg.model_dump() for msg in request.messages],
        }

        message_id = rabbitmq_handler.publish_message(task_data)

        return TaskResponse(message_id=message_id)

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to process request: {str(e)}"
        )


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
