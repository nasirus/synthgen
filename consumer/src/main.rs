use config::{Config, ConfigError, File};
use consumer::llm_wrapper;
use serde::Deserialize;
use chrono::Utc;
use consumer::db;
use consumer::schemas;
use lapin::{options::*, types::FieldTable, Connection, ConnectionProperties};
use tokio::sync::Semaphore;
use std::sync::Arc;
use futures_lite::StreamExt;
use tracing::{info, error};
use tracing_subscriber;

#[derive(Debug, Deserialize, Clone)]
struct Settings {
    openrouter_api_key: String,
    site_url: String,
    site_name: String,
    #[serde(default = "default_retry_attempts")]
    retry_attempts: u32,
    #[serde(default = "default_base_delay_ms")]
    base_delay_ms: u64,
    database_url: String,
    rabbitmq_host: String,
    rabbitmq_port: u16,
    rabbitmq_user: String,
    rabbitmq_pass: String,
    max_parallel_tasks: usize,
}

fn default_retry_attempts() -> u32 {
    3
}
fn default_base_delay_ms() -> u64 {
    1000
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
    let settings = Settings::new().expect("Failed to load settings");
    
    let conn = establish_rabbitmq_connection(&settings).await?;
    let channel = conn.create_channel().await?;
    
    // Set QoS (prefetch) before declaring queue
    channel.basic_qos(settings.max_parallel_tasks as u16, BasicQosOptions::default())
        .await?;
    
    channel.queue_declare(
        "data_generation_tasks",
        QueueDeclareOptions {
            durable: true,
            ..QueueDeclareOptions::default()
        },
        FieldTable::default(),
    ).await?;

    let db_client = db::DatabaseClient::new(&settings.database_url)
        .await
        .expect("Failed to connect to database");
    
    let semaphore = Arc::new(Semaphore::new(settings.max_parallel_tasks));
    
    let mut consumer = channel
        .basic_consume(
            "data_generation_tasks",
            "consumer",
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await?;

    info!("Started consuming messages with QoS {}", settings.max_parallel_tasks);
    
    while let Some(delivery) = consumer.next().await {
        let delivery = delivery?;
        let permit = semaphore.clone().acquire_owned().await?;
        let settings = settings.clone();
        let db_client = db_client.clone();
        
        tokio::spawn(async move {
            process_message(&settings, &db_client, delivery.data.clone()).await;
            
            // Convert error to thread-safe boxed error
            delivery.ack(BasicAckOptions::default()).await
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;

            drop(permit);
            Ok::<(), Box<dyn std::error::Error + Send + Sync>>(())
        });
    }
    
    Ok(())
}

async fn establish_rabbitmq_connection(settings: &Settings) -> Result<Connection, Box<dyn std::error::Error + Send + Sync>> {
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
                error!("Failed to connect to RabbitMQ: {}, retrying in 5s...", e);
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        }
    }
}

async fn process_message(settings: &Settings, db_client: &db::DatabaseClient, data: Vec<u8>) {
    let message_data: serde_json::Value = match serde_json::from_slice(&data) {
        Ok(data) => data,
        Err(e) => {
            error!("Failed to parse message: {}", e);
            return;
        }
    };
    
    let message_id = message_data["message_id"].as_str().unwrap_or_default();
    let payload = message_data["payload"].clone();
    let started_at = Utc::now();

    info!("Processing message {}", message_id);
    
    // Update status to PROCESSING
    if let Err(e) = db_client.update_event_status(
        message_id.to_string(),
        schemas::task_status::TaskStatus::Processing,
        &schemas::llm_response::LLMResponse {
            content: String::new(),
            usage: schemas::llm_response::Usage {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            },
            cached: false,
        },
        started_at,
    ).await {
        error!("Failed to update status to PROCESSING: {}", e);
        return;
    }

    // Check cache
    if let Ok(Some(cached_response)) = db_client.get_cached_completion(&payload).await {
        info!("Using cached response for message {}", message_id);
        if let Err(e) = db_client.update_event_status(
            message_id.to_string(),
            schemas::task_status::TaskStatus::Completed,
            &cached_response,
            started_at,
        ).await {
            error!("Failed to update cached status: {}", e);
        }
        return;
    }

    // Process LLM request
    let messages = vec![llm_wrapper::Message {
        role: payload["role"].as_str().unwrap_or_default().to_string(),
        content: payload["content"].as_str().unwrap_or_default().to_string(),
    }];

    match llm_wrapper::call_llm(
        &llm_wrapper::LLMClient::new(),
        "https://openrouter.ai/api/v1/chat/completions",
        "meta-llama/llama-3.2-1b-instruct",
        &messages,
        settings.openrouter_api_key.clone(),
        settings.site_url.clone(),
        settings.site_name.clone(),
        settings.retry_attempts,
        settings.base_delay_ms,
    ).await {
        Ok(response) => {
            if let Err(e) = db_client.update_event_status(
                message_id.to_string(),
                schemas::task_status::TaskStatus::Completed,
                &response,
                started_at,
            ).await {
                error!("Failed to update status to COMPLETED: {}", e);
            }
        }
        Err(e) => {
            error!("LLM request failed: {}", e);
            if let Err(db_err) = db_client.insert_error(
                None,
                payload,
                &e.to_string(),
                started_at,
            ).await {
                error!("Failed to insert error: {}", db_err);
            }
        }
    }
}
