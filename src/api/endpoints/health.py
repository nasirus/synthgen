from fastapi import APIRouter, HTTPException
import pika
from core.config import settings
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential
from schemas.health_status import HealthStatus
from database.elastic_session import get_elasticsearch_client

router = APIRouter()
USE_API_PREFIX = False  # This will keep the health check at /health


class ServiceStatus(BaseModel):
    api: HealthStatus = HealthStatus.HEALTHY
    rabbitmq: HealthStatus = HealthStatus.UNHEALTHY
    elasticsearch: HealthStatus = HealthStatus.UNHEALTHY
    queue_consumers: int = 0
    queue_messages: int = 0


class HealthResponse(BaseModel):
    status: HealthStatus
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
        queue_info = channel.queue_declare(queue="data_generation_tasks", passive=True)
        services.queue_messages = queue_info.method.message_count
        services.queue_consumers = queue_info.method.consumer_count

        connection.close()
        services.rabbitmq = HealthStatus.HEALTHY
    except Exception as e:
        errors.append(f"RabbitMQ: {str(e)}")

    # Check Elasticsearch
    try:
        @retry(
            stop=stop_after_attempt(settings.MAX_RETRIES),
            wait=wait_exponential(multiplier=1, min=4, max=10),
            reraise=True,
        )
        async def check_db_connection():
            es_client = get_elasticsearch_client()
            # Use the ping method to check ES health
            if not await es_client.client.ping():
                raise Exception("Elasticsearch cluster did not respond to ping")

        await check_db_connection()
        services.elasticsearch = HealthStatus.HEALTHY
    except Exception as e:
        errors.append(f"Elasticsearch: {str(e)}")

    # Determine overall status
    overall_status = (
        HealthStatus.HEALTHY
        if all(
            getattr(services, service) == HealthStatus.HEALTHY
            for service in ["api", "rabbitmq", "elasticsearch"]
        )
        else HealthStatus.UNHEALTHY
    )

    if overall_status == HealthStatus.UNHEALTHY:
        raise HTTPException(
            status_code=503,
            detail=HealthResponse(
                status=overall_status, services=services, error=" | ".join(errors)
            ).model_dump(),
        )

    return HealthResponse(status=overall_status, services=services)
