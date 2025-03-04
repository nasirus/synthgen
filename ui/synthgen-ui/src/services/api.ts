import axios from 'axios';

// Create API client with default configuration
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Add a request interceptor to add the API key to all requests
apiClient.interceptors.request.use(
  (config) => {
    // Get the API key from localStorage
    const apiKey = typeof window !== 'undefined' ? localStorage.getItem('api_key') : null;

    // If the API key exists, add it to the Authorization header
    if (apiKey) {
      config.headers.Authorization = `Bearer ${apiKey}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Export the apiClient for use in other modules
export { apiClient };

// Health check service
export const healthService = {
  getHealthCheck: async () => {
    return apiClient.get('/health');
  },
};

// Batches service
export const batchesService = {
  getBatches: async () => {
    return apiClient.get(`/api/v1/batches`);
  },
  getBatch: async (batchId: string) => {
    return apiClient.get(`/api/v1/batches/${batchId}`);
  },
  getBatchTasks: async (batchId: string, status: string) => {
    return apiClient.get(`/api/v1/batches/${batchId}/tasks?task_status=${status}`);
  },
  deleteBatch: async (batchId: string) => {
    return apiClient.delete(`/api/v1/batches/${batchId}`);
  },
  getBatchStats: async (batchId: string, timeRange: string, interval: string) => {
    return apiClient.get(`/api/v1/batches/${batchId}/stats?time_range=${timeRange}&interval=${interval}`);
  },
};

// Tasks service
export const tasksService = {
  getTask: async (messageId: string) => {
    return apiClient.get(`/api/v1/tasks/${messageId}`);
  },
  deleteTask: async (messageId: string) => {
    return apiClient.delete(`/api/v1/tasks/${messageId}`);
  },
  getTaskStats: async () => {
    return apiClient.get(`/api/v1/tasks/stats`);
  },
}; 