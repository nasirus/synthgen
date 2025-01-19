from fastapi import APIRouter, HTTPException
import pika
from sqlalchemy import create_engine, text
from core.config import settings
from pydantic import BaseModel
from typing import Literal

router = APIRouter()
USE_API_PREFIX = False  # This will keep the health check at /health


class ServiceStatus(BaseModel):
    api: Literal["healthy", "unhealthy"] = "healthy"
    rabbitmq: Literal["healthy", "unhealthy"] = "unhealthy"
    postgres: Literal["healthy", "unhealthy"] = "unhealthy"


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
        connection.close()
        services.rabbitmq = "healthy"
    except Exception as e:
        errors.append(f"RabbitMQ: {str(e)}")

    # Check PostgreSQL
    try:
        db_url = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
        engine = create_engine(db_url)
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
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
