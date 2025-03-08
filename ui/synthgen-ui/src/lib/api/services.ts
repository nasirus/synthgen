import { apiRequest } from './index';
import { API_ENDPOINTS } from './endpoints';
import type {
  Batch,
  BatchListResponse,
  BatchTasksResponse,
  Task,
  TaskStatsResponse
} from '@/lib/types';

/**
 * Test API connection with provided URL and key
 * @param apiUrl The API URL to test
 * @param apiKey The API key to authenticate with
 * @returns Promise resolving to an object with success status and error message if any
 */
export async function testConnection(apiUrl: string, apiKey: string): Promise<{ success: boolean; message?: string }> {
  try {
    // Format the API URL properly
    let formattedUrl = apiUrl.trim();
    
    // Make sure URL has a protocol
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `http://${formattedUrl}`;
    }
    
    // Ensure no trailing slash before adding /health
    formattedUrl = formattedUrl.endsWith('/') 
      ? formattedUrl.slice(0, -1) 
      : formattedUrl;
    
    // Create a health endpoint URL using the provided API URL
    const healthEndpoint = `${formattedUrl}/health`;
    
    // Set a timeout to prevent long waits on unreachable servers
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    try {
      // Make a fetch request with the provided credentials
      const response = await fetch(healthEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        // Ensure we don't cache this request
        cache: 'no-store',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // If we get a successful response, the connection is valid
      if (response.ok) {
        return { success: true };
      } else {
        return { 
          success: false, 
          message: `Server error: ${response.status} ${response.statusText}` 
        };
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      // Check if the error was due to timeout
      if (fetchError.name === 'AbortError') {
        return { success: false, message: 'Connection timed out. Server unreachable.' };
      }
      
      // Handle specific fetch errors
      console.error('Fetch error:', fetchError);
      return { success: false, message: 'Connection failed. Check URL and network.' };
    }
  } catch (error) {
    console.error('Connection test failed:', error);
    return { success: false, message: 'Invalid API URL format.' };
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