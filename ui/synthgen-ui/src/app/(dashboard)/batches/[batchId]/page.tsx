"use client";

import { useEffect, useState } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, CheckCircle, Clock, BarChart } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Batch, Task, TaskStatus } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { useBatch, useBatchTasks } from "@/lib/hooks";
import { Badge } from "@/components/ui/badge";
import { RefreshControl } from "@/components/ui/refresh-control";
import { useRefreshContext } from "@/contexts/refresh-context";

export default function BatchDetailPage({ params }: { params: { batchId: string } }) {
  // Unwrap params using React.use()
  const unwrappedParams = React.use(params as unknown as Promise<{ batchId: string }>);
  const batchId = unwrappedParams.batchId;

  const [activeTab, setActiveTab] = useState("overview");
  // Use the TaskStatus type for better type safety
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("COMPLETED");
  const router = useRouter();
  const { refreshNow } = useRefreshContext();

  // Use SWR hooks for data fetching with auto-refresh
  const {
    data: batch,
    error: batchError,
    isLoading: batchLoading,
    isValidating: batchValidating,
    mutate: refreshBatch
  } = useBatch(batchId);

  const {
    data: tasksData,
    error: tasksError,
    isLoading: tasksLoading,
    isValidating: tasksValidating,
    mutate: refreshTasks
  } = useBatchTasks(batchId, taskStatus, {
    // Still use conditional fetching for tasks to reduce API calls
    refreshInterval: activeTab === "tasks" ? undefined : 0,
  });

  // Extract tasks from the response
  const tasks = tasksData?.tasks || [];

  // Effect to only fetch tasks when tab is active
  useEffect(() => {
    if (activeTab !== "tasks") return;
    refreshTasks();
  }, [activeTab, taskStatus, refreshTasks]);

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
      ? (batch.completed_tasks / batch.total_tasks) * 100
      : 0;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button variant="ghost" onClick={navigateBack} className="mr-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Batches
          </Button>
          <h1 className="text-3xl font-bold">Batch Details</h1>
        </div>
        <RefreshControl />
      </div>

      {batchError && (
        <Card className="mb-6 border-red-500">
          <CardContent className="pt-6">
            <div className="flex items-center text-red-500">
              <AlertCircle className="mr-2" />
              <p>{batchError.message || "Failed to fetch batch details"}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {batchLoading ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-4 w-1/4 mt-2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        </div>
      ) : batch ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <CardTitle>Batch Information</CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Batch ID</p>
                    <p className="text-lg font-semibold">{batch.batch_id}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Created At</p>
                    <p className="text-lg font-semibold">{new Date(batch.created_at).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(batch.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                    <div className="mt-1">
                      {/* Use batch_status directly */}
                      {getStatusBadge(batch.batch_status as TaskStatus)}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Progress</p>
                    <div className="mt-2">
                      <Progress value={calculateProgress()} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-1">
                        {batch.completed_tasks} / {batch.total_tasks} tasks completed ({Math.round(calculateProgress())}%)
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="h-full flex flex-col">
              <CardHeader>
                <CardTitle>Task Statistics</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="space-y-4 flex-1">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Tasks</p>
                      <p className="text-3xl font-bold">{batch.total_tasks.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Pending Tasks</p>
                      <p className="text-3xl font-bold text-blue-500">
                        {batch.pending_tasks?.toLocaleString() || "0"}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Completed Tasks</p>
                      <p className="text-3xl font-bold text-green-500">{batch.completed_tasks.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Failed Tasks</p>
                      <p className="text-3xl font-bold text-red-500">{batch.failed_tasks?.toLocaleString() || "0"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Cached Tasks</p>
                      <p className="text-3xl font-bold text-blue-500">
                        {batch.cached_tasks?.toLocaleString() || "0"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Processing Tasks</p>
                      <p className="text-2xl font-bold text-amber-500">{batch.processing_tasks?.toLocaleString() || '0'}</p>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={navigateToStats}
                  className="w-full mt-6"
                  variant="outline"
                >
                  <BarChart className="mr-2 h-4 w-4" />
                  View Detailed Statistics
                </Button>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <Card>
                <CardHeader>
                  <CardTitle>Batch Overview</CardTitle>
                  <CardDescription>Summary of the batch processing</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-4">Timeline</h3>
                      <div className="grid grid-cols-4 gap-6">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Duration</p>
                          <p className="text-2xl font-bold">
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
                          <p className="text-sm font-medium text-muted-foreground">Created At</p>
                          <p className="text-2xl font-bold">{new Date(batch.created_at).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(batch.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Started At</p>
                          <p className="text-2xl font-bold">
                            {batch.started_at ? new Date(batch.started_at).toLocaleString() : 'N/A'}
                          </p>
                          {batch.started_at && (
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(batch.started_at), { addSuffix: true })}
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Completed At</p>
                          <p className="text-2xl font-bold">
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
                    <div>
                      <h3 className="text-lg font-medium mb-4">Token Consumption</h3>
                      <div className="grid grid-cols-4 gap-6">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Total Tokens</p>
                          <p className="text-2xl font-bold">{batch.total_tokens?.toLocaleString() || '0'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Prompt Tokens</p>
                          <p className="text-2xl font-bold">{batch.prompt_tokens?.toLocaleString() || '0'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Completion Tokens</p>
                          <p className="text-2xl font-bold">{batch.completion_tokens?.toLocaleString() || '0'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Check for model_config as a property of any type on batch */}
                    {(batch as any).model_config && (
                      <div>
                        <h3 className="text-lg font-medium mb-4">Model Configuration</h3>
                        <div className="bg-secondary/50 rounded-lg p-4">
                          <pre className="text-sm overflow-auto whitespace-pre-wrap">
                            {JSON.stringify((batch as any).model_config, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Check for metadata as a property of any type on batch */}
                    {(batch as any).metadata && (
                      <div>
                        <h3 className="text-lg font-medium mb-4">Metadata</h3>
                        <div className="bg-secondary/50 rounded-lg p-4">
                          <pre className="text-sm overflow-auto whitespace-pre-wrap">
                            {JSON.stringify((batch as any).metadata, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="tasks">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Tasks</CardTitle>
                      <CardDescription>List of tasks in this batch</CardDescription>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant={taskStatus === "COMPLETED" ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleStatusChange("COMPLETED")}
                      >
                        <CheckCircle className="w-3 h-3 mr-1" /> Completed
                      </Button>
                      <Button
                        variant={taskStatus === "FAILED" ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleStatusChange("FAILED")}
                      >
                        <AlertCircle className="w-3 h-3 mr-1" /> Failed
                      </Button>
                      <Button
                        variant={taskStatus === "PROCESSING" ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleStatusChange("PROCESSING")}
                      >
                        <Clock className="w-3 h-3 mr-1" /> Processing
                      </Button>
                      <Button
                        variant={taskStatus === "PENDING" ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleStatusChange("PENDING")}
                      >
                        <Clock className="w-3 h-3 mr-1" /> Pending
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Current filter status and updating indicator */}
                  <div className="mb-2 flex justify-between items-center">
                    <div className="text-sm text-muted-foreground">
                      Current filter: <code>{taskStatus}</code>
                    </div>
                    {tasksValidating && (
                      <Badge variant="outline" className="ml-4 text-xs bg-blue-500/10">
                        Updating tasks...
                      </Badge>
                    )}
                  </div>

                  {tasksLoading ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : tasksError ? (
                    <div className="text-center py-8">
                      <AlertCircle className="mx-auto h-8 w-8 text-red-500 mb-2" />
                      <p className="text-muted-foreground">Error loading tasks</p>
                    </div>
                  ) : tasks.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No {taskStatus.toLowerCase()} tasks found</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Task ID</TableHead>
                          <TableHead>Created At</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Tokens</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tasks.map((task) => (
                          <TableRow key={task.message_id}>
                            <TableCell className="font-medium">{task.message_id}</TableCell>
                            <TableCell>
                              {new Date(task.created_at).toLocaleString()}
                              <div className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                              </div>
                            </TableCell>
                            <TableCell>{getStatusBadge(task.status as TaskStatus)}</TableCell>
                            <TableCell>
                              {task.duration_ms ? `${(task.duration_ms / 1000).toFixed(2)}s` : 'N/A'}
                            </TableCell>
                            <TableCell>
                              {task.completions?.usage?.total_tokens || 'N/A'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 flex flex-col items-center justify-center h-40">
            <AlertCircle className="h-10 w-10 text-red-500 mb-4" />
            <p className="text-muted-foreground text-lg">Batch not found</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 