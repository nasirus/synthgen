use chrono::{DateTime, Utc};
use serde_json::Value;
use tokio_postgres::types::Json;
use tokio_postgres::{Client, Error as PostgresError, NoTls};
use uuid::Uuid;
use std::sync::Arc;

use crate::schemas::llm_response::{LLMResponse, Usage};
use crate::schemas::task_status::TaskStatus;

pub struct DatabaseClient {
    client: Arc<Client>,
}

impl DatabaseClient {
    pub async fn new(connection_string: &str) -> Result<Self, PostgresError> {
        let (client, connection) = tokio_postgres::connect(connection_string, NoTls).await?;

        // Spawn the connection handler
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("connection error: {}", e);
            }
        });

        Ok(DatabaseClient { 
            client: Arc::new(client) 
        })
    }

    pub async fn insert_error(
        &self,
        batch_id: Option<String>,
        payload: Value,
        error: &str,
        started_at: DateTime<Utc>,
    ) -> Result<(), PostgresError> {
        let message_id = Uuid::new_v4().to_string();
        let completed_at = Utc::now();
        let duration = completed_at
            .signed_duration_since(started_at)
            .num_milliseconds() as i32;

        self.client
            .execute(
                "INSERT INTO events (
                batch_id, message_id, status, payload, result, 
                started_at, completed_at, duration,
                cached
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
                &[
                    &batch_id,
                    &message_id,
                    &TaskStatus::Failed.as_str(),
                    &Json(payload),
                    &Json(serde_json::json!({
                        "error": error,
                    })),
                    &started_at,
                    &completed_at,
                    &duration,
                    &false,
                ],
            )
            .await?;

        Ok(())
    }

    pub async fn update_event_status(
        &self,
        message_id: String,
        status: TaskStatus,
        llm_response: &LLMResponse,
        started_at: DateTime<Utc>,
    ) -> Result<(), PostgresError> {
        let completed_at = Utc::now();
        let duration = completed_at
            .signed_duration_since(started_at)
            .num_milliseconds() as i32;

        if status == TaskStatus::Processing {
            self.client
                .execute(
                    "UPDATE events SET started_at = $1, status = $2 WHERE message_id = $3",
                    &[&started_at, &status.as_str(), &message_id],
                )
                .await?;
        } else if status == TaskStatus::Completed || status == TaskStatus::Failed {
            self.client
                .execute(
                    "UPDATE events 
                SET completed_at = $1, 
                status = $2, 
                duration = $3, 
                result = $4, 
                prompt_tokens = $5, 
                completion_tokens = $6, 
                total_tokens = $7,
                cached = $8
                WHERE message_id = $9",
                    &[
                        &completed_at,
                        &status.as_str(),
                        &duration,
                        &Json(serde_json::json!({
                            "completion": llm_response.content,
                        })),
                        &(llm_response.usage.prompt_tokens as i32),
                        &(llm_response.usage.completion_tokens as i32),
                        &(llm_response.usage.total_tokens as i32),
                        &llm_response.cached,
                        &message_id,
                    ],
                )
                .await?;
        }

        Ok(())
    }

    pub async fn get_cached_completion(
        &self,
        payload: &Value,
    ) -> Result<Option<LLMResponse>, PostgresError> {
        let row = self
            .client
            .query_opt(
                "SELECT result FROM events WHERE status = $1 AND payload = $2 LIMIT 1",
                &[&TaskStatus::Completed.as_str(), &Json(payload)],
            )
            .await?;

        if let Some(row) = row {
            let result: Json<Value> = row.get(0);
            let completion = result.0["completion"]
                .as_str()
                .unwrap_or_default()
                .to_string();

            let llm_response = LLMResponse {
                content: completion,
                usage: Usage {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0,
                },
                cached: true,
            };

            Ok(Some(llm_response))
        } else {
            Ok(None)
        }
    }
}

impl Clone for DatabaseClient {
    fn clone(&self) -> Self {
        DatabaseClient {
            client: self.client.clone()
        }
    }
}
