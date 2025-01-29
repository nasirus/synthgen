use config::{Config, ConfigError, File};
use consumer::llm_wrapper;
use consumer::llm_wrapper::Message;
use serde::Deserialize;
use chrono::Utc;
use consumer::db::DatabaseClient;

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
async fn main() {
    dotenv::dotenv().ok();
    let settings = Settings::new().expect("Failed to load settings");

    let messages = vec![Message {
        role: "user".to_string(),
        content: "1+1=?".to_string(),
    }];

    let db_client = DatabaseClient::new(&settings.database_url)
        .await
        .expect("Failed to connect to database");

    let started_at = Utc::now();
    let payload = serde_json::json!({
        "messages": messages,
        "model": "meta-llama/llama-3.2-1b-instruct"
    });

    let client = llm_wrapper::LLMClient::new();
    let result = llm_wrapper::call_llm(
        &client,
        "https://openrouter.ai/api/v1/chat/completions",
        "meta-llama/llama-3.2-1b-instruct",
        &messages,
        settings.openrouter_api_key,
        settings.site_url,
        settings.site_name,
        settings.retry_attempts,
        settings.base_delay_ms,
    )
    .await;

    match result {
        Ok(llm_response) => {
            println!("Content: {}", llm_response.content);
            println!("Usage prompt_tokens: {:?}", llm_response.usage.prompt_tokens);
            println!("Usage completion_tokens: {:?}", llm_response.usage.completion_tokens);
            println!("Usage total_tokens: {:?}", llm_response.usage.total_tokens);

            if let Err(e) = db_client.insert_llm_response(
                None,
                payload,
                &llm_response,
                started_at,
            ).await {
                eprintln!("Failed to insert response into database: {:?}", e);
            }
        }
        Err(e) => {
            eprintln!("Failed after all retry attempts: {:?}", e);
            if let Err(db_err) = db_client.insert_error(
                None,
                payload,
                &e.to_string(),
                started_at,
            ).await {
                eprintln!("Failed to insert error into database: {:?}", db_err);
            }
        }
    }
}
