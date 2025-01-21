from fastapi import APIRouter, HTTPException
import pika
from database.session import pool
from core.config import settings
from pydantic import BaseModel
from typing import Literal
from tenacity import retry, stop_after_attempt, wait_exponential

router = APIRouter()
USE_API_PREFIX = False  # This will keep the health check at /health


class ServiceStatus(BaseModel):
    api: Literal["healthy", "unhealthy"] = "healthy"
    rabbitmq: Literal["healthy", "unhealthy"] = "unhealthy"
    postgres: Literal["healthy", "unhealthy"] = "unhealthy"
    queue_consumers: int = 0
    queue_messages: int = 0


class HealthResponse(BaseModel):
    status: Literal["healthy", "unhealthy"]
    services: ServiceStatus
    error: str | None = None


@router.get("/health", response_model=HealthResponse)
async def health_check():
    services = ServiceStatus()
    errors = []

    # Check RabbitMQ
    try:
        credentials = pika.PlainCredentials(
            username=settings.RABBITMQ_USER, password=settings.RABBITMQ_PASS
        )
        parameters = pika.ConnectionParameters(
            host=settings.RABBITMQ_HOST,
            port=settings.RABBITMQ_PORT,
            credentials=credentials,
        )
        connection = pika.BlockingConnection(parameters)
        channel = connection.channel()
        
        # Get queue information
        queue_info = channel.queue_declare(queue='data_generation_tasks', passive=True)
        services.queue_messages = queue_info.method.message_count
        services.queue_consumers = queue_info.method.consumer_count
        
        connection.close()
        services.rabbitmq = "healthy"
    except Exception as e:
        errors.append(f"RabbitMQ: {str(e)}")

    # Check PostgreSQL
    try:
        @retry(
            stop=stop_after_attempt(settings.MAX_RETRIES),
            wait=wait_exponential(multiplier=1, min=4, max=10),
            reraise=True
        )
        def check_db_connection():
            with pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")

        check_db_connection()
        services.postgres = "healthy"
    except Exception as e:
        errors.append(f"PostgreSQL: {str(e)}")

    # Determine overall status
    overall_status = (
        "healthy"
        if all(
            getattr(services, service) == "healthy"
            for service in ["api", "rabbitmq", "postgres"]
        )
        else "unhealthy"
    )

    if overall_status == "unhealthy":
        raise HTTPException(
            status_code=503,
            detail=HealthResponse(
                status=overall_status, services=services, error=" | ".join(errors)
            ).model_dump(),
        )

    return HealthResponse(status=overall_status, services=services)
