"use client";

import { useEffect, useState } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, BarChart, CheckCircle, Clock, ClipboardList, TrendingUp, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { TaskStatus } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { useBatchTasks } from "@/lib/hooks";
import { RefreshControl } from "@/components/ui/refresh-control";
import { useRefreshContext, useRefreshTrigger } from "@/contexts/refresh-context";

export default function BatchTasksPage({ params }: { params: { batchId: string } }) {
  // Unwrap params using React.use()
  const unwrappedParams = React.use(params as unknown as Promise<{ batchId: string }>);
  const batchId = unwrappedParams.batchId;

  // Use the TaskStatus type for better type safety
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("COMPLETED");
  const router = useRouter();
  useRefreshContext();
  // Get refresh interval from context to use in our SWR config
  const { refreshInterval } = useRefreshTrigger();

  const {
    data: tasksData,
    error: tasksError,
    isLoading: tasksLoading,
    isValidating: tasksValidating,
    mutate: refreshTasks
  } = useBatchTasks(batchId, taskStatus, {
    // Use the refresh interval from the global context
    refreshInterval: refreshInterval,
    // These options should let the SWR cache work properly with our refresh context
    revalidateOnFocus: true,
    revalidateIfStale: true,
    // Don't dedupe too aggressively so we can see updates
    dedupingInterval: 1000,
  });

  // Access tasks directly without useMemo since we're not transforming the data
  const tasks = tasksData?.tasks || [];

  // Refresh tasks when status changes
  useEffect(() => {
    refreshTasks();
  }, [taskStatus, refreshTasks]);

  const handleStatusChange = (status: TaskStatus) => {
    setTaskStatus(status);
  };

  const navigateBack = () => {
    router.push(`/batches/${batchId}`);
  };

  const navigateToOverview = () => {
    router.push(`/batches/${batchId}`);
  };

  const navigateToStats = () => {
    router.push(`/batches/${batchId}/stats`);
  };

  const getStatusBadge = (status: TaskStatus) => {
    return <StatusBadge status={status} />;
  };

  return (
    <div className="container p-0 mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Button variant="ghost" onClick={navigateBack} className="mr-2 p-2">
            <ArrowLeft className="h-4 w-4" />
            <span className="ml-1">Back</span>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={navigateToOverview} size="sm" variant="outline" className="h-8">
            <TrendingUp className="h-4 w-4 mr-1" /> Overview
          </Button>
          <Button onClick={navigateToStats} size="sm" variant="outline" className="h-8">
            <BarChart className="h-4 w-4 mr-1" /> Statistics
          </Button>          
          <Button onClick={() => {}} size="sm" variant="default" className="h-8">
            <ClipboardList className="h-4 w-4 mr-1" /> Tasks
          </Button>
          <RefreshControl />
        </div>
      </div>

      <Card>
        <CardHeader className="p-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <div>
              <CardTitle className="text-lg">Tasks</CardTitle>
              <CardDescription>View and filter tasks in this batch</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={taskStatus === "COMPLETED" ? "default" : "outline"}
                size="sm"
                onClick={() => handleStatusChange("COMPLETED")}
              >
                <CheckCircle className="w-4 h-4 mr-1" /> Completed
              </Button>
              <Button
                variant={taskStatus === "FAILED" ? "default" : "outline"}
                size="sm"
                onClick={() => handleStatusChange("FAILED")}
              >
                <AlertCircle className="w-4 h-4 mr-1" /> Failed
              </Button>
              <Button
                variant={taskStatus === "PROCESSING" ? "default" : "outline"}
                size="sm"
                onClick={() => handleStatusChange("PROCESSING")}
              >
                <Clock className="w-4 h-4 mr-1" /> Processing
              </Button>
              <Button
                variant={taskStatus === "PENDING" ? "default" : "outline"}
                size="sm"
                onClick={() => handleStatusChange("PENDING")}
              >
                <Clock className="w-4 h-4 mr-1" /> Pending
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {/* Updating indicator */}
          {tasksValidating && (
            <Badge variant="outline" className="mb-2 text-xs bg-blue-500/10">
              Updating tasks...
            </Badge>
          )}

          {tasksLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : tasksError ? (
            <div className="text-center py-6 border rounded-md">
              <AlertCircle className="mx-auto h-8 w-8 text-red-500 mb-2" />
              <p className="text-muted-foreground">Error loading tasks</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-6 border rounded-md">
              <p className="text-muted-foreground">No {taskStatus.toLowerCase()} tasks found</p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[calc(100vh-15rem)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task ID</TableHead>
                    <TableHead>Completed At</TableHead>
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
                      <TableCell className="font-medium whitespace-nowrap">{task.message_id}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {task.completed_at ? new Date(task.completed_at).toLocaleString() : 'N/A'}
                        <div className="text-xs text-muted-foreground">
                          {task.completed_at ? formatDistanceToNow(new Date(task.completed_at), { addSuffix: true }) : 'N/A'}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(task.status as TaskStatus)}</TableCell>
                      <TableCell>
                        {task.duration ? `${(task.duration / 1000).toFixed(2)}s` : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {task.completions?.usage?.total_tokens || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {task.completions?.usage?.prompt_tokens || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {task.completions?.usage?.completion_tokens || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {task.cached ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 