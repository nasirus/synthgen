use crate::schemas::llm_response::LLMResponse;
use crate::schemas::task_status::TaskStatus;
use crate::settings::DatabaseSettings;
use chrono::{DateTime, Utc};
use elasticsearch::{
    http::transport::Transport, params::Refresh, Elasticsearch, SearchParts, UpdateParts,
};
use serde_json::{json, Value};

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
                "cached": llm_response.cached,
                "attempt": llm_response.attempt,
                "completions": llm_response.completions
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
        body_hash: String,
    ) -> Result<Option<LLMResponse>, Box<dyn std::error::Error + Send + Sync>> {
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
            if let Some(completions) = hit["_source"]["completions"].as_object() {
                return Ok(Some(LLMResponse {
                    completions: Value::Object(completions.clone()),
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
