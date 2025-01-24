from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional
from services.message_queue import RabbitMQHandler
from datetime import datetime
from psycopg import Connection
from psycopg.rows import dict_row
from database.session import get_db
from schemas.status import TaskStatus
from tenacity import retry, stop_after_attempt, wait_exponential
from core.config import settings
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
    queue_position: Optional[int]

    class Config:
        from_attributes = True  # Allows Pydantic to read data from SQLAlchemy models


@router.post("/tasks", response_model=TaskResponse)
async def submit_task(request: TaskRequest):
    try:
        task_data = {
            "model": request.model,
            "messages": [msg.model_dump() for msg in request.messages],
        }

        message_id = await rabbitmq_handler.publish_message(task_data)

        return TaskResponse(message_id=message_id)

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to process request: {str(e)}"
        )

@retry(
    stop=stop_after_attempt(settings.MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.get("/tasks/{message_id}", response_model=EventResponse)
async def get_task_status(message_id: str, db: Connection = Depends(get_db)):
    try:
        with db.cursor(row_factory=dict_row) as cur:
            # Get the event details
            cur.execute("""
                SELECT *
                FROM events
                WHERE message_id = %s
            """, (message_id,))
            
            event = cur.fetchone()

            if not event:
                raise HTTPException(
                    status_code=404, 
                    detail=f"Task with message_id {message_id} not found"
                )

            # Calculate queue position for pending tasks
            queue_position = None
            if event['status'] == TaskStatus.PENDING.value:
                cur.execute("""
                    SELECT COUNT(*)
                    FROM events
                    WHERE status = %s
                    AND created_at <= %s
                """, (TaskStatus.PENDING.value, event['created_at']))
                
                queue_position = cur.fetchone()['count']

            # Create response dictionary with JSON serialization
            response_dict = {
                'message_id': event['message_id'],
                'batch_id': event['batch_id'],
                'status': event['status'],
                'payload': str(event['payload']),  # Convert JSON to string
                'result': str(event['result']),    # Convert JSON to string
                'prompt_tokens': event['prompt_tokens'],
                'completion_tokens': event['completion_tokens'],
                'total_tokens': event['total_tokens'],
                'cached': event['cached'] or False,
                'created_at': event['created_at'],
                'started_at': event['started_at'],
                'completed_at': event['completed_at'],
                'duration': event['duration'],
                'queue_position': queue_position
            }

            return EventResponse(**response_dict)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to fetch task status: {str(e)}"
        )

@retry(
    stop=stop_after_attempt(settings.MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.delete("/tasks/{message_id}", status_code=204)
async def delete_task(message_id: str, db: Connection = Depends(get_db)):
    try:
        with db.cursor(row_factory=dict_row) as cur:
            # Delete and check if any row was affected
            cur.execute(
                "DELETE FROM events WHERE message_id = %s RETURNING message_id",
                (message_id,)
            )
            deleted = cur.fetchone()
            
            if not deleted:
                raise HTTPException(
                    status_code=404,
                    detail=f"Task with message_id {message_id} not found"
                )
            
            db.commit()
            return None

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete task: {str(e)}"
        )
