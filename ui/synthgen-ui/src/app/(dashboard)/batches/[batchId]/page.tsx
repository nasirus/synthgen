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
    <div className="container p-0 mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Button variant="ghost" onClick={navigateBack} className="mr-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Batches
          </Button>
          <h1 className="text-2xl font-bold">Batch Details</h1>
        </div>
        <RefreshControl />
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="hover:bg-accent transition-colors cursor-pointer" onClick={navigateToTasks}>
          <CardContent className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold mb-1">View Tasks</h3>
              <p className="text-muted-foreground">View all tasks in this batch with filtering options</p>
            </div>
            <ClipboardList className="h-10 w-10 text-primary opacity-80" />
          </CardContent>
        </Card>

        <Card className="hover:bg-accent transition-colors cursor-pointer" onClick={navigateToStats}>
          <CardContent className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold mb-1">View Statistics</h3>
              <p className="text-muted-foreground">See detailed batch performance statistics</p>
            </div>
            <BarChart className="h-10 w-10 text-primary opacity-80" />
          </CardContent>
        </Card>
      </div>

      {batchError && (
        <Card className="mb-4 border-red-500">
          <CardContent className="p-4">
            <div className="flex items-center text-red-500">
              <AlertCircle className="mr-2 h-5 w-5" />
              <p>{batchError.message || "Failed to fetch batch details"}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {batchLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : batch ? (
        <div className="space-y-4">
          {/* Status and Progress Card */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle>Status & Progress</CardTitle>
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {batch.duration ? (() => {
                      const totalSeconds = batch.duration;
                      const hours = Math.floor(totalSeconds / 3600);
                      const minutes = Math.floor((totalSeconds % 3600) / 60);
                      const seconds = totalSeconds % 60;
                      return `Duration: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    })() : 'Duration: 00:00:00'}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-2">
                <div className="text-2xl font-bold">{Math.round(calculateProgress())}%</div>
                <div>{getStatusBadge(batch.batch_status as TaskStatus)}</div>
              </div>
              <Progress value={calculateProgress()} className="h-2 mb-4" />

              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Tasks</p>
                  <p className="text-2xl font-bold">{batch.total_tasks.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold text-green-500">{batch.completed_tasks.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-amber-500">{batch.pending_tasks?.toLocaleString() || "0"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Task Statistics Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Task Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Completed</p>
                  <p className="text-xl font-bold text-green-500">{batch.completed_tasks.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Failed</p>
                  <p className="text-xl font-bold text-red-500">{batch.failed_tasks?.toLocaleString() || "0"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Pending</p>
                  <p className="text-xl font-bold text-purple-500">
                    {batch.pending_tasks?.toLocaleString() || "0"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Processing</p>
                  <p className="text-xl font-bold text-amber-500">{batch.processing_tasks?.toLocaleString() || '0'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Cached</p>
                  <p className="text-xl font-bold text-blue-500">
                    {batch.cached_tasks?.toLocaleString() || "0"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Token Statistics Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Token Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6 text-center">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Tokens</p>
                  <p className="text-2xl font-bold">{batch.total_tokens?.toLocaleString() || '0'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Prompt Tokens</p>
                  <p className="text-2xl font-bold text-blue-500">{batch.prompt_tokens?.toLocaleString() || '0'}</p>
                  <p className="text-xs text-muted-foreground">
                    {batch.total_tokens ?
                      `${Math.round((batch.prompt_tokens || 0) / batch.total_tokens * 100)}%` : '0%'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Completion Tokens</p>
                  <p className="text-2xl font-bold text-indigo-500">{batch.completion_tokens?.toLocaleString() || '0'}</p>
                  <p className="text-xs text-muted-foreground">
                    {batch.total_tokens ?
                      `${Math.round((batch.completion_tokens || 0) / batch.total_tokens * 100)}%` : '0%'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Created At</p>
                  <p className="text-base font-bold">{new Date(batch.created_at).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(batch.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Started At</p>
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
                  <p className="text-sm font-medium text-muted-foreground">Completed At</p>
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
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center h-40">
            <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
            <p className="text-lg text-muted-foreground">Batch not found</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 