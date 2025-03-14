import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { API_ENDPOINTS } from './endpoints';

// Types
export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  error?: string;
}

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
  data?: unknown, 
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
      default:
        throw new Error('Invalid method');
    }
    
    return {
      data: response.data,
      status: response.status
    };
  } catch (error: unknown) {
    const err = error as { response?: { status?: number, data?: { message?: string } }, message?: string };
    return {
      data: null as unknown as T,
      status: err.response?.status || 500,
      error: err.response?.data?.message || err.message || 'Unknown error'
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

// Re-export from services (server-safe)
export * from './services';

// Export default object for importing everything at once (server-safe version)
const apiExports = {
  client: apiClient,
  request: apiRequest,
  fetcher: swrFetcher,
  endpoints: API_ENDPOINTS
};

export default apiExports; 