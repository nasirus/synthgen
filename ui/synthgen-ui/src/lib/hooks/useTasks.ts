import { useSWRFetch } from './useSWRFetch';
import { SWRConfiguration } from 'swr';
import { Task, TaskStatsResponse } from '../types';
/**
 * Hook to fetch task statistics with auto-refresh
 * @param config Optional SWR configuration
 * @returns The task statistics data and SWR state
 */
export function useTaskStats(config?: SWRConfiguration) {
  return useSWRFetch<TaskStatsResponse>(
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
  return useSWRFetch<Task>(
    `/api/v1/tasks/${taskId}`,
    config
  );
}