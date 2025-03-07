"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FaServer, FaDatabase, FaExchangeAlt, FaClipboardList, FaTasks, FaCheckCircle, FaTimesCircle, FaHourglassHalf, FaSpinner, FaRobot, FaFileAlt, FaCoins } from "react-icons/fa";
import { Skeleton } from "@/components/ui/skeleton";
import { useHealth, useBatches, useTaskStats } from "@/lib/api/client";
import { Batch } from "@/lib/types";
import { useRefreshContext } from "@/contexts/refresh-context";

interface BatchStats {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    processing: number;
}

export default function DashboardPage() {
    // Use SWR hooks for auto-refreshing data
    const {
        data: health,
        isLoading: healthLoading } = useHealth();

    const {
        data: batchesData,
        isLoading: batchesLoading } = useBatches();

    const {
        data: taskStatsData,
        isLoading: taskStatsLoading } = useTaskStats();

    // Get refresh context
    useRefreshContext();

    // Calculate batch statistics from SWR data
    const batchStats: BatchStats = {
        total: batchesData?.batches?.length || 0,
        completed: batchesData?.batches?.filter((b: Batch) => b.batch_status === "COMPLETED").length || 0,
        failed: batchesData?.batches?.filter((b: Batch) => b.batch_status === "FAILED").length || 0,
        pending: batchesData?.batches?.filter((b: Batch) => b.batch_status === "PENDING").length || 0,
        processing: batchesData?.batches?.filter((b: Batch) => b.batch_status === "PROCESSING").length || 0,
    };

    // Extract task stats for easier access
    const taskStats = taskStatsData || {
        total_tasks: 0,
        completed_tasks: 0,
        failed_tasks: 0,
        cached_tasks: 0,
        processing_tasks: 0,
        pending_tasks: 0,
        total_tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
    };

    // Combined loading state
    const loading = healthLoading || batchesLoading || taskStatsLoading;

    // Manually refresh all data

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Combined Status Card */}
                <Card className="col-span-full lg:col-span-3 p-0">
                    <CardContent className="p-1 sm:p-2">
                        <div className="grid grid-cols-3 gap-2">
                            {/* API Status */}
                            <div className="flex items-center justify-center space-x-3 p-3 rounded-lg bg-muted/50">
                                <div className="relative">
                                    {loading ? (
                                        <Skeleton className="h-10 w-10 rounded-full" />
                                    ) : (
                                        <>
                                            <FaServer className="h-5 w-5 text-foreground" />
                                            <div className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-background ${health?.services.api === 'healthy' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                        </>
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm font-medium">API Server</p>
                                    <div className="text-xs text-muted-foreground">
                                        {loading ? <Skeleton className="h-4 w-20" /> :
                                            health?.services.api?.toUpperCase() || 'UNKNOWN'}
                                    </div>
                                </div>
                            </div>

                            {/* RabbitMQ Status */}
                            <div className="flex items-center justify-center space-x-3 p-3 rounded-lg bg-muted/50">
                                <div className="relative">
                                    {loading ? (
                                        <Skeleton className="h-10 w-10 rounded-full" />
                                    ) : (
                                        <>
                                            <FaExchangeAlt className="h-5 w-5 text-foreground" />
                                            <div className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-background ${health?.services.rabbitmq === 'healthy' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                        </>
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm font-medium">Message Broker</p>
                                    <div className="text-xs text-muted-foreground">
                                        {loading ? <Skeleton className="h-4 w-20" /> :
                                            health?.services.rabbitmq?.toUpperCase() || 'UNKNOWN'}
                                    </div>
                                </div>
                            </div>

                            {/* Elasticsearch Status */}
                            <div className="flex items-center justify-center space-x-3 p-3 rounded-lg bg-muted/50">
                                <div className="relative">
                                    {loading ? (
                                        <Skeleton className="h-10 w-10 rounded-full" />
                                    ) : (
                                        <>
                                            <FaDatabase className="h-5 w-5 text-foreground" />
                                            <div className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-background ${health?.services.elasticsearch === 'healthy' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                        </>
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm font-medium">Database</p>
                                    <div className="text-xs text-muted-foreground">
                                        {loading ? <Skeleton className="h-4 w-20" /> :
                                            health?.services.elasticsearch?.toUpperCase() || 'UNKNOWN'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Queue Stats Card */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Queue Status</CardTitle>
                        <FaTasks className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {/* Task Queue */}
                            <div className="rounded-lg border bg-card p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-medium text-sm flex items-center">
                                        <div className="w-2 h-2 rounded-full bg-blue-500 mr-2"></div>
                                        Task Queue
                                    </h3>
                                    {(health?.services?.task_queue_consumers || 0) > 0 ? (
                                        <span className="bg-green-500/20 text-green-600 dark:text-green-400 text-xs px-2 py-1 rounded-full">
                                            Active
                                        </span>
                                    ) : (
                                        <span className="bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-xs px-2 py-1 rounded-full">
                                            Idle
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-accent/50 rounded p-2">
                                        <p className="text-xs text-muted-foreground">Messages</p>
                                        <div className="text-xl font-bold flex items-center">
                                            {loading ? (
                                                <Skeleton className="h-6 w-10" />
                                            ) : (
                                                <div className="flex items-center">
                                                    {(health?.services.task_queue_messages || 0).toLocaleString()}
                                                    {(health?.services.task_queue_messages || 0) > 0 && (
                                                        <span className="ml-1.5 text-xs animate-pulse text-amber-500">●</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="bg-accent/50 rounded p-2">
                                        <p className="text-xs text-muted-foreground">Consumers</p>
                                        <div className="text-xl font-bold">
                                            {loading ? (
                                                <Skeleton className="h-6 w-10" />
                                            ) : (
                                                health?.services.task_queue_consumers || 0
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Batch Queue */}
                            <div className="rounded-lg border bg-card p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-medium text-sm flex items-center">
                                        <div className="w-2 h-2 rounded-full bg-purple-500 mr-2"></div>
                                        Batch Queue
                                    </h3>
                                    {(health?.services?.batch_queue_consumers || 0) > 0 ? (
                                        <span className="bg-green-500/20 text-green-600 dark:text-green-400 text-xs px-2 py-1 rounded-full">
                                            Active
                                        </span>
                                    ) : (
                                        <span className="bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-xs px-2 py-1 rounded-full">
                                            Idle
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-accent/50 rounded p-2">
                                        <p className="text-xs text-muted-foreground">Messages</p>
                                        <div className="text-xl font-bold flex items-center">
                                            {loading ? (
                                                <Skeleton className="h-6 w-10" />
                                            ) : (
                                                <div className="flex items-center">
                                                    {health?.services.batch_queue_messages.toLocaleString() || 0}
                                                    {(health?.services.batch_queue_messages || 0) > 0 && (
                                                        <span className="ml-1.5 text-xs animate-pulse text-amber-500">●</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="bg-accent/50 rounded p-2">
                                        <p className="text-xs text-muted-foreground">Consumers</p>
                                        <div className="text-xl font-bold">
                                            {loading ? (
                                                <Skeleton className="h-6 w-10" />
                                            ) : (
                                                health?.services.batch_queue_consumers.toLocaleString() || 0
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Batches Stats Card */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Batches</CardTitle>
                        <FaClipboardList className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-sm">Total:</p>
                                <div className="text-xl font-bold">
                                    {loading ? <Skeleton className="h-6 w-10" /> : batchStats.total}
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-sm">Completed:</p>
                                <div className="flex items-center">
                                    <div className="text-xl font-bold flex items-center">
                                        {loading ? <Skeleton className="h-6 w-10" /> : batchStats.completed}
                                    </div>
                                    <FaCheckCircle className="ml-2 h-4 w-4 text-green-500 self-center pt-0.5" />
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-sm">Failed:</p>
                                <div className="flex items-center">
                                    <div className="text-xl font-bold flex items-center">
                                        {loading ? <Skeleton className="h-6 w-10" /> : batchStats.failed}
                                    </div>
                                    <FaTimesCircle className="ml-2 h-4 w-4 text-red-500 self-center pt-0.5" />
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-sm">Pending:</p>
                                <div className="flex items-center">
                                    <div className="text-xl font-bold flex items-center">
                                        {loading ? <Skeleton className="h-6 w-10" /> : batchStats.pending}
                                    </div>
                                    <FaHourglassHalf className="ml-2 h-4 w-4 text-yellow-500 self-center pt-0.5" />
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-sm">Processing:</p>
                                <div className="flex items-center">
                                    <div className="text-xl font-bold flex items-center">
                                        {loading ? <Skeleton className="h-6 w-10" /> : batchStats.processing}
                                    </div>
                                    <FaSpinner className="ml-2 h-4 w-4 text-blue-500 self-center pt-0.5" />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Tasks Stats Card */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tasks</CardTitle>
                        <FaRobot className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-sm">Total:</p>
                                <div className="text-xl font-bold">
                                    {loading ? <Skeleton className="h-6 w-10" /> : taskStats.total_tasks.toLocaleString()}
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-sm">Completed:</p>
                                <div className="flex items-center">
                                    <div className="text-xl font-bold flex items-center">
                                        {loading ? <Skeleton className="h-6 w-10" /> : taskStats.completed_tasks.toLocaleString()}
                                    </div>
                                    <FaCheckCircle className="ml-2 h-4 w-4 text-green-500 self-center pt-0.5" />
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-sm">Failed:</p>
                                <div className="flex items-center">
                                    <div className="text-xl font-bold flex items-center">
                                        {loading ? <Skeleton className="h-6 w-10" /> : taskStats.failed_tasks.toLocaleString()}
                                    </div>
                                    <FaTimesCircle className="ml-2 h-4 w-4 text-red-500 self-center pt-0.5" />
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-sm">Cached:</p>
                                <div className="flex items-center">
                                    <div className="text-xl font-bold flex items-center">
                                        {loading ? <Skeleton className="h-6 w-10" /> : taskStats.cached_tasks.toLocaleString()}
                                    </div>
                                    <FaFileAlt className="ml-2 h-4 w-4 text-purple-500 self-center pt-0.5" />
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-sm">Processing:</p>
                                <div className="flex items-center">
                                    <div className="text-xl font-bold flex items-center">
                                        {loading ? <Skeleton className="h-6 w-10" /> : taskStats.processing_tasks.toLocaleString()}
                                    </div>
                                    <FaSpinner className="ml-2 h-4 w-4 text-blue-500 self-center pt-0.5" />
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-sm">Pending:</p>
                                <div className="flex items-center">
                                    <div className="text-xl font-bold flex items-center">
                                        {loading ? <Skeleton className="h-6 w-10" /> : taskStats.pending_tasks.toLocaleString()}
                                    </div>
                                    <FaHourglassHalf className="ml-2 h-4 w-4 text-yellow-500 self-center pt-0.5" />
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-sm">Total Tokens:</p>
                                <div className="flex items-center">
                                    <div className="text-xl font-bold flex items-center">
                                        {loading ? <Skeleton className="h-6 w-10" /> : taskStats.total_tokens.toLocaleString()}
                                    </div>
                                    <FaCoins className="ml-2 h-4 w-4 text-amber-500 self-center pt-0.5" />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
} 