#[derive(Debug, PartialEq)]
pub enum TaskStatus {
    Pending,
    Processing,
    Completed,
    Failed,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskStatus::Pending => "PENDING",
            TaskStatus::Processing => "PROCESSING",
            TaskStatus::Completed => "COMPLETED",
            TaskStatus::Failed => "FAILED",
        }
    }
} 