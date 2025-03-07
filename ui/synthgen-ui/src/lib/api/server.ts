import { API_ENDPOINTS } from './endpoints';

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