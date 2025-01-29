use chrono::{DateTime, Utc};
use tokio_postgres::{Client, Error as PostgresError, NoTls};
use tokio_postgres::types::Json;
use serde_json::Value;
use uuid::Uuid;

use crate::llm_wrapper::LLMResponse;
use crate::task_status::TaskStatus;

pub struct DatabaseClient {
    client: Client,
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
        
        Ok(DatabaseClient { client })
    }

    pub async fn insert_llm_response(
        &self,
        batch_id: Option<String>,
        payload: Value,
        llm_response: &LLMResponse,
        started_at: DateTime<Utc>,
    ) -> Result<(), PostgresError> {
        let message_id = Uuid::new_v4().to_string();
        let completed_at = Utc::now();
        let duration = completed_at
            .signed_duration_since(started_at)
            .num_milliseconds() as i32;

        self.client.execute(
            "INSERT INTO events (
                batch_id, message_id, status, payload, result, 
                started_at, completed_at, duration,
                prompt_tokens, completion_tokens, total_tokens, cached
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
            &[
                &batch_id,
                &message_id,
                &TaskStatus::Completed.as_str(),
                &Json(payload),
                &Json(serde_json::json!({
                    "content": llm_response.content,
                })),
                &started_at,
                &completed_at,
                &duration,
                &(llm_response.usage.prompt_tokens as i32),
                &(llm_response.usage.completion_tokens as i32),
                &(llm_response.usage.total_tokens as i32),
                &false,
            ],
        ).await?;

        Ok(())
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

        self.client.execute(
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
        ).await?;

        Ok(())
    }
} 