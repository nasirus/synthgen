import { API_BASE_URL } from '@/lib/config';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

// Types
export interface ApiResponse<T = any> {
  data: T;
  status: number;
  error?: string;
}

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

// Create API client with default configuration
const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
    }
  });

  // Add a request interceptor to add the API key to all requests
  client.interceptors.request.use(
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

  // Add a response interceptor for error handling
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      // Handle common errors here (e.g., 401, 403, 404, 500)
      if (error.response) {
        // Handle 401 Unauthorized - could redirect to login
        if (error.response.status === 401) {
          // If on client side
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
      }
      return Promise.reject(error);
    }
  );

  return client;
};

// Create and export the API client
export const apiClient = createApiClient();

// Generic request function
export const apiRequest = async <T>(
  method: 'get' | 'post' | 'put' | 'delete', 
  url: string, 
  data?: any, 
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  try {
    let response: AxiosResponse;
    
    switch (method) {
      case 'get':
        response = await apiClient.get(url, config);
        break;
      case 'post':
        response = await apiClient.post(url, data, config);
        break;
      case 'put':
        response = await apiClient.put(url, data, config);
        break;
      case 'delete':
        response = await apiClient.delete(url, config);
        break;
    }
    
    return {
      data: response.data,
      status: response.status
    };
  } catch (error: any) {
    return {
      data: null as any,
      status: error.response?.status || 500,
      error: error.response?.data?.message || error.message || 'Unknown error'
    };
  }
};

// SWR fetcher function
export const swrFetcher = async <T>(url: string): Promise<T> => {
  const response = await apiRequest<T>('get', url);
  
  if (response.error) {
    throw new Error(response.error);
  }
  
  return response.data;
};

// Re-export from services and hooks
export * from './services';
export * from './hooks';

// Export default object for importing everything at once
export default {
  client: apiClient,
  request: apiRequest,
  fetcher: swrFetcher,
  endpoints: API_ENDPOINTS
}; 