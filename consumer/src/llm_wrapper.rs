use crate::schemas::llm_response::LLMResponse;
use reqwest::Client;
use serde_json::Value;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio_retry2::strategy::jitter;
use tokio_retry2::Retry;
use tokio_retry2::RetryError;

#[derive(Debug)]
struct LLMError(String);

impl std::fmt::Display for LLMError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for LLMError {}

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
    max_delay_secs: u64,
) -> Result<LLMResponse, Box<dyn std::error::Error + Send + Sync>> {
    let retry_strategy =
        tokio_retry2::strategy::ExponentialFactorBackoff::from_millis(base_delay_ms, 2.0)
            .max_delay(Duration::from_secs(max_delay_secs))
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

        let response_result = client
            .inner
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("HTTP-Referer", &site_url)
            .header("X-Title", &site_name)
            .json(&body)
            .send()
            .await;

        let response = match response_result {
            Ok(resp) => resp,
            Err(e) => {
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
                    return Err(RetryError::transient(format!(
                        "Request error ({}): {}",
                        error_type, e
                    )));
                } else {
                    return Err(RetryError::permanent(format!(
                        "Request error ({}): {}",
                        error_type, e
                    )));
                }
            }
        };

        match response.status() {
            reqwest::StatusCode::UNAUTHORIZED => {
                let error_body = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Failed to read error response body".to_string());

                tracing::error!(
                    "Authentication failed on attempt {}/{}: {}",
                    current_attempt + 1,
                    retry_attempts,
                    error_body
                );

                return Err(RetryError::permanent(format!(
                    "Authentication error: {}",
                    error_body
                )));
            }
            reqwest::StatusCode::TOO_MANY_REQUESTS => {
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

                return Err(RetryError::retry_after(
                    "Rate limit exceeded".to_string(),
                    Duration::from_secs(delay),
                ));
            }
            status if !status.is_success() => {
                let error_body = response
                    .text()
                    .await
                    .unwrap_or_else(|_| format!("HTTP error: {}", status));

                tracing::warn!(
                    "LLM request failed with status {} on attempt {}/{}: {}",
                    status,
                    current_attempt + 1,
                    retry_attempts,
                    error_body
                );

                if status.is_server_error() {
                    return Err(RetryError::transient(format!(
                        "Server error ({}): {}",
                        status, error_body
                    )));
                } else {
                    return Err(RetryError::permanent(format!(
                        "Client error ({}): {}",
                        status, error_body
                    )));
                }
            }
            _ => {
                let raw_response = match response.json::<Value>().await {
                    Ok(json) => json,
                    Err(e) => {
                        return Err(RetryError::permanent(format!("JSON parsing error: {}", e)))
                    }
                };

                Ok(LLMResponse {
                    completions: raw_response,
                    cached: false,
                    attempt: current_attempt,
                })
            }
        }
    })
    .await
    .map_err(|e| {
        tracing::error!(
            "LLM request failed after {} attempts. Final error: {}",
            retry_attempts,
            e
        );
        Box::new(LLMError(e.to_string())) as Box<dyn std::error::Error + Send + Sync>
    })?;

    Ok(result)
}
