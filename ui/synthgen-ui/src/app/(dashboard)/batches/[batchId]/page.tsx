"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, BarChart, Check, Clock, ClipboardList, X } from "lucide-react";
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
            {/* Combined Status & Task Statistics Card */}
            <Card className="shadow-sm h-full bg-background/30 border-border/50">
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-base font-semibold">Task Statistics</div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(batch.batch_status as TaskStatus)}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold">{Math.round(calculateProgress())}%</span>
                    <Progress value={calculateProgress()} className="h-2 flex-1" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Total</span>
                    <span className="text-xl font-bold">{batch.total_tasks}</span>
                  </div>

                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Completed</span>
                    <div className="flex items-center">
                      <span className="text-xl font-bold text-green-500">{batch.completed_tasks}</span>
                      <Check className="h-4 w-4 text-green-500 ml-1" />
                    </div>
                  </div>

                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Failed</span>
                    <div className="flex items-center">
                      <span className="text-xl font-bold text-red-500">{batch.failed_tasks || 0}</span>
                      <X className="h-4 w-4 text-red-500 ml-1" />
                    </div>
                  </div>

                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Pending</span>
                    <span className="text-xl font-bold text-amber-500">{batch.pending_tasks || 0}</span>
                  </div>

                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Processing</span>
                    <span className="text-xl font-bold text-blue-500">{batch.processing_tasks || 0}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Cached</span>
                    <span className="text-xl font-bold text-purple-500">{batch.cached_tasks || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="w-1/3">
            {/* Token Usage Card */}
            <Card className="shadow-sm h-full bg-background/30 border-border/50">
              <CardContent className="p-4">
                <div className="text-base font-semibold mb-3">Token Usage</div>

                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium">Total Tokens</span>
                  <span className="text-xl font-bold">{batch.total_tokens?.toLocaleString() || '0'}</span>
                </div>

                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium">Prompt Tokens</span>
                  <div className="flex items-center">
                    <span className="text-xl font-bold text-blue-500">{batch.prompt_tokens?.toLocaleString() || 0}</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      ({batch.total_tokens ? `${Math.round((batch.prompt_tokens || 0) / batch.total_tokens * 100)}%` : '0%'})
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Completion Tokens</span>
                  <div className="flex items-center">
                    <span className="text-xl font-bold text-indigo-500">{batch.completion_tokens?.toLocaleString() || 0}</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      ({batch.total_tokens ? `${Math.round((batch.completion_tokens || 0) / batch.total_tokens * 100)}%` : '0%'})
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="w-1/3">
            {/* Timeline Card */}
            <Card className="shadow-sm h-full bg-background/30 border-border/50">
              <CardContent className="p-4">
                <div className="text-base font-semibold mb-3">Timeline</div>

                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium">Duration</span>
                  <span className="text-sm flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    {batch.duration ? (() => {
                      const totalSeconds = batch.duration;
                      const hours = Math.floor(totalSeconds / 3600);
                      const minutes = Math.floor((totalSeconds % 3600) / 60);
                      const seconds = totalSeconds % 60;
                      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    })() : '00:00:00'}
                  </span>
                </div>

                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium">Created</span>
                  <span className="text-sm">{new Date(batch.created_at).toLocaleString()}</span>
                </div>

                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium">Started</span>
                  <span className="text-sm">
                    {batch.started_at ? new Date(batch.started_at).toLocaleString() : 'N/A'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Completed</span>
                  <span className="text-sm">
                    {batch.completed_at ? new Date(batch.completed_at).toLocaleString() : 'N/A'}
                  </span>
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