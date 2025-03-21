"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from "react";

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
  autoRefreshTriggered: boolean;
}

const defaultContext: RefreshContextType = {
  autoRefresh: true,
  setAutoRefresh: () => { },
  refreshInterval: "5s",
  setRefreshInterval: () => { },
  refreshNow: () => { },
  isRefreshing: false,
  autoRefreshTriggered: false,
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
      return saved && REFRESH_INTERVALS[saved] !== undefined ? saved : "5s";
    }
    return "5s";
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshTriggered, setAutoRefreshTriggered] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Set up and clean up the auto-refresh interval
  useEffect(() => {
    if (autoRefresh && REFRESH_INTERVALS[refreshInterval] > 0) {
      const timer = setInterval(() => {
        setIsRefreshing(true);
        setAutoRefreshTriggered(true);
        
        setTimeout(() => {
          setIsRefreshing(false);
        }, 1000);
        
        // Clear the auto-refresh triggered status after 3 seconds
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setAutoRefreshTriggered(false);
          timerRef.current = null;
        }, 3000);
      }, REFRESH_INTERVALS[refreshInterval]);
      
      return () => clearInterval(timer);
    }
  }, [autoRefresh, refreshInterval]);

  // Custom event for manual refresh
  const triggerManualRefreshEvent = useCallback(() => {
    if (typeof window !== "undefined") {
      const event = new CustomEvent("manual-refresh");
      window.dispatchEvent(event);
    }
  }, []);

  // Function to trigger manual refresh
  const refreshNow = () => {
    setIsRefreshing(true);
    setAutoRefreshTriggered(false);
    
    // Trigger the manual refresh event
    triggerManualRefreshEvent();
    
    // Simulate or perform the actual refresh logic
    setTimeout(() => {
      setIsRefreshing(false);
    }, 500);
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
        autoRefreshTriggered,
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
  const [manualRefreshCounter, setManualRefreshCounter] = useState(0);

  // Listen for manual refresh events
  useEffect(() => {
    const handleManualRefresh = () => {
      setManualRefreshCounter(prev => prev + 1);
    };

    window.addEventListener("manual-refresh", handleManualRefresh);
    return () => {
      window.removeEventListener("manual-refresh", handleManualRefresh);
    };
  }, []);

  return {
    // Return 0 (disabled) if auto-refresh is off, otherwise return the interval
    refreshInterval: autoRefresh ? intervalMs : 0,
    refreshNow,
    manualRefreshCounter,
  };
} 