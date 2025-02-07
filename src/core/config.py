import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class Settings:
    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Synthetic Data Generator API"
    VERSION: str = "1.0.0"

    # RabbitMQ Settings
    RABBITMQ_USER: str = os.getenv("RABBITMQ_USER", "guest")
    RABBITMQ_PASS: str = os.getenv("RABBITMQ_PASS", "guest")
    RABBITMQ_HOST: str = os.getenv("RABBITMQ_HOST", "localhost")
    RABBITMQ_PORT: int = int(os.getenv("RABBITMQ_PORT", 5672))

    # Postgres Database Settings
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgres")
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: int = int(os.getenv("POSTGRES_PORT", 5432))
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "synthetic_data_generator")

    # OpenAI API Settings
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # Maximum number of parallel tasks
    MAX_PARALLEL_TASKS: int = int(os.getenv("MAX_PARALLEL_TASKS", 200))

    # Maximum number of retries
    MAX_RETRIES: int = int(os.getenv("MAX_RETRIES", 3))

    # LLM timeout
    LLM_TIMEOUT: int = int(os.getenv("LLM_TIMEOUT", 300))

    # Chunk size for bulk inserts
    CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", 1000))

    # S3 Settings
    S3_ENDPOINT: str = os.getenv("S3_ENDPOINT", "http://minio:9000")
    S3_ACCESS_KEY: str = os.getenv("S3_ACCESS_KEY", "minioadmin")
    S3_SECRET_KEY: str = os.getenv("S3_SECRET_KEY", "minioadmin")

    S3_BUCKET_NAME: str = os.getenv("S3_BUCKET_NAME", "synthetic-data-generator")


settings = Settings()
