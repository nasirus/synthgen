use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio_retry::strategy::{jitter, ExponentialBackoff};
use tokio_retry::Retry;
use std::sync::Arc;
use http;
use crate::schemas::llm_response::{LLMResponse, Usage};

#[derive(Serialize, Clone)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Clone)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
    usage: Usage,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: AssistantMessage,
}

#[derive(Debug, Deserialize)]
struct AssistantMessage {
    content: String,
}


#[derive(Clone)]
pub struct LLMClient {
    inner: Arc<Client>,
}

impl LLMClient {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Client::new()),
        }
    }
}

pub async fn call_llm(
    client: &LLMClient,
    url: &str,
    model: &str,
    messages: &[Message],
    api_key: String,
    site_url: String,
    site_name: String,
    retry_attempts: u32,
    base_delay_ms: u64,
) -> Result<LLMResponse, Box<dyn std::error::Error>> {
    let request = ChatRequest {
        model: model.to_string(),
        messages: messages.to_vec(),
    };

    let retry_strategy = ExponentialBackoff::from_millis(base_delay_ms)
        .factor(2)
        .max_delay(Duration::from_secs(30))
        .map(jitter)
        .take(retry_attempts as usize);

    let result = Retry::spawn(retry_strategy, || async {
        let response = client
            .inner
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("HTTP-Referer", &site_url)
            .header("X-Title", &site_name)
            .json(&request)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() || e.is_connect() {
                    std::thread::sleep(Duration::from_millis(100));
                }
                e
            })?;

        if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            let delay = response.headers()
                .get("Retry-After")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok())
                .unwrap_or(2);
            
            tokio::time::sleep(Duration::from_secs(delay)).await;
            return Err(response.error_for_status().unwrap_err());
        }

        let chat_response: ChatResponse = response.json().await?;
        if chat_response.choices.is_empty() {
            let response = http::Response::builder()
                .status(reqwest::StatusCode::INTERNAL_SERVER_ERROR)
                .body(Vec::new())
                .unwrap();
            return Err(reqwest::Response::from(response).error_for_status().unwrap_err());
        }

        Ok(LLMResponse {
            content: chat_response.choices[0].message.content.clone(),
            usage: chat_response.usage,
            cached: false,
        })
    })
    .await?;

    Ok(result)
}
