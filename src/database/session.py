import psycopg
from psycopg_pool import ConnectionPool
from core.config import settings
from typing import Generator
import logging

logger = logging.getLogger(__name__)

DATABASE_URL = (
    f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
    f"@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
)

# Create a connection pool
pool = ConnectionPool(
    DATABASE_URL,
    min_size=1,
    max_size=20,
    timeout=30,
    max_lifetime=1800,
    max_idle=10
)

def get_db() -> Generator[psycopg.Connection, None, None]:
    """Get a database connection from the pool"""
    try:
        with pool.connection() as conn:
            yield conn
    except psycopg.pool.PoolTimeout:
        logger.error("Connection pool timeout - too many clients")
        raise
    except Exception as e:
        logger.error(f"Database error: {str(e)}")
        raise
