from elasticsearch import AsyncElasticsearch
from core.config import settings
import logging

logger = logging.getLogger(__name__)

class ElasticsearchClient:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ElasticsearchClient, cls).__new__(cls)
            cls._instance.client = AsyncElasticsearch(
                hosts=[f"http://{settings.ELASTICSEARCH_HOST}:{settings.ELASTICSEARCH_PORT}"],
                basic_auth=(settings.ELASTICSEARCH_USER, settings.ELASTICSEARCH_PASSWORD)
            )
        return cls._instance

    async def create_index_if_not_exists(self):
        try:
            index_name = "events"
            if not await self.client.indices.exists(index=index_name):
                mapping = {
                    "settings": {
                        "number_of_replicas": 0,
                        "number_of_shards": 1
                    },
                    "mappings": {
                        "properties": {
                            "batch_id": {"type": "keyword"},
                            "message_id": {"type": "keyword"},
                            "custom_id": {"type": "keyword"},
                            "method": {"type": "keyword"},
                            "url": {"type": "keyword"},
                            "body": {"type": "object"},
                            "body_hash": {"type": "keyword"},
                            "result": {"type": "object"},
                            "status": {"type": "keyword"},
                            "created_at": {"type": "date"},
                            "started_at": {"type": "date"},
                            "completed_at": {"type": "date"},
                            "duration": {"type": "integer"},
                            "prompt_tokens": {"type": "integer"},
                            "completion_tokens": {"type": "integer"},
                            "total_tokens": {"type": "integer"},
                            "cached": {"type": "boolean"},
                            "attempt": {"type": "integer"},
                            "dataset": {"type": "keyword"},
                            "source": {"type": "object"}
                        }
                    }
                }
                await self.client.indices.create(index=index_name, body=mapping)
                logger.info(f"Created index {index_name}")
        except Exception as e:
            logger.error(f"Error creating Elasticsearch index: {str(e)}")
            raise

    async def close(self):
        await self.client.close()

# Create a global instance
es_client = ElasticsearchClient()

def get_elasticsearch_client():
    """Get the global Elasticsearch client instance."""
    return es_client.client 