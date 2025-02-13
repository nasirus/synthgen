import logging
from database.session import get_async_db

logger = logging.getLogger(__name__)


async def bulk_insert_events(rows_to_copy: list) -> None:
    """Helper function to perform bulk insert of events using COPY."""
    async for db in get_async_db():
        async with db.cursor() as cur:
            copy_sql = """
                COPY events (message_id, batch_id, created_at, status, custom_id, method, url, body, dataset, source)
                FROM STDIN
            """
            async with cur.copy(copy_sql) as copy:
                for row in rows_to_copy:
                    await copy.write_row(row)
            await db.commit()
