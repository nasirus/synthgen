import { apiRequest } from './index';
import { API_ENDPOINTS } from './endpoints';
import type {
  Batch,
  BatchListResponse,
  BatchTasksResponse,
  Task,
  TaskStatsResponse
} from '@/lib/types';

// Health service
export const healthService = {
  getHealthCheck: async () => {
    return apiRequest('get', API_ENDPOINTS.HEALTH);
  },
};

// Batches service
export const batchesService = {
  getBatches: async () => {
    return apiRequest<BatchListResponse>('get', API_ENDPOINTS.BATCHES);
  },

  getBatch: async (batchId: string) => {
    return apiRequest<Batch>('get', API_ENDPOINTS.BATCH(batchId));
  },

  getBatchTasks: async (batchId: string, status: string) => {
    return apiRequest<BatchTasksResponse>('get', API_ENDPOINTS.BATCH_TASKS(batchId, status));
  },

  deleteBatch: async (batchId: string) => {
    return apiRequest('delete', API_ENDPOINTS.BATCH(batchId));
  },

  getBatchStats: async (batchId: string, timeRange: string, interval: string) => {
    return apiRequest('get', API_ENDPOINTS.BATCH_STATS(batchId, timeRange, interval));
  },
};

// Tasks service
export const tasksService = {
  getTask: async (messageId: string) => {
    return apiRequest<Task>('get', API_ENDPOINTS.TASK(messageId));
  },

  deleteTask: async (messageId: string) => {
    return apiRequest('delete', API_ENDPOINTS.TASK(messageId));
  },

  getTaskStats: async () => {
    return apiRequest<TaskStatsResponse>('get', API_ENDPOINTS.TASK_STATS);
  },
}; 