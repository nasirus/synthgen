from fastapi import APIRouter, HTTPException
import pika
from core.config import settings

router = APIRouter()
USE_API_PREFIX = False  # This will keep the health check at /health

@router.get("/health")
async def health_check():
    try:
        # Try to establish a connection to RabbitMQ
        credentials = pika.PlainCredentials(
            username=settings.RABBITMQ_USER,
            password=settings.RABBITMQ_PASS
        )
        parameters = pika.ConnectionParameters(
            host=settings.RABBITMQ_HOST,
            port=settings.RABBITMQ_PORT,
            credentials=credentials
        )
        connection = pika.BlockingConnection(parameters)
        connection.close()
        
        return {
            "status": "healthy",
            "services": {
                "api": "healthy",
                "rabbitmq": "healthy"
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "services": {
                    "api": "healthy",
                    "rabbitmq": "unhealthy"
                },
                "error": str(e)
            }
        ) 