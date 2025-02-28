use serde_json::Value;
use chrono::{DateTime, Utc};

#[derive(Debug)]
pub struct LLMResponse {
    pub completions: Value,
    pub cached: bool,
    pub attempt: u32,
    pub started_at: DateTime<Utc>,
    pub completed_at: DateTime<Utc>,
}
