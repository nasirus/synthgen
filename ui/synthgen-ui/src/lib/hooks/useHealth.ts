import { useSWRFetch } from './useSWRFetch';
import { SWRConfiguration } from 'swr';

/**
 * Hook to fetch API health status with auto-refresh
 * @param config Optional SWR configuration
 * @returns The health check data and SWR state
 */
export function useHealthCheck(config?: SWRConfiguration) {
  return useSWRFetch<any>(
    '/health',
    {
      // Health checks need more frequent updates
      refreshInterval: 5000, // 5 seconds
      ...config,
    }
  );
} 