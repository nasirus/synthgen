import psycopg
from psycopg_pool import ConnectionPool, AsyncConnectionPool
from core.config import settings
from typing import Generator
import logging
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

DATABASE_URL = (
    f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
    f"@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
)

# Create a synchronous connection pool
pool = ConnectionPool(
    DATABASE_URL,
    min_size=1,
    max_size=20,
    timeout=30,
    max_lifetime=1800,
    max_idle=10
)

# Initialize async pool as None
async_pool = None

async def init_async_pool():
    """Initialize the global async connection pool."""
    global async_pool
    if async_pool is None:
        # Use open=False to delay opening the pool until after construction.
        pool_async = AsyncConnectionPool(
            DATABASE_URL,
            min_size=1,
            max_size=20,
            timeout=30,
            max_lifetime=1800,
            max_idle=10,
            open=False
        )
        await pool_async.open()
        async_pool = pool_async
    return async_pool

async def close_async_pool():
    """Close the global async connection pool."""
    global async_pool
    if async_pool is not None:
        await async_pool.close()
        async_pool = None

@asynccontextmanager
async def get_async_db():
    """Get an async database connection from the pool"""
    global async_pool
    if async_pool is None:
        await init_async_pool()
    
    try:
        async with async_pool.connection() as conn:
            yield conn
    except psycopg.errors.PoolTimeout:
        logger.error("Async connection pool timeout - too many clients")
        raise
    except Exception as e:
        logger.error(f"Async database error: {str(e)}")
        raise

def get_db() -> Generator[psycopg.Connection, None, None]:
    """Get a database connection from the pool"""
    try:
        with pool.connection() as conn:
            yield conn
    except psycopg.errors.PoolTimeout:
        logger.error("Connection pool timeout - too many clients")
        raise
    except Exception as e:
        logger.error(f"Database error: {str(e)}")
        raise
