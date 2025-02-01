use chrono::{DateTime, Utc};
use serde_json::Value;
use tokio_postgres;
use tokio_postgres::types::Json;
use uuid::Uuid;

use deadpool_postgres::tokio_postgres::NoTls;
use deadpool_postgres::{Config as PoolConfig, ManagerConfig, Pool, RecyclingMethod};

use crate::schemas::llm_response::{LLMResponse, Usage};
use crate::schemas::task_status::TaskStatus;
use crate::settings::DatabaseSettings;

pub struct DatabaseClient {
    pool: Pool,
}

impl DatabaseClient {
    /// Creates a new DatabaseClient with a connection pool from deadpool-postgres.
    pub async fn new(
        db_settings: &DatabaseSettings,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let pool_config = PoolConfig {
            host: Some(db_settings.host.clone()),
            port: Some(db_settings.port),
            user: Some(db_settings.user.clone()),
            password: Some(db_settings.password.clone()),
            dbname: Some(db_settings.dbname.clone()),
            pool: Some(deadpool::managed::PoolConfig {
                max_size: 2,
                timeouts: deadpool::managed::Timeouts {
                    wait: Some(std::time::Duration::from_secs(10)),
                    create: Some(std::time::Duration::from_secs(10)),
                    recycle: Some(std::time::Duration::from_secs(10)),
                },
                ..Default::default()
            }),
            manager: Some(ManagerConfig {
                recycling_method: RecyclingMethod::Fast,
            }),
            ..Default::default()
        };

        let pool = pool_config.create_pool(Some(deadpool_postgres::Runtime::Tokio1), NoTls)?;
        Ok(DatabaseClient { pool })
    }

    /// Inserts an error event into the database.
    pub async fn insert_error(
        &self,
        batch_id: Option<String>,
        payload: Value,
        error: &str,
        started_at: DateTime<Utc>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let message_id = Uuid::new_v4().to_string();
        let completed_at = Utc::now();
        let duration = completed_at
            .signed_duration_since(started_at)
            .num_milliseconds() as i32;

        let client = self.pool.get().await?;
        client
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

    /// Updates the event status based on the stage of the request.
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

        let client = self.pool.get().await?;
        if status == TaskStatus::Processing {
            client
                .execute(
                    "UPDATE events SET started_at = $1, status = $2 WHERE message_id = $3",
                    &[&started_at, &status.as_str(), &message_id],
                )
                .await?;
        } else if status == TaskStatus::Completed || status == TaskStatus::Failed {
            client
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

    /// Attempts to retrieve a cached LLMResponse from the database based on the payload.
    pub async fn get_cached_completion(
        &self,
        body: &Value,
    ) -> Result<Option<LLMResponse>, Box<dyn std::error::Error + Send + Sync>> {
        let client = self.pool.get().await?;
        let row = client
            .query_opt(
                "SELECT result FROM events WHERE status = $1 AND body = $2 LIMIT 1",
                &[&TaskStatus::Completed.as_str(), &Json(body)],
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
            pool: self.pool.clone(),
        }
    }
}
