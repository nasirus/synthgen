"use client";

import { useEffect, useState } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import { batchesService } from "@/services/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, BarChart3, Clock, Zap } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subDays, subHours, subMonths, subWeeks } from "date-fns";
import { UsageStatsResponse, TimeSeriesDataPoint } from "@/lib/types";

// Import a charting library like Chart.js or Recharts
// For this example, we'll use a placeholder for the charts
// In a real implementation, you would use a library like Recharts

export default function BatchStatsPage({ params }: { params: { batchId: string } }) {
  // Unwrap params using React.use()
  const unwrappedParams = React.use(params as unknown as Promise<{ batchId: string }>);
  const batchId = unwrappedParams.batchId;
  
  const [stats, setStats] = useState<UsageStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState("24h");
  const [interval, setInterval] = useState("1h");
  const router = useRouter();

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await batchesService.getBatchStats(batchId, timeRange, interval);
      setStats(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to fetch batch statistics");
      console.error("Error fetching batch stats:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [batchId, timeRange, interval]);

  const navigateBack = () => {
    router.push(`/batches/${batchId}`);
  };

  const timeRangeOptions = [
    { value: "1h", label: "Last Hour" },
    { value: "6h", label: "Last 6 Hours" },
    { value: "12h", label: "Last 12 Hours" },
    { value: "24h", label: "Last 24 Hours" },
    { value: "2d", label: "Last 2 Days" },
    { value: "7d", label: "Last 7 Days" },
    { value: "30d", label: "Last 30 Days" },
  ];

  const intervalOptions = [
    { value: "1m", label: "1 Minute" },
    { value: "5m", label: "5 Minutes" },
    { value: "15m", label: "15 Minutes" },
    { value: "30m", label: "30 Minutes" },
    { value: "1h", label: "1 Hour" },
    { value: "3h", label: "3 Hours" },
    { value: "6h", label: "6 Hours" },
    { value: "12h", label: "12 Hours" },
    { value: "1d", label: "1 Day" },
    { value: "1w", label: "1 Week" },
  ];

  // Helper function to format the time range for display
  const formatTimeRange = (range: string) => {
    const now = new Date();
    let fromDate;

    if (range.endsWith("m")) {
      const minutes = parseInt(range.replace("m", ""));
      fromDate = subHours(now, minutes / 60);
    } else if (range.endsWith("h")) {
      const hours = parseInt(range.replace("h", ""));
      fromDate = subHours(now, hours);
    } else if (range.endsWith("d")) {
      const days = parseInt(range.replace("d", ""));
      fromDate = subDays(now, days);
    } else if (range.endsWith("w")) {
      const weeks = parseInt(range.replace("w", ""));
      fromDate = subWeeks(now, weeks);
    } else if (range.endsWith("M")) {
      const months = parseInt(range.replace("M", ""));
      fromDate = subMonths(now, months);
    } else {
      fromDate = subHours(now, 24); // Default to 24 hours
    }

    return `${format(fromDate, "PPP p")} - ${format(now, "PPP p")}`;
  };

  return (
    <div>
      <div className="flex items-center mb-6">
        <Button variant="ghost" onClick={navigateBack} className="mr-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Batch Details
        </Button>
        <h1 className="text-3xl font-bold">Batch Statistics</h1>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-4">
          <div>
            <p className="text-sm font-medium mb-1">Time Range</p>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select time range" />
              </SelectTrigger>
              <SelectContent>
                {timeRangeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-sm font-medium mb-1">Interval</p>
            <Select value={interval} onValueChange={setInterval}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select interval" />
              </SelectTrigger>
              <SelectContent>
                {intervalOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">
            {stats ? formatTimeRange(timeRange) : "Loading..."}
          </p>
        </div>
      </div>

      {error && (
        <Card className="mb-6 border-red-500">
          <CardContent className="pt-6">
            <div className="flex items-center text-red-500">
              <AlertCircle className="mr-2" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-1/4 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[300px] w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
                <CardDescription>
                  Overall statistics for the selected time period
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Tasks</p>
                    <p className="text-2xl font-bold">{stats.summary.total_tasks}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Completed Tasks</p>
                    <p className="text-2xl font-bold text-green-500">{stats.summary.completed_tasks}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Failed Tasks</p>
                    <p className="text-2xl font-bold text-red-500">{stats.summary.failed_tasks}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Cached Tasks</p>
                    <p className="text-2xl font-bold text-purple-500">{stats.summary.cached_tasks}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Tokens</p>
                    <p className="text-2xl font-bold">{stats.summary.total_tokens.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Completion Tokens</p>
                    <p className="text-2xl font-bold">{stats.summary.completion_tokens.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Avg Response Time</p>
                    <p className="text-2xl font-bold">
                      {(stats.summary.average_response_time / 1000).toFixed(2)}s
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Tokens/Second</p>
                    <p className="text-2xl font-bold">{stats.summary.tokens_per_second.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cache Performance</CardTitle>
                <CardDescription>
                  Cache hit rate and performance metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="text-center mb-4">
                    <p className="text-sm font-medium text-muted-foreground">Cache Hit Rate</p>
                    <p className="text-5xl font-bold text-blue-500">
                      {(stats.summary.cache_hit_rate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 w-full">
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">Cached Tasks</p>
                      <p className="text-2xl font-bold">{stats.summary.cached_tasks}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">Total Tasks</p>
                      <p className="text-2xl font-bold">{stats.summary.total_tasks}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Tasks Over Time</CardTitle>
              <CardDescription>
                Number of tasks processed over the selected time period
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {/* This would be a chart in a real implementation */}
              <div className="flex items-center justify-center h-full border border-dashed rounded-md">
                <div className="text-center">
                  <BarChart3 className="h-16 w-16 mx-auto text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">
                    Chart showing task counts over time would be displayed here
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Using data from {stats.time_series.length} time points with {interval} intervals
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Token Usage</CardTitle>
              <CardDescription>
                Token consumption over the selected time period
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {/* This would be a chart in a real implementation */}
              <div className="flex items-center justify-center h-full border border-dashed rounded-md">
                <div className="text-center">
                  <BarChart3 className="h-16 w-16 mx-auto text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">
                    Chart showing token usage over time would be displayed here
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Total tokens: {stats.summary.total_tokens.toLocaleString()}, 
                    Completion tokens: {stats.summary.completion_tokens.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
              <CardDescription>
                Response time and tokens per second over time
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {/* This would be a chart in a real implementation */}
              <div className="flex items-center justify-center h-full border border-dashed rounded-md">
                <div className="text-center">
                  <Zap className="h-16 w-16 mx-auto text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">
                    Chart showing performance metrics over time would be displayed here
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Average response time: {(stats.summary.average_response_time / 1000).toFixed(2)}s, 
                    Tokens per second: {stats.summary.tokens_per_second.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Raw Data</CardTitle>
              <CardDescription>
                Time series data points for the selected period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-4">Timestamp</th>
                      <th className="text-right py-2 px-4">Total Tasks</th>
                      <th className="text-right py-2 px-4">Completed</th>
                      <th className="text-right py-2 px-4">Failed</th>
                      <th className="text-right py-2 px-4">Cached</th>
                      <th className="text-right py-2 px-4">Total Tokens</th>
                      <th className="text-right py-2 px-4">Avg Duration (ms)</th>
                      <th className="text-right py-2 px-4">Tokens/Second</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.time_series.map((point: TimeSeriesDataPoint, index: number) => (
                      <tr key={index} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-4">
                          {new Date(point.timestamp).toLocaleString()}
                        </td>
                        <td className="text-right py-2 px-4">{point.total_tasks}</td>
                        <td className="text-right py-2 px-4">{point.completed_tasks}</td>
                        <td className="text-right py-2 px-4">{point.failed_tasks}</td>
                        <td className="text-right py-2 px-4">{point.cached_tasks}</td>
                        <td className="text-right py-2 px-4">{point.total_tokens}</td>
                        <td className="text-right py-2 px-4">{point.avg_duration_ms}</td>
                        <td className="text-right py-2 px-4">{point.tokens_per_second.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 flex flex-col items-center justify-center h-40">
            <AlertCircle className="h-10 w-10 text-red-500 mb-4" />
            <p className="text-muted-foreground text-lg">Statistics not available</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 