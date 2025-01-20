from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from models.event import Event
from database.session import get_db

router = APIRouter()
USE_API_PREFIX = True


@router.get("/bulk-export/{batch_id}")
async def export_batch_data(
    batch_id: str, db: Session = Depends(get_db)
) -> JSONResponse:
    """
    Export all data associated with a specific batch_id.
    Returns a JSON file containing all events and their associated data.
    """
    try:
        events = db.query(Event).filter(Event.batch_id == batch_id).all()

        if not events:
            raise HTTPException(
                status_code=404, detail=f"No tasks found for batch_id {batch_id}"
            )

        # Convert events to a list of dictionaries
        export_data: List[Dict[Any, Any]] = []
        for event in events:
            event_data = {
                "batch_id": event.batch_id,
                "message_id": str(event.message_id),
                "status": event.status,
                "payload": event.payload,
                "result": event.result,
                "created_at": event.created_at.isoformat(),
                "updated_at": event.updated_at.isoformat(),
                "duration": event.duration,
            }
            export_data.append(event_data)

        # Create response with appropriate headers for file download
        return JSONResponse(
            content=export_data,
            headers={
                "Content-Disposition": f"attachment; filename=batch_{batch_id}_export.json",
                "Content-Type": "application/json",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to export batch data: {str(e)}"
        )
