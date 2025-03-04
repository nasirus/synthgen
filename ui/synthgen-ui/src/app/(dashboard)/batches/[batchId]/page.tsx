"use client";

import { useEffect, useState } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, CheckCircle, Clock, BarChart, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { TaskStatus } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { useBatch, useBatchTasks } from "@/lib/hooks";
import { RefreshControl } from "@/components/ui/refresh-control";
import { useRefreshContext, useRefreshTrigger } from "@/contexts/refresh-context";

export default function BatchDetailPage({ params }: { params: { batchId: string } }) {
  // Unwrap params using React.use()
  const unwrappedParams = React.use(params as unknown as Promise<{ batchId: string }>);
  const batchId = unwrappedParams.batchId;

  const [activeTab, setActiveTab] = useState("overview");
  // Use the TaskStatus type for better type safety
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("COMPLETED");
  const router = useRouter();
  useRefreshContext();
  // Get refresh interval from context to use in our SWR config
  const { refreshInterval } = useRefreshTrigger();

  // Use SWR hooks for data fetching with auto-refresh
  const {
    data: batch,
    error: batchError,
    isLoading: batchLoading } = useBatch(batchId);

  const {
    data: tasksData,
    error: tasksError,
    isLoading: tasksLoading,
    isValidating: tasksValidating,
    mutate: refreshTasks
  } = useBatchTasks(batchId, taskStatus, {
    // Use the refresh interval from the global context
    refreshInterval: activeTab === "tasks" ? refreshInterval : 0,
    // These options should let the SWR cache work properly with our refresh context
    revalidateOnFocus: true,
    revalidateIfStale: true,
    // Don't dedupe too aggressively so we can see updates
    dedupingInterval: 1000,
  });

  // Access tasks directly without useMemo since we're not transforming the data
  const tasks = tasksData?.tasks || [];

  // Only fetch tasks when tab is active
  useEffect(() => {
    if (activeTab === "tasks") {
      refreshTasks();
    }
  }, [activeTab, taskStatus]);

  const handleStatusChange = (status: TaskStatus) => {
    setTaskStatus(status);
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

  return (
    <div className="container p-0 mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <Button variant="ghost" onClick={navigateBack} className="mr-2 p-2">
            <ArrowLeft className="h-4 w-4" />
            <span className="ml-1">Back</span>
          </Button>
        </div>
        <RefreshControl />
      </div>

      {batchError && (
        <Card className="mb-2 border-red-500">
          <CardContent className="p-2">
            <div className="flex items-center text-red-500">
              <AlertCircle className="mr-2 h-4 w-4" />
              <p className="text-sm">{batchError.message || "Failed to fetch batch details"}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {batchLoading ? (
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : batch ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {/* Batch Information Card */}
            <Card className="h-auto">
              <CardHeader className="p-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Batch Information</CardTitle>
                  
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Duration</p>
                    <p className="font-semibold">
                      {batch.duration ? (() => {
                        const totalSeconds = batch.duration;
                        const hours = Math.floor(totalSeconds / 3600);
                        const minutes = Math.floor((totalSeconds % 3600) / 60);
                        const seconds = totalSeconds % 60;
                        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                      })() : '00:00:00'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Status</p>
                    <div className="mt-1">
                      {getStatusBadge(batch.batch_status as TaskStatus)}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Progress</p>
                    <div className="mt-1">
                      <Progress value={calculateProgress()} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-1">
                        {batch.completed_tasks + batch.cached_tasks} / {batch.total_tasks} tasks ({Math.round(calculateProgress())}%)
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Task Statistics Card */}
            <Card className="h-auto">
              <CardHeader className="p-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Task Statistics</CardTitle>
                  <Button
                    onClick={navigateToStats}
                    variant="outline"
                    size="sm"
                  >
                    <BarChart className="mr-1 h-3 w-3" />
                    View Statistics
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="grid grid-cols-6 gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Total</p>
                    <p className="text-lg font-bold">{batch.total_tasks.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Pending</p>
                    <p className="text-lg font-bold text-purple-500">
                      {batch.pending_tasks?.toLocaleString() || "0"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Completed</p>
                    <p className="text-lg font-bold text-green-500">{batch.completed_tasks.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Failed</p>
                    <p className="text-lg font-bold text-red-500">{batch.failed_tasks?.toLocaleString() || "0"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Cached</p>
                    <p className="text-lg font-bold text-blue-500">
                      {batch.cached_tasks?.toLocaleString() || "0"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Processing</p>
                    <p className="text-lg font-bold text-amber-500">{batch.processing_tasks?.toLocaleString() || '0'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Token Statistics Card - NEW */}
            <Card className="h-auto">
              <CardHeader className="p-3">
                <CardTitle className="text-base">Token Statistics</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Total Tokens</p>
                    <p className="text-lg font-bold">{batch.total_tokens?.toLocaleString() || '0'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Prompt Tokens</p>
                    <p className="font-bold">{batch.prompt_tokens?.toLocaleString() || '0'}</p>
                    <p className="text-xs text-muted-foreground">
                      {batch.total_tokens ?
                        `${Math.round((batch.prompt_tokens || 0) / batch.total_tokens * 100)}%` : '0%'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Completion Tokens</p>
                    <p className="font-bold">{batch.completion_tokens?.toLocaleString() || '0'}</p>
                    <p className="text-xs text-muted-foreground">
                      {batch.total_tokens ?
                        `${Math.round((batch.completion_tokens || 0) / batch.total_tokens * 100)}%` : '0%'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="m-0 p-0">
              <Card>
                <CardHeader className="p-3">
                  <CardTitle className="text-base">Batch Overview</CardTitle>
                  <CardDescription className="text-xs">Summary of the batch processing</CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="space-y-3">
                    {/* Timeline section */}
                    <div>
                      <h3 className="text-sm font-medium mb-2">Timeline</h3>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Created At</p>
                          <p className="text-base font-bold">{new Date(batch.created_at).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(batch.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Started At</p>
                          <p className="text-base font-bold">
                            {batch.started_at ? new Date(batch.started_at).toLocaleString() : 'N/A'}
                          </p>
                          {batch.started_at && (
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(batch.started_at), { addSuffix: true })}
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Completed At</p>
                          <p className="text-base font-bold">
                            {batch.completed_at ? new Date(batch.completed_at).toLocaleString() : 'N/A'}
                          </p>
                          {batch.completed_at && (
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(batch.completed_at), { addSuffix: true })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Model configuration and metadata in collapsible sections */}
                    {(batch as any).model_config && (
                      <details className="text-sm">
                        <summary className="cursor-pointer font-medium mb-1">Model Configuration</summary>
                        <div className="bg-secondary/50 rounded-lg p-2">
                          <pre className="text-xs overflow-auto whitespace-pre-wrap max-h-20">
                            {JSON.stringify((batch as any).model_config, null, 2)}
                          </pre>
                        </div>
                      </details>
                    )}

                    {(batch as any).metadata && (
                      <details className="text-sm">
                        <summary className="cursor-pointer font-medium mb-1">Metadata</summary>
                        <div className="bg-secondary/50 rounded-lg p-2">
                          <pre className="text-xs overflow-auto whitespace-pre-wrap max-h-20">
                            {JSON.stringify((batch as any).metadata, null, 2)}
                          </pre>
                        </div>
                      </details>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tasks" className="m-0 p-0">
              <Card>
                <CardHeader className="p-3">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                    <div>
                      <CardTitle className="text-base">Tasks</CardTitle>
                      <CardDescription className="text-xs">List of tasks in this batch</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant={taskStatus === "COMPLETED" ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => handleStatusChange("COMPLETED")}
                      >
                        <CheckCircle className="w-3 h-3 mr-1" /> Completed
                      </Button>
                      <Button
                        variant={taskStatus === "FAILED" ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => handleStatusChange("FAILED")}
                      >
                        <AlertCircle className="w-3 h-3 mr-1" /> Failed
                      </Button>
                      <Button
                        variant={taskStatus === "PROCESSING" ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => handleStatusChange("PROCESSING")}
                      >
                        <Clock className="w-3 h-3 mr-1" /> Processing
                      </Button>
                      <Button
                        variant={taskStatus === "PENDING" ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => handleStatusChange("PENDING")}
                      >
                        <Clock className="w-3 h-3 mr-1" /> Pending
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-2">
                  {/* Updating indicator */}
                  {tasksValidating && (
                    <Badge variant="outline" className="mb-1 text-xs bg-blue-500/10">
                      Updating tasks...
                    </Badge>
                  )}

                  {tasksLoading ? (
                    <div className="space-y-1">
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))}
                    </div>
                  ) : tasksError ? (
                    <div className="text-center py-4">
                      <AlertCircle className="mx-auto h-6 w-6 text-red-500 mb-1" />
                      <p className="text-xs text-muted-foreground">Error loading tasks</p>
                    </div>
                  ) : tasks.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-xs text-muted-foreground">No {taskStatus.toLowerCase()} tasks found</p>
                    </div>
                  ) : (
                    <div className="overflow-auto max-h-[calc(100vh-24rem)]">
                      <Table className="text-xs">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Task ID</TableHead>
                            <TableHead>Completed</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Total Tokens</TableHead>
                            <TableHead>Prompt</TableHead>
                            <TableHead>Completion</TableHead>
                            <TableHead>Cached</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tasks.map((task) => (
                            <TableRow key={task.message_id}>
                              <TableCell className="font-medium py-2 whitespace-nowrap">{task.message_id}</TableCell>
                              <TableCell className="py-2 whitespace-nowrap">
                                {task.completed_at ? new Date(task.completed_at).toLocaleString() : 'N/A'}
                                <div className="text-xs text-muted-foreground">
                                  {task.completed_at ? formatDistanceToNow(new Date(task.completed_at), { addSuffix: true }) : 'N/A'}
                                </div>
                              </TableCell>
                              <TableCell className="py-2">{getStatusBadge(task.status as TaskStatus)}</TableCell>
                              <TableCell className="py-2">
                                {task.duration ? `${(task.duration / 1000).toFixed(2)}s` : 'N/A'}
                              </TableCell>
                              <TableCell className="py-2">
                                {task.completions?.usage?.total_tokens || 'N/A'}
                              </TableCell>
                              <TableCell className="py-2">
                                {task.completions?.usage?.prompt_tokens || 'N/A'}
                              </TableCell>
                              <TableCell className="py-2">
                                {task.completions?.usage?.completion_tokens || 'N/A'}
                              </TableCell>
                              <TableCell className="py-2">
                                {task.cached ? <CheckCircle className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center h-32">
            <AlertCircle className="h-8 w-8 text-red-500 mb-2" />
            <p className="text-muted-foreground">Batch not found</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 