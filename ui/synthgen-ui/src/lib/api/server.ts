/**
 * Server-side API utilities
 * 
 * This file provides server-safe API functions that can be used in
 * route handlers and server components.
 */

import { API_BASE_URL } from '@/lib/config';

// URL Constants - same as client side
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

/**
 * Simple server-side fetch with appropriate caching settings for API routes
 */
export async function serverFetch<T>(url: string, apiKey?: string): Promise<T> {
  // For server components, we use the provided API key
  const authHeader = apiKey ? `Bearer ${apiKey}` : '';
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { 'Authorization': authHeader } : {})
    },
    // Important: Always use no-store for API routes to prevent caching
    cache: 'no-store'
  });
  
  if (!response.ok) {
    throw new Error(`Server fetch failed: ${response.status} ${response.statusText}`);
  }
  
  return response.json() as Promise<T>;
}

// Health service
export const serverHealthService = {
  getHealthCheck: async () => {
    return serverFetch(API_ENDPOINTS.HEALTH);
  },
};

// Batches service
export const serverBatchesService = {
  getBatches: async () => {
    return serverFetch(API_ENDPOINTS.BATCHES);
  },
  
  getBatch: async (batchId: string) => {
    return serverFetch(API_ENDPOINTS.BATCH(batchId));
  },
  
  getBatchTasks: async (batchId: string, status: string) => {
    return serverFetch(API_ENDPOINTS.BATCH_TASKS(batchId, status));
  },
  
  getBatchStats: async (batchId: string, timeRange: string, interval: string) => {
    return serverFetch(API_ENDPOINTS.BATCH_STATS(batchId, timeRange, interval));
  },
};

// Tasks service
export const serverTasksService = {
  getTask: async (messageId: string) => {
    return serverFetch(API_ENDPOINTS.TASK(messageId));
  },
  
  getTaskStats: async () => {
    return serverFetch(API_ENDPOINTS.TASK_STATS);
  },
}; 