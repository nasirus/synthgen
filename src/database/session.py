import psycopg
from psycopg_pool import ConnectionPool
from core.config import settings
from typing import Generator
import logging
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

DATABASE_URL = (
    f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
    f"@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
)

# Create a connection pool with more conservative settings
pool = ConnectionPool(
    DATABASE_URL,
    min_size=2,  # Reduced from 5
    max_size=20,  # Reduced from 100
    timeout=30,  # Reduced from 60
    max_lifetime=1800,  # Reduced from 3600
    max_idle=150,  # Reduced from 300
    kwargs={"keepalives": 1, "keepalives_idle": 30},  # Add keepalive settings
)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
def get_db() -> Generator[psycopg.Connection, None, None]:
    """Get a database connection from the pool with retry mechanism"""
    try:
        with pool.connection() as conn:
            yield conn
    except psycopg.pool.PoolTimeout:
        logger.error("Connection pool timeout - too many clients")
        raise
    except Exception as e:
        logger.error(f"Database error: {str(e)}")
        raise
