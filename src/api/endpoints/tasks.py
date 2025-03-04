from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List
from schemas.task import Task
from tenacity import retry, stop_after_attempt, wait_exponential
from core.config import settings
from database.elastic_session import ElasticsearchClient, get_elasticsearch_client
from core.auth import get_current_user

router = APIRouter()
USE_API_PREFIX = True


class TaskListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    tasks: List[Task]


class TaskStatsResponse(BaseModel):
    total_tasks: int
    completed_tasks: int
    failed_tasks: int
    cached_tasks: int
    processing_tasks: int
    pending_tasks: int
    total_tokens: int
    prompt_tokens: int
    completion_tokens: int


@retry(
    stop=stop_after_attempt(settings.RETRY_ATTEMPTS),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.get("/tasks/stats", response_model=TaskStatsResponse)
async def get_task_stats(
    current_user: str = Depends(get_current_user),
    es_client: ElasticsearchClient = Depends(get_elasticsearch_client),
):
    try:
        stats_aggs = await es_client.get_tasks_usage_stats()

        # Transform Elasticsearch aggregation results to match TaskStatsResponse format
        stats = {
            "total_tasks": stats_aggs["total_tasks"]["value"],
            "completed_tasks": stats_aggs["completed_tasks"]["doc_count"] - stats_aggs["cached_tasks"]["doc_count"],
            "failed_tasks": stats_aggs["failed_tasks"]["doc_count"],
            "cached_tasks": stats_aggs["cached_tasks"]["doc_count"],
            "processing_tasks": stats_aggs["processing_tasks"]["doc_count"],
            "pending_tasks": stats_aggs["pending_tasks"]["doc_count"],
            "total_tokens": int(stats_aggs["total_tokens"]["value"] or 0),
            "prompt_tokens": int(stats_aggs["prompt_tokens"]["value"] or 0),
            "completion_tokens": int(stats_aggs["completion_tokens"]["value"] or 0),
        }

        return TaskStatsResponse(**stats)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch task stats: {str(e)}"
        )


@retry(
    stop=stop_after_attempt(settings.RETRY_ATTEMPTS),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.get("/tasks/{message_id}", response_model=Task)
async def get_task(
    message_id: str,
    current_user: str = Depends(get_current_user),
    es_client: ElasticsearchClient = Depends(get_elasticsearch_client),
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
    stop=stop_after_attempt(settings.RETRY_ATTEMPTS),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True,
)
@router.delete("/tasks/{message_id}", status_code=204)
async def delete_task(
    message_id: str,
    current_user: str = Depends(get_current_user),
    es_client: ElasticsearchClient = Depends(get_elasticsearch_client),
):
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
