from elasticsearch import AsyncElasticsearch
from core.config import settings
import logging
from schemas.task_status import TaskStatus
import datetime
from typing import Dict, Any

logger = logging.getLogger(__name__)


class ElasticsearchClient:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ElasticsearchClient, cls).__new__(cls)
            cls._instance.client = AsyncElasticsearch(
                hosts=[
                    f"http://{settings.ELASTICSEARCH_HOST}:{settings.ELASTICSEARCH_PORT}"
                ],
                basic_auth=(
                    settings.ELASTICSEARCH_USER,
                    settings.ELASTICSEARCH_PASSWORD,
                ),
            )
        return cls._instance

    async def create_index_if_not_exists(self):
        try:
            index_name = "events"
            if not await self.client.indices.exists(index=index_name):
                mapping = {
                    "settings": {
                        "number_of_replicas": 0,
                        "number_of_shards": 1,
                        "refresh_interval": "5s",
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
                            "cached": {"type": "boolean"},
                            "attempt": {"type": "integer"},
                            "dataset": {"type": "keyword"},
                            "source": {"type": "object"},
                            "completions": {"type": "object"},
                        }
                    },
                }
                await self.client.indices.create(index=index_name, body=mapping)
                logger.info(f"Created index {index_name}")
        except Exception as e:
            logger.error(f"Error creating Elasticsearch index: {str(e)}")
            raise

    async def close(self):
        await self.client.close()

    async def get_batch_stats(self, batch_id: str) -> Dict[str, Any]:
        """Get statistics for a specific batch."""
        query = {
            "size": 0,
            "query": {"term": {"batch_id": batch_id}},
            "aggs": {
                "batch_stats": {
                    "filter": {"term": {"cached": False}},
                    "aggs": {
                        "stats": {"stats": {"field": "completions.usage.total_tokens"}}
                    },
                },
                "prompt_stats": {
                    "filter": {"term": {"cached": False}},
                    "aggs": {
                        "stats": {"stats": {"field": "completions.usage.prompt_tokens"}}
                    },
                },
                "completion_stats": {
                    "filter": {"term": {"cached": False}},
                    "aggs": {
                        "stats": {
                            "stats": {"field": "completions.usage.completion_tokens"}
                        }
                    },
                },
                "status_counts": {"terms": {"field": "status"}},
                "cached_count": {"filter": {"term": {"cached": True}}},
                "time_stats": {"min": {"field": "created_at"}},
                "started_stats": {"min": {"field": "started_at"}},
                "completed_stats": {"max": {"field": "completed_at"}},
                "total_tasks": {"value_count": {"field": "message_id"}},
            },
        }

        result = await self.client.search(index="events", body=query)

        if result["hits"]["total"]["value"] == 0:
            return None

        return self._process_batch_stats(result, batch_id)

    async def list_batches(self) -> Dict[str, Any]:
        """Get paginated list of all batches with their statistics."""
        query = {
            "size": 0,
            "aggs": {
                "unique_batches": {
                    "terms": {
                        "field": "batch_id",
                        "size": 10000,  # Get all batches first
                        "order": {"latest_created": "desc"},
                    },
                    "aggs": {
                        "latest_created": {"max": {"field": "created_at"}},
                        "batch_stats": {
                            "filter": {"term": {"cached": False}},
                            "aggs": {
                                "tokens": {
                                    "stats": {"field": "completions.usage.total_tokens"}
                                }
                            },
                        },
                        "prompt_stats": {
                            "filter": {"term": {"cached": False}},
                            "aggs": {
                                "tokens": {
                                    "stats": {
                                        "field": "completions.usage.prompt_tokens"
                                    }
                                }
                            },
                        },
                        "completion_stats": {
                            "filter": {"term": {"cached": False}},
                            "aggs": {
                                "tokens": {
                                    "stats": {
                                        "field": "completions.usage.completion_tokens"
                                    }
                                }
                            },
                        },
                        "status_counts": {"terms": {"field": "status"}},
                        "cached_count": {"filter": {"term": {"cached": True}}},
                        "time_stats": {"min": {"field": "created_at"}},
                        "started_stats": {"min": {"field": "started_at"}},
                        "completed_stats": {"max": {"field": "completed_at"}},
                    },
                }
            },
        }

        result = await self.client.search(index="events", body=query)
        return self._process_batch_list(result)

    def _process_hits(self, hits: list) -> list:
        """Helper method to process Elasticsearch hits into task dicts."""
        tasks = []
        for hit in hits:
            source = hit["_source"]
            tasks.append(
                {
                    "message_id": source["message_id"],
                    "batch_id": source["batch_id"],
                    "status": source["status"],
                    "cached": source.get("cached", False),
                    "body": source.get("body", {}),
                    "result": source.get("result", {}),
                    "created_at": source.get("created_at"),
                    "started_at": source.get("started_at"),
                    "completed_at": source.get("completed_at"),
                    "duration": source.get("duration"),
                    "completions": source.get("completions", {}),
                    "dataset": source.get("dataset"),
                    "source": source.get("source"),
                }
            )
        return tasks

    async def get_batch_tasks(self, batch_id: str, task_status: TaskStatus = None):
        """
        Stream tasks for a specific batch using the scroll API.
        Yields each chunk (a dict containing a list of tasks and total count) as soon as it is received.
        """
        conditions = [{"term": {"batch_id": batch_id}}]
        if task_status:
            conditions.append({"term": {"status": task_status.value}})

        query = {
            "query": {
                "bool": {
                    "must": conditions
                }
            },
            "sort": [{"created_at": "desc"}],
            "size": 10000,  # Number of documents per scroll
        }
        
        print(query)

        # Initialize scroll
        result = await self.client.search(
            index="events",
            body=query,
            scroll="60m",  # Keep scroll context alive for 60 minutes
        )

        total_documents = result["hits"]["total"]["value"]
        scroll_id = result.get("_scroll_id")

        # Process and yield the first chunk of tasks
        tasks_chunk = self._process_hits(result["hits"]["hits"])
        yield {"tasks": tasks_chunk, "total": total_documents}

        try:
            # Continue scrolling until no more hits found
            while True:
                result = await self.client.scroll(scroll_id=scroll_id, scroll="2m")
                scroll_id = result.get("_scroll_id")
                hits = result["hits"]["hits"]
                if not hits:
                    break
                tasks_chunk = self._process_hits(hits)
                yield {"tasks": tasks_chunk, "total": total_documents}
        finally:
            # Always try to clear the scroll context to free resources
            try:
                await self.client.clear_scroll(scroll_id=scroll_id)
            except Exception as e:
                logger.warning(f"Failed to clear scroll context: {e}")

    async def get_batch_tasks_with_pagination(
        self,
        batch_id: str,
        task_status: TaskStatus,
        page: int = 1,
        page_size: int = 100,
    ):
        """
        Export tasks for a specific batch. if task_status is not provided, all tasks are exported.
        """

        query = {
            "query": {
                "bool": {
                    "must": [
                        {"term": {"batch_id": batch_id}},
                        # Only add status filter if task_status is provided
                        (
                            {"term": {"status": task_status.value}}
                            if task_status
                            else None
                        ),
                    ]
                }
            },
            "sort": [{"completed_at": "desc"}],
            "size": 10000,  # Max size for elasticsearch
        }

        result = await self.client.search(
            index="events",
            body=query,
        )

        total_documents = result["hits"]["total"]["value"]

        tasks_chunk = self._process_hits(result["hits"]["hits"])
        tasks_chunk = tasks_chunk[page_size * (page - 1) : page_size * page]
        return {
            "total": total_documents,
            "page": page,
            "page_size": page_size,
            "tasks": tasks_chunk,
        }

    def _process_batch_stats(
        self, result: Dict[str, Any], batch_id: str
    ) -> Dict[str, Any]:
        """Process raw Elasticsearch response for batch statistics."""
        aggs = result["aggregations"]
        status_buckets = {
            bucket["key"]: bucket["doc_count"]
            for bucket in aggs["status_counts"]["buckets"]
        }

        completed_count = status_buckets.get("COMPLETED", 0)
        failed_count = status_buckets.get("FAILED", 0)
        processing_count = status_buckets.get("PROCESSING", 0)
        total_count = aggs["total_tasks"]["value"]
        pending_count = total_count - (
            completed_count + failed_count + processing_count
        )

        # Calculate duration
        created_at = (
            aggs["time_stats"].get("value_as_string")
            if aggs["time_stats"].get("value") is not None
            else None
        )
        completed_at = (
            aggs["completed_stats"].get("value_as_string")
            if aggs["completed_stats"].get("value") is not None
            else None
        )

        started_at = (
            aggs["started_stats"].get("value_as_string")
            if aggs["started_stats"].get("value") is not None
            else None
        )

        duration = None
        if created_at and completed_at:
            created_dt = datetime.datetime.fromisoformat(created_at)
            completed_dt = datetime.datetime.fromisoformat(completed_at)
            duration = int((completed_dt - created_dt).total_seconds())

        return {
            "batch_id": batch_id,
            "created_at": created_at,
            "started_at": started_at,
            "completed_at": completed_at,
            "duration": duration,
            "total_count": total_count,
            "completed_count": completed_count - aggs["cached_count"]["doc_count"],
            "failed_count": failed_count,
            "pending_count": pending_count,
            "processing_count": processing_count,
            "cached_count": aggs["cached_count"]["doc_count"],
            "total_tokens": aggs["batch_stats"]["stats"]["sum"] or 0,
            "prompt_tokens": aggs["prompt_stats"]["stats"]["sum"] or 0,
            "completion_tokens": aggs["completion_stats"]["stats"]["sum"] or 0,
        }

    def _process_batch_list(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """Process raw Elasticsearch response for batch list."""
        aggs = result["aggregations"]
        all_batches = aggs["unique_batches"]["buckets"]

        total_batches = len(all_batches)

        batches = []
        for bucket in all_batches:
            batch_id = bucket["key"]
            status_buckets = {
                b["key"]: b["doc_count"] for b in bucket["status_counts"]["buckets"]
            }

            completed_count = status_buckets.get("COMPLETED", 0)
            failed_count = status_buckets.get("FAILED", 0)
            processing_count = status_buckets.get("PROCESSING", 0)
            total_count = bucket["doc_count"]
            pending_count = total_count - (
                completed_count + failed_count + processing_count
            )

            # Calculate batch status
            batch_status = (
                TaskStatus.PROCESSING
                if processing_count > 0
                else (
                    TaskStatus.PENDING
                    if pending_count > 0
                    else (
                        TaskStatus.FAILED if failed_count > 0 else TaskStatus.COMPLETED
                    )
                )
            )

            # Calculate duration
            created_at = bucket["time_stats"].get("value_as_string")
            completed_at = (
                bucket["completed_stats"].get("value_as_string")
                if bucket["completed_stats"].get("value") is not None
                else None
            )
            started_at = (
                bucket["started_stats"].get("value_as_string")
                if bucket["started_stats"].get("value") is not None
                else None
            )

            duration = None
            if created_at and completed_at:
                created_dt = datetime.datetime.fromisoformat(created_at)
                completed_dt = datetime.datetime.fromisoformat(completed_at)
                duration = int((completed_dt - created_dt).total_seconds())

            batches.append(
                {
                    "batch_id": batch_id,
                    "batch_status": batch_status,
                    "created_at": created_at,
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration": duration,
                    "total_tasks": total_count,
                    "completed_tasks": completed_count
                    - bucket["cached_count"]["doc_count"],
                    "failed_tasks": failed_count,
                    "pending_tasks": pending_count,
                    "processing_tasks": processing_count,
                    "cached_tasks": bucket["cached_count"]["doc_count"],
                    "total_tokens": bucket["batch_stats"]["tokens"]["sum"] or 0,
                    "prompt_tokens": bucket["prompt_stats"]["tokens"]["sum"] or 0,
                    "completion_tokens": bucket["completion_stats"]["tokens"]["sum"]
                    or 0,
                }
            )

        return {
            "batches": batches,
            "total": total_batches,
        }

    async def get_task_by_message_id(self, message_id: str) -> Dict[str, Any]:
        """
        Retrieve a task document by its message_id.
        Returns the document's _source data if found, otherwise None.
        """
        query = {"query": {"term": {"message_id": message_id}}}
        result = await self.client.search(index="events", body=query)
        total_hits = (
            result["hits"]["total"]["value"]
            if isinstance(result["hits"]["total"], dict)
            else result["hits"]["total"]
        )
        if total_hits == 0:
            return None
        return result["hits"]["hits"][0]["_source"]

    async def count_pending_tasks_before(self, created_at: str) -> int:
        """
        Count the number of pending tasks created at or before the given timestamp.
        Used for computing a task's queue position.
        """
        query = {
            "query": {
                "bool": {
                    "must": [
                        {"term": {"status": TaskStatus.PENDING.value}},
                        {"range": {"created_at": {"lte": created_at}}},
                    ]
                }
            }
        }
        result = await self.client.count(index="events", body=query)
        return result.get("count", 0)

    async def delete_task_by_message_id(self, message_id: str) -> int:
        """
        Delete a task document by its message_id.
        Returns the number of documents deleted.
        """
        query = {"query": {"term": {"message_id": message_id}}}
        result = await self.client.delete_by_query(
            index="events", body=query, refresh=True
        )
        return result.get("deleted", 0)

    async def delete_task_by_hash(self, hash: str) -> int:
        """
        Delete a task document by its hash.
        Returns the number of documents deleted.
        """
        query = {"query": {"term": {"body_hash": hash}}}
        result = await self.client.delete_by_query(
            index="events", body=query, refresh=True
        )
        return result.get("deleted", 0)

    async def get_batch_usage_stats(
        self, batch_id: str, time_range: str = "24h", interval: str = "1h"
    ) -> Dict[str, Any]:
        """
        Get usage statistics over specified time range bucketed by intervals.

        Args:
            time_range: Time range to analyze (e.g. "24h", "7d", "30d")
            interval: Time bucket size (e.g. "1h", "1d", "1w")

        Returns:
            Dictionary with usage statistics over time
        """
        # Use timezone-aware datetime with UTC
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()

        query = {
            "size": 0,
            "query": {
                "bool": {
                    "must": [
                        {
                            "range": {
                                "completed_at": {
                                    "gte": f"now-{time_range}",
                                    "lte": "now",
                                }
                            }
                        },
                        {"term": {"batch_id": batch_id}},
                    ]
                }
            },
            "aggs": {
                "tasks_over_time": {
                    "date_histogram": {
                        "field": "completed_at",
                        "calendar_interval": interval,
                        "format": "yyyy-MM-dd HH:mm:ss",
                    },
                    "aggs": {
                        "completed_tasks": {
                            "filter": {"term": {"status": "COMPLETED"}}
                        },
                        "failed_tasks": {"filter": {"term": {"status": "FAILED"}}},
                        "cached_tasks": {"filter": {"term": {"cached": True}}},
                        "total_tokens": {
                            "sum": {"field": "completions.usage.total_tokens"}
                        },
                        "prompt_tokens": {
                            "sum": {"field": "completions.usage.prompt_tokens"}
                        },
                        "completion_tokens": {
                            "sum": {"field": "completions.usage.completion_tokens"}
                        },
                        "avg_duration": {"avg": {"field": "duration"}},
                        "sum_duration": {"sum": {"field": "duration"}},
                    },
                },
                "total_completed": {"filter": {"term": {"status": "COMPLETED"}}},
                "total_failed": {"filter": {"term": {"status": "FAILED"}}},
                "total_processing": {"filter": {"term": {"status": "PROCESSING"}}},
                "total_cached": {"filter": {"term": {"cached": True}}},
                "total_tokens_used": {
                    "sum": {"field": "completions.usage.total_tokens"}
                },
                "total_completion_tokens": {
                    "sum": {"field": "completions.usage.completion_tokens"}
                },
                "total_prompt_tokens": {
                    "sum": {"field": "completions.usage.prompt_tokens"}
                },
                "sum_duration": {
                    "filter": {"term": {"status": "COMPLETED"}},
                    "aggs": {"value": {"sum": {"field": "duration"}}},
                },
                "avg_response_time": {"avg": {"field": "duration"}},
            },
        }

        try:
            result = await self.client.search(index="events", body=query)

            buckets = result["aggregations"]["tasks_over_time"]["buckets"]
            time_series = []

            for bucket in buckets:
                # Calculate tokens per second for this time bucket
                sum_duration_ms = (
                    bucket["sum_duration"]["value"] or 1
                )  # Avoid division by zero
                sum_duration_seconds = (
                    sum_duration_ms / 1000 if sum_duration_ms > 0 else 1
                )
                completion_tokens = bucket["completion_tokens"]["value"] or 0
                tokens_per_second = (
                    completion_tokens / sum_duration_seconds
                    if sum_duration_seconds > 0
                    else 0
                )

                cached_tasks = bucket["cached_tasks"]["doc_count"]
                completed_tasks = bucket["completed_tasks"]["doc_count"]
                failed_tasks = bucket["failed_tasks"]["doc_count"]
                total_tasks = bucket["doc_count"]
                time_series.append(
                    {
                        "timestamp": bucket["key_as_string"],
                        "total_tasks": total_tasks,
                        "completed_tasks": completed_tasks - cached_tasks,
                        "failed_tasks": failed_tasks,
                        "cached_tasks": cached_tasks,
                        "total_tokens": bucket["total_tokens"]["value"] or 0,
                        "prompt_tokens": bucket["prompt_tokens"]["value"] or 0,
                        "completion_tokens": completion_tokens,
                        "avg_duration_ms": round(bucket["avg_duration"]["value"] or 0),
                        "tokens_per_second": round(tokens_per_second, 2),
                    }
                )

            # Calculate overall tokens per second for the summary
            total_duration_ms = (
                result["aggregations"]["sum_duration"]["value"]["value"] or 1
            )  # Avoid division by zero
            total_duration_seconds = (
                total_duration_ms / 1000 if total_duration_ms > 0 else 1
            )
            total_completion_tokens = (
                result["aggregations"]["total_completion_tokens"]["value"] or 0
            )
            overall_tokens_per_second = (
                total_completion_tokens / total_duration_seconds
                if total_duration_seconds > 0
                else 0
            )

            # Calculate summary statistics
            return {
                "time_range": time_range,
                "interval": interval,
                "current_time": now,
                "time_series": time_series,
                "summary": {
                    "total_tasks": result["hits"]["total"]["value"],
                    "completed_tasks": result["aggregations"]["total_completed"][
                        "doc_count"
                    ]
                    - result["aggregations"]["total_cached"]["doc_count"],
                    "failed_tasks": result["aggregations"]["total_failed"]["doc_count"],
                    "cached_tasks": result["aggregations"]["total_cached"]["doc_count"],
                    "processing_tasks": result["aggregations"]["total_processing"][
                        "doc_count"
                    ],
                    "total_prompt_tokens": result["aggregations"][
                        "total_prompt_tokens"
                    ]["value"]
                    or 0,
                    "total_completion_tokens": result["aggregations"][
                        "total_completion_tokens"
                    ]["value"]
                    or 0,
                    "total_tokens": result["aggregations"]["total_tokens_used"]["value"]
                    or 0,
                    "average_response_time": round(
                        result["aggregations"]["avg_response_time"]["value"] or 0
                    ),
                    "tokens_per_second": round(overall_tokens_per_second, 2),
                    "cache_hit_rate": round(
                        (
                            (
                                result["aggregations"]["total_cached"]["doc_count"]
                                / result["hits"]["total"]["value"]
                                * 100
                            )
                            if result["hits"]["total"]["value"] > 0
                            else 0
                        ),
                        2,
                    ),
                },
            }
        except Exception as e:
            logger.error(f"Error retrieving usage statistics: {str(e)}")
            raise

    async def get_tasks_usage_stats(self) -> Dict[str, Any]:
        """
        Get usage statistics for all tasks.
        """
        query = {
            "size": 0,
            "aggs": {
                "total_tasks": {"value_count": {"field": "message_id"}},
                "completed_tasks": {"filter": {"term": {"status": "COMPLETED"}}},
                "failed_tasks": {"filter": {"term": {"status": "FAILED"}}},
                "cached_tasks": {"filter": {"term": {"cached": True}}},
                "processing_tasks": {"filter": {"term": {"status": "PROCESSING"}}},
                "pending_tasks": {"filter": {"term": {"status": "PENDING"}}},
                "total_tokens": {"sum": {"field": "completions.usage.total_tokens"}},
                "prompt_tokens": {"sum": {"field": "completions.usage.prompt_tokens"}},
                "completion_tokens": {
                    "sum": {"field": "completions.usage.completion_tokens"}
                },
            },
        }

        result = await self.client.search(index="events", body=query)

        return result["aggregations"]


# Create a global instance
es_client = ElasticsearchClient()


def get_elasticsearch_client() -> ElasticsearchClient:
    """Get the global Elasticsearch client instance."""
    return es_client
