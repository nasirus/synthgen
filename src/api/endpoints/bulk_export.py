from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
import json
from sqlalchemy.orm import Session
from typing import Optional, List
from models.event import Event
from database.session import get_db

router = APIRouter()
USE_API_PREFIX = True


@router.get("/batches/{batch_id}/export")
async def export_batch_data(
    batch_id: str,
    format: str = Query("json", enum=["json", "jsonl", "csv"]),
    chunk_size: Optional[int] = Query(1000, gt=0),
    include_fields: Optional[str] = Query(
        None, description="Comma-separated list of fields to include"
    ),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """
    Export all data associated with a specific batch_id.
    Supports streaming response in different formats with field filtering.

    Args:
        batch_id: The batch ID to export
        format: Output format (json, jsonl, or csv)
        chunk_size: Number of records to process at once
        include_fields: Optional comma-separated list of fields to include
    """
    try:
        # Parse included fields if specified
        fields = include_fields.split(",") if include_fields else None

        async def generate_data():
            offset = 0
            while True:
                events: List[Event] = (
                    db.query(Event)
                    .filter(Event.batch_id == batch_id)
                    .limit(chunk_size)
                    .offset(offset)
                    .all()
                )

                if not events:
                    break

                for event in events:
                    event_data = {
                        "batch_id": event.batch_id,
                        "message_id": str(event.message_id),
                        "status": event.status,
                        "payload": event.payload,
                        "result": event.result,
                        "created_at": event.created_at.isoformat(),
                        "duration": event.duration,
                    }

                    # Filter fields if specified
                    if fields:
                        event_data = {
                            k: v for k, v in event_data.items() if k in fields
                        }

                    if format == "jsonl":
                        yield json.dumps(event_data) + "\n"
                    elif format == "json":
                        yield json.dumps(event_data) + ","

                offset += chunk_size

        # Set appropriate content type and filename
        content_type = "application/json" if format in ["json", "jsonl"] else "text/csv"
        filename = f"batch_{batch_id}_export.{format}"

        headers = {
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": content_type,
        }

        return StreamingResponse(
            generate_data(),
            headers=headers,
        )

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to export batch data: {str(e)}"
        )
