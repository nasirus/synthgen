"use client";

/**
 * Centralized API Hooks
 * 
 * This file provides React hooks for all API operations,
 * using SWR for data fetching with caching and revalidation.
 */

import useSWR, { SWRConfiguration } from 'swr';
import { useEffect } from 'react';
import { API_ENDPOINTS } from './endpoints';
import { swrFetcher } from './index';
import { useRefreshTrigger } from '@/contexts/refresh-context';
import type { 
  Batch, 
  BatchListResponse, 
  BatchTasksResponse, 
  TaskStatus,
  Task,
  TaskStatsResponse,
  HealthCheckResponse
} from '@/lib/types';

/**
 * Base hook for SWR fetching with refresh capabilities
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

  const { 
    data, 
    error, 
    isLoading, 
    isValidating, 
    mutate: boundMutate 
  } = useSWR<T>(url, swrFetcher, defaultConfig);

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

/*
 * Domain-specific hooks
 */

// Health hooks
export function useHealth(config?: SWRConfiguration) {
  return useSWRFetch<HealthCheckResponse>(API_ENDPOINTS.HEALTH, config);
}

// Batch hooks
export function useBatch(batchId: string, config?: SWRConfiguration) {
  return useSWRFetch<Batch>(
    API_ENDPOINTS.BATCH(batchId),
    config
  );
}

export function useBatches(config?: SWRConfiguration) {
  return useSWRFetch<BatchListResponse>(
    API_ENDPOINTS.BATCHES,
    config
  );
}

export function useBatchTasks(batchId: string, status: TaskStatus, config?: SWRConfiguration) {
  return useSWRFetch<BatchTasksResponse>(
    API_ENDPOINTS.BATCH_TASKS(batchId, status),
    config
  );
}

export function useBatchStats(
  batchId: string, 
  timeRange: string, 
  interval: string, 
  config?: SWRConfiguration
) {
  return useSWRFetch(
    API_ENDPOINTS.BATCH_STATS(batchId, timeRange, interval),
    config
  );
}

// Task hooks
export function useTask(messageId: string, config?: SWRConfiguration) {
  return useSWRFetch<Task>(
    API_ENDPOINTS.TASK(messageId),
    config
  );
}

export function useTaskStats(config?: SWRConfiguration) {
  return useSWRFetch<TaskStatsResponse>(
    API_ENDPOINTS.TASK_STATS,
    config
  );
} 