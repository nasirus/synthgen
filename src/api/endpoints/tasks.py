from fastapi import APIRouter, HTTPException, File, UploadFile, Form
from typing import Optional
from services.message_queue import RabbitMQHandler
from schemas.task import TaskResponse

router = APIRouter()
USE_API_PREFIX = True  # This will add the API version prefix
rabbitmq_handler = RabbitMQHandler()

@router.post("/submit", response_model=TaskResponse)
async def submit_task(
    message: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    if not message and not file:
        raise HTTPException(
            status_code=400,
            detail="Either message or file must be provided"
        )
    
    try:
        task_data = {
            "task_type": "file_processing" if file else "message_processing",
            "content": None
        }
        
        if file:
            content = await file.read()
            task_data["content"] = content.decode()
            task_data["filename"] = file.filename
        else:
            task_data["content"] = message
            
        message_id =rabbitmq_handler.publish_message(task_data)
        
        return TaskResponse(
            status="success",
            message="Task submitted successfully",
            **task_data,
            message_id=message_id
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process request: {str(e)}"
        ) 