from pydantic import BaseModel

class TaskResponse(BaseModel):
    message_id: str