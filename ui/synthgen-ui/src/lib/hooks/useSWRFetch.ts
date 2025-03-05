import useSWR, { SWRConfiguration } from 'swr';
import { apiClient } from '@/services/api';
import { useRefreshTrigger } from '@/contexts/refresh-context';
import { useEffect } from 'react';

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
  // Get refresh settings from context
  const { refreshInterval, manualRefreshCounter } = useRefreshTrigger();

  // Default config with refresh interval from context
  const defaultConfig: SWRConfiguration = {
    refreshInterval,
    revalidateOnFocus: true,
    dedupingInterval: 2000, // 2 seconds
    ...config,
  };

  const { data, error, isLoading, isValidating, mutate: boundMutate } = useSWR<T>(
    url,
    fetcher,
    defaultConfig
  );

  // Effect to trigger revalidation when manual refresh is clicked
  useEffect(() => {
    if (manualRefreshCounter > 0) {
      boundMutate();
    }
  }, [manualRefreshCounter, boundMutate]);

  return {
    data,
    error,
    isLoading,
    isValidating,
    mutate: boundMutate
  };
} 