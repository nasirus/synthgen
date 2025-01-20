from fastapi import APIRouter, HTTPException, UploadFile, File
import json
from pydantic import BaseModel
from services.message_queue import RabbitMQHandler
from .tasks import TaskRequest
import uuid

router = APIRouter()
rabbitmq_handler = RabbitMQHandler()
USE_API_PREFIX = True


class BulkTaskResponse(BaseModel):
    batch_id: str
    rows: int


@router.post("/batches", response_model=BulkTaskResponse)
async def submit_bulk_tasks(file: UploadFile = File(...)):
    if not file.filename.endswith(".jsonl"):
        raise HTTPException(status_code=400, detail="Only JSONL files are supported")

    batch_id = str(uuid.uuid4())

    try:
        content = await file.read()
        lines = content.decode("utf-8").strip().split("\n")
        rows = len(lines)

        for line in lines:
            try:
                task_data = json.loads(line)
                task_request = TaskRequest(**task_data)

                # Prepare task data for queue
                queue_data = {
                    "model": task_request.model,
                    "messages": [msg.model_dump() for msg in task_request.messages],
                }

                # Publish to queue
                rabbitmq_handler.publish_message(queue_data, batch_id)

            except Exception as e:
                raise HTTPException(
                    status_code=500, detail=f"Failed to process bulk request: {str(e)}"
                )

        return BulkTaskResponse(batch_id=batch_id, rows=rows)

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to process bulk request: {str(e)}"
        )
