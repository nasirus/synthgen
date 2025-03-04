"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

// Available refresh intervals in milliseconds
export const REFRESH_INTERVALS = {
  "5s": 5000,
  "10s": 10000,
  "30s": 30000,
  "1m": 60000,
  "5m": 300000,
  "Off": 0,
};

export type RefreshIntervalKey = keyof typeof REFRESH_INTERVALS;

interface RefreshContextType {
  autoRefresh: boolean;
  setAutoRefresh: (value: boolean) => void;
  refreshInterval: RefreshIntervalKey;
  setRefreshInterval: (interval: RefreshIntervalKey) => void;
  refreshNow: () => void;
  isRefreshing: boolean;
}

const defaultContext: RefreshContextType = {
  autoRefresh: true,
  setAutoRefresh: () => { },
  refreshInterval: "10s",
  setRefreshInterval: () => { },
  refreshNow: () => { },
  isRefreshing: false,
};

const RefreshContext = createContext<RefreshContextType>(defaultContext);

export function useRefreshContext() {
  return useContext(RefreshContext);
}

interface RefreshProviderProps {
  children: ReactNode;
}

export function RefreshProvider({ children }: RefreshProviderProps) {
  // Initialize from localStorage if available, otherwise use defaults
  const [autoRefresh, setAutoRefresh] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("autoRefresh");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });

  const [refreshInterval, setRefreshInterval] = useState<RefreshIntervalKey>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("refreshInterval") as RefreshIntervalKey;
      return saved && REFRESH_INTERVALS[saved] !== undefined ? saved : "10s";
    }
    return "10s";
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  // Store settings in localStorage when changed
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("autoRefresh", autoRefresh.toString());
    }
  }, [autoRefresh]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("refreshInterval", refreshInterval);
    }
  }, [refreshInterval]);

  // Function to trigger manual refresh
  const refreshNow = () => {
    setIsRefreshing(true);
    setRefreshCount(prev => prev + 1);

    // Reset the refreshing indicator after a short delay
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };

  return (
    <RefreshContext.Provider
      value={{
        autoRefresh,
        setAutoRefresh,
        refreshInterval,
        setRefreshInterval,
        refreshNow,
        isRefreshing,
      }}
    >
      {children}
    </RefreshContext.Provider>
  );
}

// Custom hook that combines SWR and the refresh context
export function useRefreshTrigger() {
  const { autoRefresh, refreshInterval, refreshNow } = useRefreshContext();
  const intervalMs = REFRESH_INTERVALS[refreshInterval];

  return {
    // Return 0 (disabled) if auto-refresh is off, otherwise return the interval
    refreshInterval: autoRefresh ? intervalMs : 0,
    refreshNow,
  };
} 