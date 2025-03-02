"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { healthService, batchesService } from "@/services/api";
import { FaCheck, FaExclamationTriangle, FaServer, FaDatabase, FaExchangeAlt, FaClipboardList, FaTasks, FaCheckCircle, FaTimesCircle } from "react-icons/fa";
import { Skeleton } from "@/components/ui/skeleton";

type HealthStatus = "HEALTHY" | "UNHEALTHY";

interface HealthResponse {
    status: HealthStatus;
    services: {
        api: HealthStatus;
        rabbitmq: HealthStatus;
        elasticsearch: HealthStatus;
        queue_consumers: number;
        queue_messages: number;
    };
    error: string | null;
}

interface BatchStats {
    total: number;
    completed: number;
    failed: number;
    pending: number;
}

export default function DashboardPage() {
    const [health, setHealth] = useState<HealthResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [batchStats, setBatchStats] = useState<BatchStats>({
        total: 0,
        completed: 0,
        failed: 0,
        pending: 0,
    });

    useEffect(() => {
        const fetchHealthData = async () => {
            try {
                setLoading(true);
                console.log("Attempting to fetch from API at:", process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002');
                
                const response = await healthService.getHealthCheck();
                console.log("API response received:", response.data);
                setHealth(response.data);

                // Fetch batch statistics
                const batchesResponse = await batchesService.getBatches(1, 100);
                console.log("Batches data received:", batchesResponse.data);
                const batches = batchesResponse.data.batches;

                // Calculate batch statistics
                const stats = {
                    total: batches.length,
                    completed: batches.filter((b: any) => b.batch_status === "COMPLETED").length,
                    failed: batches.filter((b: any) => b.batch_status === "FAILED").length,
                    pending: batches.filter((b: any) => b.batch_status === "PENDING" || b.batch_status === "PROCESSING").length,
                };

                setBatchStats(stats);
                setError(null);
            } catch (err: any) {
                console.error("API request failed with error:", err);
                if (err.request) {
                    console.error("No response received from server. Request details:", err.request);
                }
                if (err.response) {
                    console.error("Server responded with error. Status:", err.response.status, "Data:", err.response.data);
                }
                if (err.message) {
                    console.error("Error message:", err.message);
                }
                setError(`Failed to fetch data: ${err.message || "Unknown error"}`);
            } finally {
                setLoading(false);
            }
        };

        fetchHealthData();

        // Refresh health data every 30 seconds
        const interval = setInterval(fetchHealthData, 30000);

        return () => clearInterval(interval);
    }, []);

    const renderHealthIcon = (status: HealthStatus | undefined) => {
        if (loading) return <Skeleton className="h-8 w-8 rounded-full" />;
        return status === "HEALTHY" ? (
            <FaCheck className="h-8 w-8 text-green-500" />
        ) : (
            <FaExclamationTriangle className="h-8 w-8 text-yellow-500" />
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* API Status Card */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">API Status</CardTitle>
                        <FaServer className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center space-x-4">
                            {renderHealthIcon(health?.services.api)}
                            <div>
                                <div className="text-2xl font-bold">
                                    {loading ? (
                                        <Skeleton className="h-8 w-20" />
                                    ) : (
                                        health?.services.api || "UNKNOWN"
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">API Web Server</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* RabbitMQ Status Card */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">RabbitMQ Status</CardTitle>
                        <FaExchangeAlt className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center space-x-4">
                            {renderHealthIcon(health?.services.rabbitmq)}
                            <div>
                                <div className="text-2xl font-bold">
                                    {loading ? (
                                        <Skeleton className="h-8 w-20" />
                                    ) : (
                                        health?.services.rabbitmq || "UNKNOWN"
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">Message Broker</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Elasticsearch Status Card */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Elasticsearch Status</CardTitle>
                        <FaDatabase className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center space-x-4">
                            {renderHealthIcon(health?.services.elasticsearch)}
                            <div>
                                <div className="text-2xl font-bold">
                                    {loading ? (
                                        <Skeleton className="h-8 w-20" />
                                    ) : (
                                        health?.services.elasticsearch || "UNKNOWN"
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">Database</p>
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
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-sm">Messages in Queue:</p>
                                <div className="text-xl font-bold">
                                    {loading ? (
                                        <Skeleton className="h-6 w-10" />
                                    ) : (
                                        health?.services.queue_messages || 0
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-sm">Active Consumers:</p>
                                <div className="text-xl font-bold">
                                    {loading ? (
                                        <Skeleton className="h-6 w-10" />
                                    ) : (
                                        health?.services.queue_consumers || 0
                                    )}
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
                                    <FaCheckCircle className="mr-2 h-4 w-4 text-green-500" />
                                    <div className="text-xl font-bold">
                                        {loading ? <Skeleton className="h-6 w-10" /> : batchStats.completed}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-sm">Failed:</p>
                                <div className="flex items-center">
                                    <FaTimesCircle className="mr-2 h-4 w-4 text-red-500" />
                                    <div className="text-xl font-bold">
                                        {loading ? <Skeleton className="h-6 w-10" /> : batchStats.failed}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {error && (
                <div className="rounded-md bg-destructive/15 p-4 text-destructive">
                    {error}
                </div>
            )}
        </div>
    );
} 