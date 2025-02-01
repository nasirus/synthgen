use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug)]
pub struct LLMResponse {
    pub content: String,
    pub usage: Usage,
    pub cached: bool,
    pub attempt: u32,
}
