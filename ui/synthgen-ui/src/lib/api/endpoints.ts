/**
 * Centralized API Endpoints
 * 
 * This file provides a single source of truth for all API endpoints
 * that can be imported by both client and server code.
 */

import { getApiBaseUrl } from '@/lib/config';

// Function to get the current API endpoint with the latest API URL from localStorage
const getEndpoint = (path: string) => `${getApiBaseUrl()}${path}`;

// URL Constants - centralized endpoint definitions
export const API_ENDPOINTS = {
  // Health endpoints
  HEALTH: () => getEndpoint('/health'),
  
  // Batch endpoints
  BATCHES: () => getEndpoint('/api/v1/batches'),
  BATCH: (id: string) => getEndpoint(`/api/v1/batches/${id}`),
  BATCH_TASKS: (id: string, status?: string) => 
    getEndpoint(`/api/v1/batches/${id}/tasks${status ? `?task_status=${status}` : ''}`),
  BATCH_STATS: (id: string, timeRange: string, interval: string) => 
    getEndpoint(`/api/v1/batches/${id}/stats?time_range=${timeRange}&interval=${interval}`),
  
  // Task endpoints
  TASK: (id: string) => getEndpoint(`/api/v1/tasks/${id}`),
  TASK_STATS: () => getEndpoint('/api/v1/tasks/stats')
};

export default API_ENDPOINTS; 