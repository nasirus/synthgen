use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{DateTime, Utc};
use elasticsearch::{
    http::transport::Transport, params::Refresh, Elasticsearch, SearchParts, UpdateParts,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::schemas::llm_response::{LLMResponse, Usage};
use crate::schemas::task_status::TaskStatus;
use crate::settings::DatabaseSettings;

pub struct DatabaseClient {
    client: Elasticsearch,
}

impl DatabaseClient {
    pub async fn new(
        db_settings: &DatabaseSettings,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let transport = Transport::single_node(&format!(
            "http://{}:{}@{}:{}",
            db_settings.user, db_settings.password, db_settings.host, db_settings.port
        ))?;

        let client = Elasticsearch::new(transport);

        Ok(DatabaseClient { client })
    }

    fn calculate_body_hash(&self, body: &Value) -> String {
        let mut hasher = Sha256::new();
        let json_str = serde_json::to_string(body).unwrap();
        hasher.update(json_str.as_bytes());
        STANDARD.encode(hasher.finalize())
    }

    pub async fn update_event_status(
        &self,
        message_id: String,
        status: TaskStatus,
        llm_response: &LLMResponse,
        started_at: DateTime<Utc>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let completed_at = Utc::now();
        let duration = completed_at
            .signed_duration_since(started_at)
            .num_milliseconds() as i32;

        let doc = json!({
            "doc": {
                "completed_at": completed_at,
                "started_at": started_at,
                "status": status.as_str(),
                "duration": duration,
                "result": {
                    "completion": llm_response.content
                },
                "prompt_tokens": llm_response.usage.prompt_tokens,
                "completion_tokens": llm_response.usage.completion_tokens,
                "total_tokens": llm_response.usage.total_tokens,
                "cached": llm_response.cached,
                "attempt": llm_response.attempt
            }
        });

        let response = self
            .client
            .update(UpdateParts::IndexId("events", &message_id))
            .body(doc)
            .refresh(Refresh::False)
            .send()
            .await?;

        if let Some(exception) = response.exception().await? {
            return Err(format!("Failed to update document: {:?}", exception).into());
        }
        Ok(())
    }

    pub async fn get_cached_completion(
        &self,
        body: &Value,
    ) -> Result<Option<LLMResponse>, Box<dyn std::error::Error + Send + Sync>> {
        let body_hash = self.calculate_body_hash(body);

        let query = json!({
            "query": {
                "bool": {
                    "must": [
                        { "term": { "status": TaskStatus::Completed.as_str() }},
                        { "term": { "body_hash": body_hash }}
                    ]
                }
            },
            "size": 1,
            "_source": ["result"]
        });

        let response = self
            .client
            .search(SearchParts::Index(&["events"]))
            .body(query)
            .send()
            .await?;

        let response_body = response.json::<Value>().await?;

        if let Some(hit) = response_body["hits"]["hits"]
            .as_array()
            .and_then(|hits| hits.first())
        {
            if let Some(completion) = hit["_source"]["result"]["completion"].as_str() {
                return Ok(Some(LLMResponse {
                    content: completion.to_string(),
                    usage: Usage {
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        total_tokens: 0,
                    },
                    cached: true,
                    attempt: 0,
                }));
            }
        }

        Ok(None)
    }
}

impl Clone for DatabaseClient {
    fn clone(&self) -> Self {
        DatabaseClient {
            client: self.client.clone(),
        }
    }
}
