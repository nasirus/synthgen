"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, BarChart, Check, Clock, ClipboardList, TrendingUp, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { TaskStatus } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { useBatch } from "@/lib/hooks";
import { RefreshControl } from "@/components/ui/refresh-control";
import { useRefreshContext, useRefreshTrigger } from "@/contexts/refresh-context";
import { LabelList, Pie, PieChart, Cell, Label } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export default function BatchDetailPage({ params }: { params: { batchId: string } }) {
  // Unwrap params using React.use()
  const unwrappedParams = React.use(params as unknown as Promise<{ batchId: string }>);
  const batchId = unwrappedParams.batchId;

  const router = useRouter();
  useRefreshContext();
  const { refreshInterval } = useRefreshTrigger();

  // Use SWR hooks for data fetching with auto-refresh
  const {
    data: batch,
    error: batchError,
    isLoading: batchLoading } = useBatch(batchId, {
      // Use the refresh interval from the global context
      refreshInterval: refreshInterval,
    });

  const navigateToTasks = () => {
    router.push(`/batches/${batchId}/tasks`);
  };

  const navigateToStats = () => {
    router.push(`/batches/${batchId}/stats`);
  };

  const navigateBack = () => {
    router.push("/batches");
  };

  const getStatusBadge = (status: TaskStatus) => {
    return <StatusBadge status={status} />;
  };

  const calculateProgress = () => {
    if (!batch) return 0;
    return batch.total_tasks > 0
      ? ((batch.completed_tasks + batch.cached_tasks) / batch.total_tasks) * 100
      : 0;
  };

  // Generate pie chart data from batch task statistics
  const getTaskChartData = () => {
    if (!batch) return [];

    return [
      { status: "completed", count: batch.completed_tasks, fill: "hsl(var(--chart-1))" },
      { status: "failed", count: batch.failed_tasks || 0, fill: "hsl(var(--chart-2))" },
      { status: "pending", count: batch.pending_tasks || 0, fill: "hsl(var(--chart-3))" },
      { status: "processing", count: batch.processing_tasks || 0, fill: "hsl(var(--chart-4))" },
      { status: "cached", count: batch.cached_tasks || 0, fill: "hsl(var(--chart-5))" },
    ].filter(item => item.count > 0); // Only include statuses with tasks
  };

  // Chart configuration for the task statistics pie chart
  const taskChartConfig: ChartConfig = {
    count: {
      label: "Tasks",
    },
    completed: {
      label: "Completed",
      color: "hsl(142, 76%, 36%)", // Green
    },
    failed: {
      label: "Failed",
      color: "hsl(0, 84%, 60%)", // Red
    },
    pending: {
      label: "Pending",
      color: "hsl(38, 92%, 50%)", // Amber
    },
    processing: {
      label: "Processing",
      color: "hsl(217, 91%, 60%)", // Blue
    },
    cached: {
      label: "Cached",
      color: "hsl(271, 91%, 65%)", // Purple
    },
  };

  // Generate pie chart data for token usage
  const getTokenChartData = () => {
    if (!batch || !batch.total_tokens) return [];

    return [
      { type: "prompt", count: batch.prompt_tokens || 0, fill: "hsl(var(--chart-1))" },
      { type: "completion", count: batch.completion_tokens || 0, fill: "hsl(var(--chart-2))" },
    ].filter(item => item.count > 0);
  };

  // Chart configuration for the token usage pie chart
  const tokenChartConfig: ChartConfig = {
    count: {
      label: "Tokens",
    },
    prompt: {
      label: "Prompt",
      color: "hsl(216, 100%, 50%)", // Blue
    },
    completion: {
      label: "Completion",
      color: "hsl(262, 100%, 50%)", // Indigo
    },
  };

  return (
    <div className="container mx-auto p-0 max-w-full">
      {/* Header with navigation */}
      <div className="flex items-center justify-between border-b pb-2 mb-3">
        <div className="flex items-center">
          <Button variant="ghost" onClick={navigateBack} size="sm" className="px-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-xl font-bold">Batch Details</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={navigateToTasks} size="sm" variant="outline" className="h-8">
            <ClipboardList className="h-4 w-4 mr-1" /> Tasks
          </Button>
          <Button onClick={navigateToStats} size="sm" variant="outline" className="h-8">
            <BarChart className="h-4 w-4 mr-1" /> Statistics
          </Button>
          <RefreshControl />
        </div>
      </div>

      {batchError && (
        <div className="bg-destructive/10 text-destructive text-sm px-3 py-1 rounded-md mb-3 flex items-center">
          <AlertCircle className="h-4 w-4 mr-1" />
          {batchError.message || "Failed to fetch batch details"}
        </div>
      )}

      {batchLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : batch ? (

        <div className="flex justify-between gap-4 px-6 py-4 w-full">
          <div className="w-1/3">
            {/* Task Statistics Card with Pie Chart */}
            <Card className="shadow-sm h-full bg-background/30 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-base font-semibold">Task Statistics</div>
                </div>
                <ChartContainer
                  config={taskChartConfig}
                  className="mx-auto aspect-square max-h-[200px] [&_.recharts-text]:fill-foreground"
                >
                  <PieChart>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          nameKey="status"
                          formatter={(value, name, entry) => (
                            <div className="flex items-center justify-between w-full">
                              <span className="capitalize">{name}</span>
                              <span className="ml-2 font-medium">{value}</span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Pie
                      data={getTaskChartData()}
                      dataKey="count"
                      nameKey="status"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      strokeWidth={1}
                      stroke="hsl(var(--background))"
                    >
                      {getTaskChartData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                      <Label
                        content={({ viewBox }) => {
                          if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                            return (
                              <text
                                x={viewBox.cx}
                                y={viewBox.cy}
                                textAnchor="middle"
                                dominantBaseline="middle"
                              >
                                <tspan
                                  x={viewBox.cx}
                                  y={viewBox.cy}
                                  className="fill-foreground text-3xl font-bold"
                                >
                                  {batch.total_tasks.toLocaleString()}
                                </tspan>
                                <tspan
                                  x={viewBox.cx}
                                  y={(viewBox.cy || 0) + 24}
                                  className="fill-muted-foreground text-xs"
                                >
                                  Tasks
                                </tspan>
                              </text>
                            )
                          }
                          return null;
                        }}
                      />
                    </Pie>
                  </PieChart>
                </ChartContainer>

                <div className="flex flex-wrap gap-4 mt-4">
                  {getTaskChartData().map((entry, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.fill }} />
                      <span className="text-xs capitalize">{entry.status}</span>
                      <span className="text-xs font-medium ml-1">{entry.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="w-1/3">
            {/* Token Usage Card */}
            <Card className="shadow-sm h-full bg-background/30 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-base font-semibold">Token Usage</div>
                </div>

                <ChartContainer
                  config={tokenChartConfig}
                  className="mx-auto aspect-square max-h-[200px] [&_.recharts-text]:fill-foreground"
                >
                  <PieChart>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          nameKey="type"
                          formatter={(value, name, entry) => (
                            <div className="flex items-center justify-between w-full">
                              <span className="capitalize">{name}</span>
                              <span className="ml-2 font-medium">{value.toLocaleString()}</span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Pie
                      data={getTokenChartData()}
                      dataKey="count"
                      nameKey="type"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      strokeWidth={1}
                      stroke="hsl(var(--background))"
                    >
                      {getTokenChartData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                      <Label
                        content={({ viewBox }) => {
                          if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                            return (
                              <text
                                x={viewBox.cx}
                                y={viewBox.cy}
                                textAnchor="middle"
                                dominantBaseline="middle"
                              >
                                <tspan
                                  x={viewBox.cx}
                                  y={viewBox.cy}
                                  className="fill-foreground text-3xl font-bold"
                                >
                                  {(batch.total_tokens || 0).toLocaleString()}
                                </tspan>
                                <tspan
                                  x={viewBox.cx}
                                  y={(viewBox.cy || 0) + 24}
                                  className="fill-muted-foreground text-xs"
                                >
                                  Tokens
                                </tspan>
                              </text>
                            )
                          }
                          return null;
                        }}
                      />
                    </Pie>
                  </PieChart>
                </ChartContainer>

                <div className="flex flex-wrap gap-4 mt-4">
                  {getTokenChartData().map((entry, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.fill }} />
                      <span className="text-xs capitalize">{entry.type}</span>
                      <span className="text-xs font-medium ml-1">{entry.count.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground">
                        ({batch.total_tokens ? `${Math.round(entry.count / batch.total_tokens * 100)}%` : '0%'})
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="w-1/3">
            {/* Batch Execution Timeline Card */}
            <Card className="shadow-sm h-full bg-background/30 border-border/50">
              <CardContent className="pt-4 px-4 flex flex-col h-full">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-base font-semibold">Batch Lifecycle</div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(batch.batch_status as TaskStatus)}
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Completion</span>
                    <span className="text-sm font-bold">{Math.round(calculateProgress())}%</span>
                  </div>
                  <Progress value={calculateProgress()} className="h-2 w-full" />
                </div>

                <div className="grid grid-cols-1 gap-2 mt-auto">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Created</span>
                    <span className="text-sm font-medium">{new Date(batch.created_at).toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Started</span>
                    <span className="text-sm font-medium">
                      {batch.started_at ? new Date(batch.started_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Completed</span>
                    <span className="text-sm font-medium">
                      {batch.completed_at ? new Date(batch.completed_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>

                  <div className="flex-1 flex items-center justify-center my-2">
                    <div className="relative bg-black/20 rounded-lg overflow-hidden w-full">
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg"></div>
                      <div className="relative p-3 flex items-center justify-center">
                        <div className="mr-3 flex-shrink-0">
                          <div className="p-2 rounded-full bg-primary/20 backdrop-blur-sm">
                            <Clock className="h-5 w-5 text-primary" />
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium text-center">
                            Total Duration
                          </div>
                          <div className="font-mono font-bold text-lg text-center">
                            {batch.duration ? (() => {
                              const totalSeconds = batch.duration;
                              const hours = Math.floor(totalSeconds / 3600);
                              const minutes = Math.floor((totalSeconds % 3600) / 60);
                              const seconds = totalSeconds % 60;
                              return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                            })() : '00:00:00'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-4">
          <AlertCircle className="h-6 w-6 text-destructive mb-2" />
          <p className="text-sm text-muted-foreground">Batch not found</p>
        </div>
      )}
    </div>
  );
} 