"use client";

import { useEffect, useState } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, BarChart, CheckCircle, Clock, ClipboardList, TrendingUp, XCircle, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { TaskStatus } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { useBatchTasks, useSWRFetch, tasksService } from "@/lib/api";
import { RefreshControl } from "@/components/ui/refresh-control";
import { useRefreshContext, useRefreshTrigger } from "@/contexts/refresh-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

export default function BatchTasksPage({ params }: { params: Promise<{ batchId: string }> }) {
  // Unwrap params using React.use()
  const unwrappedParams = React.use(params);
  const batchId = unwrappedParams.batchId;

  // Use the TaskStatus type for better type safety
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("COMPLETED");
  const router = useRouter();
  const { refreshNow } = useRefreshContext();
  // Get refresh interval from context to use in our SWR config
  const { refreshInterval } = useRefreshTrigger();

  // Add state for the task dialog
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  // Fetch the selected task details only when needed
  const shouldFetchTask = Boolean(selectedTaskId && dialogOpen);
  const taskFetchKey = shouldFetchTask ? `/api/v1/tasks/${selectedTaskId}` : null;
  
  const {
    data: selectedTaskData,
    isLoading: selectedTaskLoading
  } = useSWRFetch(taskFetchKey as string);

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

  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
    setDialogOpen(true);
  };

  // Delete task handler
  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    setDeleteLoading(true);
    
    try {
      const response = await tasksService.deleteTask(taskToDelete);
      
      if (response.status === 200 || response.status === 204) {
        toast.success("Task deleted successfully");
        setIsDeleteDialogOpen(false);
        setTaskToDelete(null);
        // Refresh data
        refreshNow();
      } else {
        toast.error("Failed to delete task");
      }
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("Error deleting task");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Open delete dialog
  const confirmDeleteTask = (taskId: string) => {
    setTaskToDelete(taskId);
    setIsDeleteDialogOpen(true);
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
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow 
                      key={task.message_id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleTaskClick(task.message_id)}
                    >
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
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDeleteTask(task.message_id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this task? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={deleteLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTask}
              disabled={deleteLoading}
            >
              {deleteLoading ? <Loader2Icon className="h-4 w-4 animate-spin mr-2" /> : null}
              {deleteLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[85vw] md:max-w-[75vw] lg:max-w-[65vw] max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Task Details</DialogTitle>
            <DialogDescription>
              Complete information for task ID: {selectedTaskId}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[65vh] rounded-md border p-4 bg-muted/50">
            {selectedTaskLoading ? (
              <div className="flex items-center justify-center h-full">
                <Skeleton className="h-[400px] w-full" />
              </div>
            ) : selectedTaskData ? (
              <pre className="text-xs whitespace-pre-wrap overflow-auto">
                {JSON.stringify(selectedTaskData, null, 2)}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No task data available
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
} 