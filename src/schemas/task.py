from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from schemas.status import TaskStatus


class Task(BaseModel):
    message_id: str
    batch_id: Optional[str]
    status: TaskStatus
    payload: dict
    result: Optional[dict]
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
        from_attributes = True
