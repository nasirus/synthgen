"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { REFRESH_INTERVALS, RefreshIntervalKey, useRefreshContext } from "@/contexts/refresh-context";

export function RefreshControl() {
    const {
        autoRefresh,
        setAutoRefresh,
        refreshInterval,
        setRefreshInterval,
        refreshNow,
        isRefreshing,
        autoRefreshTriggered,
    } = useRefreshContext();

    return (
        <div className="flex items-center gap-2">
            {!isRefreshing && autoRefreshTriggered && (
                <Badge variant="outline" className="bg-green-500/10 flex items-center justify-center w-8 h-8 p-1">
                    <Loader2 className="h-4 w-4 animate-spin" />
                </Badge>
            )}

            <div className="flex items-center gap-2 border rounded-md p-1.5">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-1.5 mr-1">
                                <Label htmlFor="auto-refresh" className="text-xs font-normal cursor-pointer">Auto</Label>
                                <Switch
                                    id="auto-refresh"
                                    checked={autoRefresh}
                                    onCheckedChange={setAutoRefresh}
                                    aria-label="Toggle auto-refresh"
                                />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Toggle automatic refresh</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                {autoRefresh && (
                    <Select
                        value={refreshInterval}
                        onValueChange={(value) => setRefreshInterval(value as RefreshIntervalKey)}
                    >
                        <SelectTrigger className="h-8 w-[70px]">
                            <SelectValue placeholder="Interval" />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.keys(REFRESH_INTERVALS).filter(key => key !== "Off").map((interval) => (
                                <SelectItem key={interval} value={interval}>
                                    {interval}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {!autoRefresh && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={refreshNow}
                        disabled={isRefreshing}
                        className="h-8 w-8"
                    >
                        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        <span className="sr-only">Refresh</span>
                    </Button>
                )}
            </div>
        </div>
    );
} 