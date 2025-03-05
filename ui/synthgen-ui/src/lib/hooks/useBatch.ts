import { useSWRFetch } from './useSWRFetch';
import { Batch, BatchListResponse, BatchTasksResponse, TaskStatus, UsageStatsResponse } from '@/lib/types';
import { SWRConfiguration } from 'swr';

/**
 * Hook to fetch a single batch with auto-refresh
 * @param batchId The ID of the batch to fetch
 * @param config Optional SWR configuration
 * @returns The batch data and SWR state
 */
export function useBatch(batchId: string, config?: SWRConfiguration) {
  return useSWRFetch<Batch>(
    `/api/v1/batches/${batchId}`,
    config
  );
}

/**
 * Hook to fetch all batches with auto-refresh
 * @param config Optional SWR configuration
 * @returns The batches data and SWR state
 */
export function useBatches(config?: SWRConfiguration) {
  return useSWRFetch<BatchListResponse>(
    '/api/v1/batches',
    config
  );
}

/**
 * Hook to fetch batch tasks with auto-refresh
 * @param batchId The ID of the batch
 * @param status The task status to filter by
 * @param config Optional SWR configuration
 * @returns The tasks data and SWR state
 */
export function useBatchTasks(batchId: string, status: TaskStatus, config?: SWRConfiguration) {
  return useSWRFetch<BatchTasksResponse>(
    `/api/v1/batches/${batchId}/tasks?task_status=${status}`,
    config
  );
}

/**
 * Hook to fetch batch statistics with auto-refresh
 * @param batchId The ID of the batch
 * @param timeRange The time range for the statistics (e.g., "24h", "7d")
 * @param interval The interval for the statistics (e.g., "1h", "1d")
 * @param config Optional SWR configuration
 * @returns The statistics data and SWR state
 */
export function useBatchStats(
  batchId: string, 
  timeRange: string, 
  interval: string, 
  config?: SWRConfiguration
) {
  return useSWRFetch<UsageStatsResponse>(
    `/api/v1/batches/${batchId}/stats?time_range=${timeRange}&interval=${interval}`,
    config
  );
} 