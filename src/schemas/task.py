from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from schemas.task_status import TaskStatus


class Task(BaseModel):
    message_id: str
    batch_id: Optional[str]
    custom_id: Optional[str]
    status: TaskStatus
    body: Optional[dict]
    completions: Optional[dict]
    cached: bool
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration: Optional[int]
    dataset: Optional[str]
    source: Optional[dict]

    class Config:
        from_attributes = True
