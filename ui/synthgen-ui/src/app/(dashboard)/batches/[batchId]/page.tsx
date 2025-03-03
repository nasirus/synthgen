"use client";

import { useEffect, useState } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import { batchesService } from "@/services/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, CheckCircle, Clock, BarChart } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Batch, Task, TaskStatus } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";


export default function BatchDetailPage({ params }: { params: { batchId: string } }) {
  // Unwrap params using React.use()
  const unwrappedParams = React.use(params as unknown as Promise<{ batchId: string }>);
  const batchId = unwrappedParams.batchId;
  
  const [batch, setBatch] = useState<Batch | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  // Use the TaskStatus type for better type safety
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("COMPLETED");
  const router = useRouter();

  // Add debug logging when component mounts
  useEffect(() => {
    console.log("Initial taskStatus state:", taskStatus);
  }, []);

  const fetchBatch = async () => {
    try {
      setLoading(true);
      const response = await batchesService.getBatch(batchId);
      
      // Just set the batch data directly
      setBatch(response.data);
      setError(null);
      
      // Debug the status
      console.log("Batch data received:", response.data);
      console.log("Batch status:", response.data.batch_status);
    } catch (err: any) {
      setError(err.message || "Failed to fetch batch details");
      console.error("Error fetching batch:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTasks = async (status: TaskStatus) => {
    try {
      console.log("fetchTasks called with status:", status);
      console.log("Current taskStatus state in fetchTasks:", taskStatus);
      setTasksLoading(true);
      const response = await batchesService.getBatchTasks(batchId, status);
      setTasks(response.data.tasks || []);
      console.log("Tasks fetched for status:", status, "Count:", response.data.tasks?.length || 0);
    } catch (err: any) {
      console.error("Error fetching tasks:", err);
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    fetchBatch();
  }, [batchId]);

  useEffect(() => {
    if (activeTab === "tasks") {
      console.log("Tasks tab useEffect triggered with taskStatus:", taskStatus);
      fetchTasks(taskStatus);
    }
  }, [activeTab, taskStatus, batchId]);

  // Add a dedicated useEffect hook to track taskStatus changes
  useEffect(() => {
    console.log("taskStatus changed to:", taskStatus);
  }, [taskStatus]);

  const handleStatusChange = (status: TaskStatus) => {
    console.log("handleStatusChange called with new status:", status);
    console.log("Previous taskStatus:", taskStatus);
    setTaskStatus(status);
    // Log the new status in the next render cycle
    setTimeout(() => console.log("taskStatus after update (setTimeout):", taskStatus), 0);
  };

  const navigateToStats = () => {
    router.push(`/batches/${batchId}/stats`);
  };

  const navigateBack = () => {
    router.push("/batches");
  };

  const getStatusBadge = (status: string) => {
    console.log("getStatusBadge called with batch_status:", status);
    
    // Make sure status is one of the valid values
    let validStatus: TaskStatus;
    
    if (status === "COMPLETED" || status === "FAILED" || status === "PROCESSING" || status === "PENDING") {
      validStatus = status as TaskStatus;
    } else {
      // If for some reason we get an invalid status, make a logical fallback decision
      console.warn("Invalid batch_status received:", status);
      
      // If all tasks are completed, show as COMPLETED
      if (batch && batch.completed_tasks === batch.total_tasks && batch.total_tasks > 0) {
        console.log("Setting to COMPLETED based on completed_tasks count");
        validStatus = "COMPLETED";
      } else {
        validStatus = "PENDING";
      }
    }
    
    console.log("Using batch_status for badge:", validStatus);
    
    // Using our StatusBadge component
    return <StatusBadge status={validStatus} />;
  };

  const calculateProgress = () => {
    if (!batch) return 0;
    return batch.total_tasks > 0 
      ? (batch.completed_tasks / batch.total_tasks) * 100 
      : 0;
  };

  return (
    <div>
      <div className="flex items-center mb-6">
        <Button variant="ghost" onClick={navigateBack} className="mr-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Batches
        </Button>
        <h1 className="text-3xl font-bold">Batch Details</h1>
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
          <div className="flex justify-between">
            <div className="flex-1 mr-4">
              <Card>
                <CardHeader>
                  <CardTitle>Batch Information</CardTitle>
                  <CardDescription>Details about batch {batchId}</CardDescription>
                </CardHeader>
                <CardContent>
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
                        {getStatusBadge(batch.batch_status)}
                        {/* Add debug info */}
                        {process.env.NODE_ENV === 'development' && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Raw status: {batch.batch_status}
                          </p>
                        )}
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
            </div>
            <div className="flex-1">
              <Card>
                <CardHeader>
                  <CardTitle>Task Statistics</CardTitle>
                  <CardDescription>Overview of task completion status</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Tasks</p>
                      <p className="text-2xl font-bold">{batch.total_tasks}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Completed Tasks</p>
                      <p className="text-2xl font-bold text-green-500">{batch.completed_tasks}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Failed Tasks</p>
                      <p className="text-2xl font-bold text-red-500">{batch.failed_tasks || 0}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Pending Tasks</p>
                      <p className="text-2xl font-bold text-blue-500">
                        {batch.total_tasks - (batch.completed_tasks + (batch.failed_tasks || 0))}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <Button 
                      onClick={navigateToStats} 
                      className="w-full"
                      variant="outline"
                    >
                      <BarChart className="mr-2 h-4 w-4" />
                      View Detailed Statistics
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
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
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-medium">Processing Information</h3>
                      <div className="grid grid-cols-2 gap-4 mt-2">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Average Processing Time</p>
                          <p className="text-lg font-semibold">
                            {batch.average_processing_time ? `${(batch.average_processing_time / 1000).toFixed(2)}s` : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Total Tokens</p>
                          <p className="text-lg font-semibold">{batch.total_tokens || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Prompt Tokens</p>
                          <p className="text-lg font-semibold">{batch.prompt_tokens || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Completion Tokens</p>
                          <p className="text-lg font-semibold">{batch.completion_tokens || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                    {batch.metadata && (
                      <div>
                        <h3 className="text-lg font-medium">Metadata</h3>
                        <pre className="mt-2 p-4 bg-muted rounded-md overflow-auto text-sm">
                          {JSON.stringify(batch.metadata, null, 2)}
                        </pre>
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
                  {/* Debug info for current status */}
                  <div className="mb-2 text-sm text-muted-foreground">
                    Current filter: <code>{taskStatus}</code>
                  </div>
                  
                  {tasksLoading ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
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
                            <TableCell>{getStatusBadge(task.status)}</TableCell>
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