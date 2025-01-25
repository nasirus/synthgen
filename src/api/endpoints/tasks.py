from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List
from services.message_queue import RabbitMQHandler
from psycopg import Connection
from psycopg.rows import dict_row
from database.session import get_db
from schemas.status import TaskStatus
from schemas.task import Task
from tenacity import retry, stop_after_attempt, wait_exponential
from core.config import settings

router = APIRouter()
rabbitmq_handler = RabbitMQHandler()
USE_API_PREFIX = True


class EventResponse(BaseModel):
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


@router.post("/tasks", response_model=EventResponse)
async def submit_task(request: TaskRequest):
    try:
        task_data = {
            "model": request.model,
            "messages": [msg.model_dump() for msg in request.messages],
        }

        message_id = await rabbitmq_handler.publish_message(task_data)

        return EventResponse(message_id=message_id)

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to process request: {str(e)}"
        )


@retry(
    stop=stop_after_attempt(settings.MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.get("/tasks/{message_id}", response_model=Task)
async def get_task_status(message_id: str, db: Connection = Depends(get_db)):
    try:
        with db.cursor(row_factory=dict_row) as cur:
            # Get the event details
            cur.execute(
                """
                SELECT *
                FROM events
                WHERE message_id = %s
            """,
                (message_id,),
            )

            event = cur.fetchone()

            if not event:
                raise HTTPException(
                    status_code=404,
                    detail=f"Task with message_id {message_id} not found",
                )

            # Calculate queue position for pending tasks
            queue_position = None
            if event["status"] == TaskStatus.PENDING.value:
                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM events
                    WHERE status = %s
                    AND created_at <= %s
                """,
                    (TaskStatus.PENDING.value, event["created_at"]),
                )

                queue_position = cur.fetchone()["count"]

            # Create response dictionary with JSON serialization
            response = Task(
                message_id=event["message_id"],
                batch_id=event["batch_id"],
                status=event["status"],
                payload=event["payload"],
                result=event["result"],
                prompt_tokens=event["prompt_tokens"],
                completion_tokens=event["completion_tokens"],
                total_tokens=event["total_tokens"],
                cached=event["cached"] or False,
                created_at=event["created_at"],
                started_at=event["started_at"] if event["started_at"] else None,
                completed_at=event["completed_at"] if event["completed_at"] else None,
                duration=event["duration"],
                queue_position=queue_position,
            )

            return response

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch task status: {str(e)}"
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
                (message_id,),
            )
            deleted = cur.fetchone()

            if not deleted:
                raise HTTPException(
                    status_code=404,
                    detail=f"Task with message_id {message_id} not found",
                )

            db.commit()
            return None

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete task: {str(e)}")
