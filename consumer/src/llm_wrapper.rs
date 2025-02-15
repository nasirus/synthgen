use crate::schemas::llm_response::LLMResponse;
use reqwest::Client;
use serde_json::Value;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio_retry::strategy::{jitter, ExponentialBackoff};
use tokio_retry::Retry;

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
    body: &Value,
    api_key: String,
    site_url: String,
    site_name: String,
    retry_attempts: u32,
    base_delay_ms: u64,
) -> Result<LLMResponse, Box<dyn std::error::Error + Send + Sync>> {
    let retry_strategy = ExponentialBackoff::from_millis(base_delay_ms)
        .factor(2)
        .max_delay(Duration::from_secs(60))
        .map(jitter)
        .take(retry_attempts as usize);

    let attempt = AtomicU32::new(0);
    let result = Retry::spawn(retry_strategy, || async {
        let current_attempt = attempt.fetch_add(1, Ordering::SeqCst);
        tracing::debug!(
            "LLM request attempt {}/{}",
            current_attempt + 1,
            retry_attempts
        );

        let response = client
            .inner
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("HTTP-Referer", &site_url)
            .header("X-Title", &site_name)
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                let error_type = if e.is_timeout() {
                    "timeout"
                } else if e.is_connect() {
                    "connection"
                } else {
                    "other"
                };
                tracing::warn!(
                    "LLM request failed on attempt {}/{}: {} error - {}",
                    current_attempt + 1,
                    retry_attempts,
                    error_type,
                    e
                );
                if e.is_timeout() || e.is_connect() {
                    std::thread::sleep(Duration::from_millis(base_delay_ms));
                }
                e
            })?;

        if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            let delay = response
                .headers()
                .get("Retry-After")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok())
                .unwrap_or(2);

            tracing::warn!(
                "Rate limit hit on attempt {}/{}. Waiting {} seconds before retry",
                current_attempt + 1,
                retry_attempts,
                delay
            );
            tokio::time::sleep(Duration::from_secs(delay)).await;
            return Err(response.error_for_status().unwrap_err());
        }

        let raw_response: Value = response.json().await?;

        Ok(LLMResponse {
            completions: raw_response,
            cached: false,
            attempt: current_attempt,
        })
    })
    .await
    .map_err(|e| {
        tracing::error!(
            "LLM request failed after {} attempts. Final error: {}",
            retry_attempts,
            e
        );
        e
    })?;

    Ok(result)
}
