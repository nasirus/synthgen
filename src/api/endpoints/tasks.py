from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List
from services.message_queue import RabbitMQHandler

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


@router.post("/submit", response_model=TaskResponse)
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
