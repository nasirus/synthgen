from fastapi import APIRouter, HTTPException, Depends, Query
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


class TaskListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    tasks: List[Task]


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


@retry(
    stop=stop_after_attempt(settings.MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.get("/tasks", response_model=TaskListResponse)
async def list_tasks(
    page: int = Query(1, gt=0),
    page_size: int = Query(50, gt=0, le=100),
    db: Connection = Depends(get_db),
):
    try:
        offset = (page - 1) * page_size

        with db.cursor(row_factory=dict_row) as cur:
            # Get total count of individual tasks (where batch_id is NULL)
            cur.execute(
                "SELECT COUNT(*) FROM events WHERE batch_id IS NULL"
            )
            total_tasks = cur.fetchone()["count"]

            # Get paginated tasks
            cur.execute(
                """
                SELECT 
                    message_id,
                    status,
                    prompt_tokens,
                    completion_tokens,
                    total_tokens,
                    cached,
                    created_at,
                    started_at,
                    completed_at,
                    duration
                FROM events
                WHERE batch_id IS NULL
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (page_size, offset),
            )

            tasks = cur.fetchall()

            task_list = [
                Task(
                    message_id=str(task["message_id"]),
                    batch_id=None,
                    status=task["status"],
                    payload=None,
                    result=None,
                    prompt_tokens=task["prompt_tokens"],
                    completion_tokens=task["completion_tokens"],
                    total_tokens=task["total_tokens"],
                    cached=task["cached"] or False,
                    created_at=task["created_at"],
                    started_at=task["started_at"] if task["started_at"] else None,
                    completed_at=task["completed_at"] if task["completed_at"] else None,
                    duration=task["duration"],
                    queue_position=None,
                )
                for task in tasks
            ]

            return TaskListResponse(
                tasks=task_list,
                total=total_tasks,
                page=page,
                page_size=page_size
            )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch task list: {str(e)}"
        )
