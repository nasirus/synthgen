import useSWR, { SWRConfiguration } from 'swr';
import { apiClient } from '@/services/api';

// Type for the fetcher function response
type FetcherResponse<T> = {
  data: T;
  status: number;
};

// Custom fetcher that works with our API client
const fetcher = async <T>(url: string): Promise<T> => {
  try {
    const response = await apiClient.get(url);
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Custom hook that wraps SWR for auto-refreshing data
 * @param url The API endpoint URL
 * @param config Optional SWR configuration including refresh interval
 * @returns The SWR response with data, error, and loading state
 */
export function useSWRFetch<T>(url: string, config?: SWRConfiguration) {
  // Default config with 10-second refresh interval
  const defaultConfig: SWRConfiguration = {
    refreshInterval: 10000, // 10 seconds
    revalidateOnFocus: true,
    dedupingInterval: 2000, // 2 seconds
    ...config,
  };

  const { data, error, isLoading, isValidating, mutate } = useSWR<T>(
    url,
    fetcher,
    defaultConfig
  );

  return {
    data,
    error,
    isLoading,
    isValidating,
    mutate
  };
} 