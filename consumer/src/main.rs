use chrono::Utc;
use config::{Config, ConfigError, File};
use consumer::db;
use consumer::llm_wrapper;
use consumer::schemas;
use consumer::settings::DatabaseSettings;
use futures_lite::StreamExt;
use lapin::{options::*, types::FieldTable, Connection, ConnectionProperties};
use serde::Deserialize;
use std::sync::Arc;
use tracing::{error, info};
use tracing_subscriber;

#[derive(Debug, Deserialize, Clone)]
struct Settings {
    site_url: String,
    site_name: String,
    #[serde(default = "default_retry_attempts")]
    retry_attempts: u32,
    #[serde(default = "default_base_delay_ms")]
    base_delay_ms: u64,
    database: DatabaseSettings,
    rabbitmq_host: String,
    rabbitmq_port: u16,
    rabbitmq_user: String,
    rabbitmq_pass: String,
    max_parallel_tasks: usize,
}

fn default_retry_attempts() -> u32 {
    10
}
fn default_base_delay_ms() -> u64 {
    10000
}

impl Settings {
    pub fn new() -> Result<Self, ConfigError> {
        let config = Config::builder()
            .set_default("site_name", "Default Site")?
            .add_source(File::with_name("config/default"))
            .add_source(File::with_name("config/${APP_ENV}").required(false))
            .add_source(config::Environment::with_prefix("APP"))
            .build()?;

        config.try_deserialize()
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Initialize tracing subscriber
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    dotenv::dotenv().ok();
    let settings = Arc::new(Settings::new().expect("Failed to load settings"));

    loop {
        info!("Attempting to establish RabbitMQ connection...");
        match establish_rabbitmq_connection(&settings).await {
            Ok(conn) => {
                info!("RabbitMQ connection established successfully");
                match conn.create_channel().await {
                    Ok(channel) => {
                        info!("RabbitMQ channel created successfully");
                        if let Err(e) = run_consumer(&settings, &channel).await {
                            error!("Consumer error: {}. Reconnecting in 5s...", e);
                            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                            continue;
                        }
                    }
                    Err(e) => {
                        error!("Failed to create channel: {}. Reconnecting in 5s...", e);
                        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                        continue;
                    }
                }
            }
            Err(e) => {
                error!("Failed to connect to RabbitMQ: {}. Retrying in 5s...", e);
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        }
    }
}

async fn run_consumer(
    settings: &Arc<Settings>,
    channel: &lapin::Channel,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Set QoS (prefetch)
    channel
        .basic_qos(
            settings.max_parallel_tasks as u16,
            BasicQosOptions::default(),
        )
        .await?;

    channel
        .queue_declare(
            "data_generation_tasks",
            QueueDeclareOptions {
                durable: true,
                ..QueueDeclareOptions::default()
            },
            FieldTable::default(),
        )
        .await?;

    let db_client = Arc::new(
        db::DatabaseClient::new(&settings.database)
            .await
            .expect("Failed to connect to database"),
    );

    let semaphore = Arc::new(tokio::sync::Semaphore::new(settings.max_parallel_tasks));

    let mut consumer = channel
        .basic_consume(
            "data_generation_tasks",
            "consumer",
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await?;

    info!(
        "Started consuming messages with QoS {}",
        settings.max_parallel_tasks
    );

    while let Some(delivery) = consumer.next().await {
        let delivery = delivery?;
        let permit = semaphore.clone().acquire_owned().await?;
        let settings = settings.clone();
        let db_client = db_client.clone();

        tokio::spawn(async move {
            process_message(settings, db_client, delivery).await;
            drop(permit);
            Ok::<(), Box<dyn std::error::Error + Send + Sync>>(())
        });
    }

    Ok(())
}

async fn establish_rabbitmq_connection(
    settings: &Settings,
) -> Result<Connection, Box<dyn std::error::Error + Send + Sync>> {
    loop {
        let uri = format!(
            "amqp://{}:{}@{}:{}",
            settings.rabbitmq_user,
            settings.rabbitmq_pass,
            settings.rabbitmq_host,
            settings.rabbitmq_port
        );

        match Connection::connect(&uri, ConnectionProperties::default()).await {
            Ok(conn) => {
                info!("RabbitMQ connection established");
                return Ok(conn);
            }
            Err(e) => {
                error!(
                    "Failed to connect to RabbitMQ: {} with connection uri: {}, retrying in 5s...",
                    e, uri
                );
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        }
    }
}

async fn process_message(
    settings: Arc<Settings>,
    db_client: Arc<db::DatabaseClient>,
    delivery: lapin::message::Delivery,
) {
    let data = delivery.data.clone();
    let message_data: serde_json::Value = match serde_json::from_slice(&data) {
        Ok(data) => data,
        Err(e) => {
            error!("Failed to parse message: {}", e);
            // Reject the message and don't requeue since it's malformed
            if let Err(reject_err) = delivery.reject(BasicRejectOptions { requeue: false }).await {
                error!("Failed to reject malformed message: {}", reject_err);
            }
            return;
        }
    };

    let message_id = message_data["message_id"].as_str().unwrap_or_default();
    let payload = message_data["payload"].clone();
    let started_at = Utc::now();

    info!("Processing message {}", message_id);

    // Update status to PROCESSING
    // if let Err(e) = db_client
    //     .update_event_status(
    //         message_id.to_string(),
    //         schemas::task_status::TaskStatus::Processing,
    //         &schemas::llm_response::LLMResponse {
    //             content: String::new(),
    //             usage: schemas::llm_response::Usage {
    //                 prompt_tokens: 0,
    //                 completion_tokens: 0,
    //                 total_tokens: 0,
    //             },
    //             cached: false,
    //             attempt: 0,
    //         },
    //         started_at,
    //     )
    //     .await
    // {
    //     error!("Failed to update status to PROCESSING: {}", e);
    //     return;
    // }

    // Check cache
    if let Ok(Some(cached_response)) = db_client.get_cached_completion(&payload["body"]).await {
        info!("Using cached response for message {}", message_id);
        if let Err(e) = db_client
            .update_event_status(
                message_id.to_string(),
                schemas::task_status::TaskStatus::Completed,
                &cached_response,
                started_at,
            )
            .await
        {
            error!("Failed to update cached status: {}", e);
            // Requeue if db update fails
            if let Err(reject_err) = delivery.reject(BasicRejectOptions { requeue: true }).await {
                error!("Failed to requeue message: {}", reject_err);
            }
            return;
        }
        // Acknowledge message for successful cache hit
        if let Err(ack_err) = delivery.ack(BasicAckOptions::default()).await {
            error!("Failed to acknowledge message: {}", ack_err);
        }
        return;
    }

    let url = payload["url"].as_str().unwrap_or_default().to_string();
    let body = payload["body"].clone();
    let api_key = payload["api_key"].as_str().unwrap_or_default().to_string();

    match llm_wrapper::call_llm(
        &llm_wrapper::LLMClient::new(),
        &url,
        &body,
        api_key,
        settings.site_url.clone(),
        settings.site_name.clone(),
        settings.retry_attempts,
        settings.base_delay_ms,
    )
    .await
    {
        Ok(response) => {
            match db_client
                .update_event_status(
                    message_id.to_string(),
                    schemas::task_status::TaskStatus::Completed,
                    &response,
                    started_at,
                )
                .await
            {
                Ok(_) => {
                    info!(
                        "Successfully completed message {} in {}ms",
                        message_id,
                        Utc::now()
                            .signed_duration_since(started_at)
                            .num_milliseconds()
                    );
                    // Acknowledge successful processing
                    if let Err(ack_err) = delivery.ack(BasicAckOptions::default()).await {
                        error!("Failed to acknowledge message: {}", ack_err);
                    }
                }
                Err(e) => {
                    error!("Failed to update status to COMPLETED: {}", e);
                    // Requeue the message if database update fails
                    if let Err(reject_err) =
                        delivery.reject(BasicRejectOptions { requeue: true }).await
                    {
                        error!("Failed to requeue message: {}", reject_err);
                    }
                }
            }
        }
        Err(e) => {
            error!("LLM request failed: {}", e);
            if let Err(db_err) = db_client
                .update_event_status(
                    message_id.to_string(),
                    schemas::task_status::TaskStatus::Failed,
                    &schemas::llm_response::LLMResponse {
                        content: format!("LLM request failed: {}", e),
                        usage: schemas::llm_response::Usage {
                            prompt_tokens: 0,
                            completion_tokens: 0,
                            total_tokens: 0,
                        },
                        cached: false,
                        attempt: 0,
                    },
                    started_at,
                )
                .await
            {
                error!("Failed to update status to FAILED: {}", db_err);
            }
        }
    }
}
