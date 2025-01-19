from pydantic import BaseModel
from typing import Optional

class TaskBase(BaseModel):
    task_type: str
    content: Optional[str] = None
    filename: Optional[str] = None

class TaskCreate(TaskBase):
    pass

class TaskResponse(TaskBase):
    status: str
    message: str 