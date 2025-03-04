import { useSWRFetch } from './useSWRFetch';
import { SWRConfiguration } from 'swr';

/**
 * Hook to fetch task statistics with auto-refresh
 * @param config Optional SWR configuration
 * @returns The task statistics data and SWR state
 */
export function useTaskStats(config?: SWRConfiguration) {
  return useSWRFetch<any>(
    '/api/v1/tasks/stats',
    config
  );
}

/**
 * Hook to fetch a single task with auto-refresh
 * @param taskId The ID of the task to fetch
 * @param config Optional SWR configuration
 * @returns The task data and SWR state
 */
export function useTask(taskId: string, config?: SWRConfiguration) {
  return useSWRFetch<any>(
    `/api/v1/tasks/${taskId}`,
    config
  );
}

/**
 * Hook to fetch recent tasks with auto-refresh
 * @param limit The maximum number of tasks to fetch
 * @param config Optional SWR configuration
 * @returns The recent tasks data and SWR state
 */
export function useRecentTasks(limit: number = 10, config?: SWRConfiguration) {
  return useSWRFetch<any>(
    `/api/v1/tasks/recent?limit=${limit}`,
    config
  );
} 