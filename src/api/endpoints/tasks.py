from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List
from schemas.task import Task
from tenacity import retry, stop_after_attempt, wait_exponential
from core.config import settings
from database.elastic_session import ElasticsearchClient, get_elasticsearch_client

router = APIRouter()
USE_API_PREFIX = True


class TaskListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    tasks: List[Task]


@retry(
    stop=stop_after_attempt(settings.MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.get("/tasks/{message_id}", response_model=Task)
async def get_task(
    message_id: str, es_client: ElasticsearchClient = Depends(get_elasticsearch_client)
):
    try:
        event = await es_client.get_task_by_message_id(message_id)
        if not event:
            raise HTTPException(
                status_code=404, detail=f"Task with message_id {message_id} not found"
            )
        return Task(**event)
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
async def delete_task(message_id: str, es_client=Depends(get_elasticsearch_client)):
    try:
        deleted = await es_client.delete_task_by_message_id(message_id)
        if deleted == 0:
            raise HTTPException(
                status_code=404, detail=f"Task with message_id {message_id} not found"
            )
        return None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete task: {str(e)}")
