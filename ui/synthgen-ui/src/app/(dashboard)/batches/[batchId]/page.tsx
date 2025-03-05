"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, BarChart, Clock, ClipboardList } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Progress } from "@/components/ui/progress";
import { TaskStatus } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { useBatch } from "@/lib/hooks";
import { RefreshControl } from "@/components/ui/refresh-control";
import { useRefreshContext, useRefreshTrigger } from "@/contexts/refresh-context";

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

  return (
    <div className="container p-0 mx-auto max-w-screen-2xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <Button variant="ghost" onClick={navigateBack} size="sm" className="mr-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-xl font-bold">Batch Details</h1>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={navigateToTasks} className="flex items-center">
            <ClipboardList className="h-4 w-4 mr-1" />
            Tasks
          </Button>
          <Button variant="outline" size="sm" onClick={navigateToStats} className="flex items-center">
            <BarChart className="h-4 w-4 mr-1" />
            Statistics
          </Button>
          <RefreshControl />
        </div>
      </div>

      {batchError && (
        <div className="mb-3 p-2 bg-destructive/10 border border-destructive text-destructive rounded-md flex items-center">
          <AlertCircle className="mr-2 h-4 w-4" />
          <p className="text-sm">{batchError.message || "Failed to fetch batch details"}</p>
        </div>
      )}

      {batchLoading ? (
        <div className="grid grid-cols-1 gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : batch ? (
        <div className="grid grid-cols-1 gap-3">
          {/* Status and Progress Card - More compact */}
          <Card className="shadow-sm">
            <CardContent className="p-3">
              <div className="flex justify-between items-center mb-1">
                <div className="text-base font-medium">Status & Progress</div>
                <div className="flex items-center space-x-2 text-xs">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {batch.duration ? (() => {
                      const totalSeconds = batch.duration;
                      const hours = Math.floor(totalSeconds / 3600);
                      const minutes = Math.floor((totalSeconds % 3600) / 60);
                      const seconds = totalSeconds % 60;
                      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    })() : '00:00:00'}
                  </span>
                  {getStatusBadge(batch.batch_status as TaskStatus)}
                </div>
              </div>
              <div className="flex items-center gap-1 mb-1">
                <div className="text-sm font-medium">{Math.round(calculateProgress())}%</div>
                <Progress value={calculateProgress()} className="h-2 flex-1" />
              </div>

              <div className="grid grid-cols-3 text-center mt-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total</p>
                  <p className="text-base font-bold">{batch.total_tasks.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Completed</p>
                  <p className="text-base font-bold text-green-500">{batch.completed_tasks.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Pending</p>
                  <p className="text-base font-bold text-amber-500">{batch.pending_tasks?.toLocaleString() || "0"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Task Statistics Card - More compact */}
          <Card className="shadow-sm">
            <CardContent className="p-3">
              <div className="text-base font-medium mb-1">Task Statistics</div>
              <div className="grid grid-cols-5 text-center gap-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Completed</p>
                  <p className="text-sm font-bold text-green-500">{batch.completed_tasks.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Failed</p>
                  <p className="text-sm font-bold text-red-500">{batch.failed_tasks?.toLocaleString() || "0"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Pending</p>
                  <p className="text-sm font-bold text-purple-500">{batch.pending_tasks?.toLocaleString() || "0"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Processing</p>
                  <p className="text-sm font-bold text-amber-500">{batch.processing_tasks?.toLocaleString() || '0'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Cached</p>
                  <p className="text-sm font-bold text-blue-500">{batch.cached_tasks?.toLocaleString() || "0"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Token Usage and Timeline combined for compactness */}
          <div className="grid grid-cols-2 gap-3">
            {/* Token Statistics Card */}
            <Card className="shadow-sm">
              <CardContent className="p-3">
                <div className="text-base font-medium mb-1">Token Usage</div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="text-sm font-bold">{batch.total_tokens?.toLocaleString() || '0'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Prompt</span>
                    <span className="text-sm font-bold text-blue-500">{batch.prompt_tokens?.toLocaleString() || '0'} 
                      <span className="text-xs text-muted-foreground ml-1">
                        {batch.total_tokens ? `(${Math.round((batch.prompt_tokens || 0) / batch.total_tokens * 100)}%)` : '(0%)'}
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Completion</span>
                    <span className="text-sm font-bold text-indigo-500">{batch.completion_tokens?.toLocaleString() || '0'}
                      <span className="text-xs text-muted-foreground ml-1">
                        {batch.total_tokens ? `(${Math.round((batch.completion_tokens || 0) / batch.total_tokens * 100)}%)` : '(0%)'}
                      </span>
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Timeline Card */}
            <Card className="shadow-sm">
              <CardContent className="p-3">
                <div className="text-base font-medium mb-1">Timeline</div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Created</span>
                    <span className="text-xs">
                      {new Date(batch.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Started</span>
                    <span className="text-xs">
                      {batch.started_at ? new Date(batch.started_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Completed</span>
                    <span className="text-xs">
                      {batch.completed_at ? new Date(batch.completed_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="p-4 flex flex-col items-center justify-center h-40 border rounded-md">
          <AlertCircle className="h-8 w-8 text-red-500 mb-2" />
          <p className="text-muted-foreground">Batch not found</p>
        </div>
      )}
    </div>
  );
} 