/**
 * Centralized API Endpoints
 * 
 * This file provides a single source of truth for all API endpoints
 * that can be imported by both client and server code.
 */

import { API_BASE_URL } from '@/lib/config';

// URL Constants - centralized endpoint definitions
export const API_ENDPOINTS = {
  // Health endpoints
  HEALTH: `${API_BASE_URL}/health`,
  
  // Batch endpoints
  BATCHES: `${API_BASE_URL}/api/v1/batches`,
  BATCH: (id: string) => `${API_BASE_URL}/api/v1/batches/${id}`,
  BATCH_TASKS: (id: string, status?: string) => 
    `${API_BASE_URL}/api/v1/batches/${id}/tasks${status ? `?task_status=${status}` : ''}`,
  BATCH_STATS: (id: string, timeRange: string, interval: string) => 
    `${API_BASE_URL}/api/v1/batches/${id}/stats?time_range=${timeRange}&interval=${interval}`,
  
  // Task endpoints
  TASK: (id: string) => `${API_BASE_URL}/api/v1/tasks/${id}`,
  TASK_STATS: `${API_BASE_URL}/api/v1/tasks/stats`
};

export default API_ENDPOINTS; 