// Batch Types
export interface Batch {
  batch_id: string;
  created_at: string;
  status: string;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks?: number;
  pending_tasks?: number;
  processing_tasks?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  average_processing_time?: number;
  metadata?: Record<string, any>;
}

export interface BatchListResponse {
  total: number;
  batches: Batch[];
}

export interface Task {
  message_id: string;
  batch_id: string;
  created_at: string;
  status: string;
  duration_ms?: number;
  cached?: boolean;
  completions?: {
    usage?: {
      total_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
    }
  };
}

export interface BatchTasksResponse {
  total: number;
  tasks: Task[];
}

export interface TimeSeriesDataPoint {
  timestamp: string;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  cached_tasks: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  avg_duration_ms: number;
  tokens_per_second: number;
}

export interface StatsSummary {
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  cached_tasks: number;
  total_tokens: number;
  completion_tokens: number;
  average_response_time: number;
  tokens_per_second: number;
  cache_hit_rate: number;
}

export interface UsageStatsResponse {
  time_range: string;
  interval: string;
  current_time: string;
  time_series: TimeSeriesDataPoint[];
  summary: StatsSummary;
}

// Task Types
export interface TaskStats {
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  cached_tasks: number;
  processing_tasks: number;
  pending_tasks: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
} 