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
    min_size=5,
    max_size=100,
    timeout=60,
    max_lifetime=3600,
    max_idle=300
)

def get_db() -> Generator[psycopg.Connection, None, None]:
    """Get a database connection from the pool"""
    with pool.connection() as conn:
        try:
            yield conn
        except Exception as e:
            logger.error(f"Database error: {str(e)}")
            raise
