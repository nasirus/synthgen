"use client";

import { useEffect, useState } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, BarChart as BarChartIcon, ClipboardList, TrendingUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subDays, subHours, subMonths, subWeeks } from "date-fns";
import { UsageStatsResponse, TimeSeriesDataPoint } from "@/lib/types";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent
} from "@/components/ui/chart";
import { RefreshControl } from "@/components/ui/refresh-control";
import { useRefreshContext, useRefreshTrigger } from "@/contexts/refresh-context";
import { useBatchStats } from "@/lib/api/client";

// Import recharts components inside the component
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  XAxis,
  YAxis
} from "recharts";

export default function BatchStatsPage({ params }: { params: Promise<{ batchId: string }> }) {
  // Unwrap params using React.use()
  const unwrappedParams = React.use(params);
  const batchId = unwrappedParams.batchId;

  const [timeRange, setTimeRange] = useState("24h");
  const [interval, setInterval] = useState("1m");
  const router = useRouter();

  // Setup refresh context
  useRefreshContext();
  const { refreshInterval } = useRefreshTrigger();

  // Define chart config for Tasks Over Time chart
  const taskChartConfig = {
    completed_tasks: {
      label: "Completed",
      color: "hsl(142.1 76.2% 36.3%)",  // green-500
    },
    failed_tasks: {
      label: "Failed",
      color: "hsl(0 84.2% 60.2%)",  // red-500
    },
    cached_tasks: {
      label: "Cached",
      color: "hsl(280 100% 70%)",  // purple-500
    }
  } satisfies ChartConfig;

  // Define chart config for Token Usage chart
  const tokenChartConfig = {
    completion_tokens: {
      label: "Completion",
      color: "hsl(43, 74%, 49%)",  // amber-like color
    },
    prompt_tokens: {
      label: "Prompt",
      color: "hsl(95, 38%, 60%)",  // green-like color
    }
  } satisfies ChartConfig;

  // Define chart config for Performance Metrics chart
  const performanceChartConfig = {
    avg_duration_seconds: {
      label: "Response Time (seconds)",
      color: "hsl(25, 95%, 53%)",  // Orange color
    },
    tokens_per_second: {
      label: "Tokens Per Second",
      color: "hsl(216, 98%, 52%)",  // Blue color
    },
  } satisfies ChartConfig;

  // Use SWR hooks for data fetching with auto-refresh
  const {
    data: statsData,
    error: statsError,
    isLoading: statsLoading,
    mutate: refreshStats
  } = useBatchStats(batchId, timeRange, interval, {
    // Use the refresh interval from the global context
    refreshInterval: refreshInterval,
    // These options should let the SWR cache work properly with our refresh context
    revalidateOnFocus: true,
    revalidateIfStale: true,
    // Don't dedupe too aggressively so we can see updates
    dedupingInterval: 1000,
  });

  // Extract the stats data from the response
  const stats = statsData as UsageStatsResponse | undefined;
  const error = statsError ? (statsError as Error).message || "Failed to fetch batch statistics" : null;

  // Refresh stats when timeRange or interval changes
  useEffect(() => {
    refreshStats();
  }, [timeRange, interval, refreshStats]);

  const navigateBack = () => {
    router.push(`/batches/${batchId}`);
  };

  const navigateToOverview = () => {
    router.push(`/batches/${batchId}`);
  };

  const navigateToTasks = () => {
    router.push(`/batches/${batchId}/tasks`);
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
    { value: "1h", label: "1 Hour" },
    { value: "1d", label: "1 Day" },
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
    <div className="container p-0 mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={navigateBack} className="mr-2 p-2">
            <ArrowLeft className="h-4 w-4" />
            <span className="ml-1">Back</span>
          </Button>
          <div className="hidden sm:flex items-center ml-4 space-x-4">
            <div className="flex items-center">
              <p className="text-sm font-medium mr-2">Range:</p>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-[135px] h-8">
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
            <div className="flex items-center">
              <p className="text-sm font-medium mr-2">Interval:</p>
              <Select value={interval} onValueChange={setInterval}>
                <SelectTrigger className="w-[105px] h-8">
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
            <div className="text-[11px] text-muted-foreground">
              {formatTimeRange(timeRange)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={navigateToOverview} size="sm" variant="outline" className="h-8">
            <TrendingUp className="h-4 w-4 mr-1" /> Overview
          </Button>
          <Button onClick={() => { }} size="sm" variant="default" className="h-8">
            <BarChartIcon className="h-4 w-4 mr-1" /> Statistics
          </Button>
          <Button onClick={navigateToTasks} size="sm" variant="outline" className="h-8">
            <ClipboardList className="h-4 w-4 mr-1" /> Tasks
          </Button>
          <RefreshControl />
        </div>
      </div>

      {/* Mobile view for time controls - only visible on small screens */}
      <div className="sm:hidden flex flex-col space-y-4 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium mb-1">Time Range</p>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger>
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
              <SelectTrigger>
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
        <div className="text-sm text-muted-foreground">
          {formatTimeRange(timeRange)}
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

      {statsLoading ? (
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
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
                <CardDescription>
                  Overall statistics for the selected time period
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-4">
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
                    <p className="text-sm font-medium text-muted-foreground">Processing Tasks</p>
                    <p className="text-2xl font-bold text-amber-500">{stats.summary.processing_tasks}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Tokens</p>
                    <p className="text-2xl font-bold">{stats.summary.total_tokens.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Completion Tokens</p>
                    <p className="text-2xl font-bold">{stats.summary.total_completion_tokens.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Prompt Tokens</p>
                    <p className="text-2xl font-bold">{stats.summary.total_prompt_tokens.toLocaleString()}</p>
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
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Tasks Over Time</CardTitle>
              <CardDescription>
                Number of tasks processed over the selected time period
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.time_series.length > 0 ? (
                <ChartContainer config={taskChartConfig} className="aspect-auto h-[250px] w-full">
                  <BarChart
                    accessibilityLayer
                    data={stats.time_series.map(point => ({
                      ...point,
                      total_tasks_display: point.completed_tasks + point.failed_tasks + point.cached_tasks,
                      timestamp: new Date(point.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                      })
                    }))}
                    margin={{ top: 20, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      tickLine={false}
                      tickMargin={10}
                      axisLine={false}
                    />
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar
                      dataKey="completed_tasks"
                      stackId="a"
                      fill="var(--color-completed_tasks)"
                      radius={[0, 0, 4, 4]}
                    />
                    <Bar
                      dataKey="failed_tasks"
                      stackId="a"
                      fill="var(--color-failed_tasks)"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="cached_tasks"
                      stackId="a"
                      fill="var(--color-cached_tasks)"
                      radius={[4, 4, 0, 0]}
                    >
                      <LabelList
                        dataKey="total_tasks_display"
                        position="top"
                        formatter={(value: number) => {
                          if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                          if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
                          return value;
                        }}
                        style={{
                          fill: 'var(--foreground)',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          textShadow: '0px 0px 2px rgba(0,0,0,0.5)'
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex items-center justify-center h-[250px] border border-dashed rounded-md">
                  <div className="text-center">
                    <p className="mt-2 text-muted-foreground">
                      No data available for the selected time range
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex-col items-start gap-2 text-sm">
              {stats.summary.total_tasks > 0 && (
                <div className="flex gap-2 font-medium leading-none">
                  {stats.summary.completed_tasks.toLocaleString()} completed,
                  {stats.summary.failed_tasks.toLocaleString()} failed,
                  {stats.summary.cached_tasks.toLocaleString()} cached
                </div>
              )}
              <div className="leading-none text-muted-foreground">
                Showing task distribution over time with {interval} intervals
              </div>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Token Usage</CardTitle>
              <CardDescription>
                Token consumption over the selected time period
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.time_series.length > 0 ? (
                <ChartContainer config={tokenChartConfig} className="aspect-auto h-[250px] w-full">
                  <BarChart
                    accessibilityLayer
                    data={stats.time_series.map(point => ({
                      ...point,
                      total_tokens_display: point.prompt_tokens + point.completion_tokens,
                      timestamp: new Date(point.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                      })
                    }))}
                    margin={{ top: 20, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      tickLine={false}
                      tickMargin={10}
                      axisLine={false}
                    />
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar
                      dataKey="prompt_tokens"
                      stackId="a"
                      fill="var(--color-prompt_tokens)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="completion_tokens"
                      stackId="a"
                      fill="var(--color-completion_tokens)"
                      radius={[0, 0, 4, 4]}
                    >
                      <LabelList
                        dataKey="total_tokens_display"
                        position="top"
                        formatter={(value: number) => {
                          if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                          if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
                          return value;
                        }}
                        style={{
                          fill: 'var(--foreground)',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          textShadow: '0px 0px 2px rgba(0,0,0,0.5)'
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex items-center justify-center h-[250px] border border-dashed rounded-md">
                  <div className="text-center">
                    <p className="mt-2 text-muted-foreground">
                      No data available for the selected time range
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex-col items-start gap-2 text-sm">
              {stats.summary.total_tokens > 0 && (
                <div className="flex gap-2 font-medium leading-none">
                  Prompt: {stats.summary.total_prompt_tokens.toLocaleString()},
                  Completion: {stats.summary.total_completion_tokens.toLocaleString()},
                  Total: {stats.summary.total_tokens.toLocaleString()}
                </div>
              )}
              <div className="leading-none text-muted-foreground">
                Showing token usage over time with {interval} intervals
              </div>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
              <CardDescription>
                Response time and tokens per second over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.time_series.length > 0 ? (
                <ChartContainer
                  config={performanceChartConfig}
                  className="aspect-auto h-[300px] w-full"
                >
                  <ComposedChart
                    accessibilityLayer
                    data={stats.time_series.map(point => ({
                      ...point,
                      avg_duration_seconds: point.avg_duration_ms / 1000,
                      timestamp: new Date(point.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                      })
                    }))}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 0,
                    }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <YAxis
                      yAxisId="left"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tickFormatter={(value) => `${value.toFixed(1)}s`}
                      domain={['dataMin - 0.1', 'dataMax + 0.1']}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tickFormatter={(value) => value.toFixed(2)}
                      domain={['dataMin - 10', 'dataMax + 10']}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          indicator="line"
                          labelFormatter={(label: string) => `Time: ${label}`}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <defs>
                      <linearGradient id="fillResponseTime" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="var(--color-avg_duration_seconds)"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-avg_duration_seconds)"
                          stopOpacity={0.1}
                        />
                      </linearGradient>
                    </defs>
                    <Area
                      yAxisId="left"
                      dataKey="avg_duration_seconds"
                      type="natural"
                      fill="url(#fillResponseTime)"
                      fillOpacity={0.4}
                      stroke="var(--color-avg_duration_seconds)"
                    />
                    <Line
                      yAxisId="right"
                      dataKey="tokens_per_second"
                      type="natural"
                      stroke="var(--color-tokens_per_second)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ChartContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] border border-dashed rounded-md">
                  <div className="text-center">
                    <p className="mt-2 text-muted-foreground">
                      No data available for the selected time range
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <div className="flex w-full items-start gap-2 text-sm">
                <div className="grid gap-2">
                  <div className="flex items-center gap-2 font-medium leading-none">
                    Avg. Response Time: {stats?.summary?.average_response_time
                      ? (stats.summary.average_response_time / 1000).toFixed(2)
                      : '0.00'}s •
                    Avg. Tokens/Sec: {stats?.summary?.tokens_per_second
                      ? stats.summary.tokens_per_second.toFixed(2)
                      : '0.00'}
                  </div>
                  <div className="leading-none text-muted-foreground">
                    Showing performance metrics over time with {interval} intervals
                  </div>
                </div>
              </div>
            </CardFooter>
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
                      <th className="text-right py-2 px-4">Prompt Tokens</th>
                      <th className="text-right py-2 px-4">Completion Tokens</th>
                      <th className="text-right py-2 px-4">Avg Duration (ms)</th>
                      <th className="text-right py-2 px-4">Tokens/Second</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...stats.time_series]
                      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                      .map((point: TimeSeriesDataPoint, index: number) => (
                      <tr key={index} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-4">
                          {new Date(point.timestamp).toLocaleString()}
                        </td>
                        <td className="text-right py-2 px-4">{point.total_tasks.toLocaleString()}</td>
                        <td className="text-right py-2 px-4">{point.completed_tasks.toLocaleString()}</td>
                        <td className="text-right py-2 px-4">{point.failed_tasks.toLocaleString()}</td>
                        <td className="text-right py-2 px-4">{point.cached_tasks.toLocaleString()}</td>
                        <td className="text-right py-2 px-4">{point.total_tokens.toLocaleString()}</td>
                        <td className="text-right py-2 px-4">{point.prompt_tokens.toLocaleString()}</td>
                        <td className="text-right py-2 px-4">{point.completion_tokens.toLocaleString()}</td>
                        <td className="text-right py-2 px-4">{`${(point.avg_duration_ms / 1000).toFixed(2)}s`}</td>
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