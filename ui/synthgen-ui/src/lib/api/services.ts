import { apiRequest } from './index';
import { API_ENDPOINTS } from './endpoints';
import type {
  Batch,
  BatchListResponse,
  BatchTasksResponse,
  Task,
  TaskStatsResponse,
  TokenResponse
} from '@/lib/types';
import axios, { AxiosError } from 'axios';

/**
 * Test API connection with provided URL and key
 */
export async function testConnection(apiKey: string, apiUrl: string): Promise<{ token: TokenResponse | null; message?: string }> {
  try {
    const response = await axios.get(`${apiUrl}/token`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 5000 // 5 second timeout
    });
    
    // Validate the response data has the expected shape
    if (!response.data || typeof response.data.isValid !== 'boolean') {
      return {
        token: null,
        message: 'Invalid response from server'
      };
    }
    
    return { token: response.data };
  } catch (error) {
    console.error('Connection test failed:', error);
    
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        return {
          token: null,
          message: axiosError.response.status === 401 
            ? 'Invalid API key'
            : `Server error: ${axiosError.response.status}`
        };
      } else if (axiosError.request) {
        // The request was made but no response was received
        return {
          token: null,
          message: 'No response from server. Please check the URL and try again.'
        };
      }
    }
    
    // Something happened in setting up the request that triggered an Error
    return {
      token: null,
      message: 'Failed to connect. Please check your network connection.'
    };
  }
}

// Health service
export const healthService = {
  getHealthCheck: async () => {
    return apiRequest('get', API_ENDPOINTS.HEALTH());
  },
};

// Batches service
export const batchesService = {
  getBatches: async () => {
    return apiRequest<BatchListResponse>('get', API_ENDPOINTS.BATCHES());
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
    return apiRequest<TaskStatsResponse>('get', API_ENDPOINTS.TASK_STATS());
  },
}; 