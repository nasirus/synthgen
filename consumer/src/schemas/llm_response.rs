use serde_json::Value;

#[derive(Debug)]
pub struct LLMResponse {
    pub completions: Value,
    pub cached: bool,
    pub attempt: u32,
}
