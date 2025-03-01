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
    RETRY_ATTEMPTS: int = int(os.getenv("RETRY_ATTEMPTS", 3))

    # Chunk size for bulk inserts
    CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", 1000))

    # MINIO Settings
    MINIO_HOST: str = os.getenv("MINIO_HOST", "localhost")
    MINIO_PORT: int = int(os.getenv("MINIO_PORT", 9000))
    MINIO_HOST_URL: str = f"http://{MINIO_HOST}:{MINIO_PORT}"
    MINIO_ROOT_USER: str = os.getenv("MINIO_ROOT_USER", "minioadmin")
    MINIO_ROOT_PASSWORD: str = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin")
    MINIO_BUCKET_NAME: str = os.getenv("MINIO_BUCKET_NAME", "synthetic-data-generator")

    # Elasticsearch Settings
    ELASTICSEARCH_HOST: str = os.getenv("ELASTICSEARCH_HOST", "localhost")
    ELASTICSEARCH_PORT: int = int(os.getenv("ELASTICSEARCH_PORT", 9200))
    ELASTICSEARCH_USER: str = os.getenv("ELASTICSEARCH_USER", "elastic")
    ELASTICSEARCH_PASSWORD: str = os.getenv("ELASTICSEARCH_PASSWORD", "changeme")

    # API Secret Key
    API_SECRET_KEY: str = os.getenv("API_SECRET_KEY", "your-secret-key")


settings = Settings()
