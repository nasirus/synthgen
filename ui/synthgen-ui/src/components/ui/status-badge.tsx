import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { CheckCircle, AlertCircle, Clock } from "lucide-react";
import { TaskStatus } from "@/lib/types";

const statusBadgeVariants = cva(
    "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium text-white w-fit whitespace-nowrap gap-1",
    {
        variants: {
            status: {
                completed: "bg-green-500 border-green-600",
                failed: "bg-red-500 border-red-600",
                processing: "bg-yellow-500 border-yellow-600 text-yellow-950",
                pending: "bg-blue-500 border-blue-600",
            },
        },
        defaultVariants: {
            status: "pending",
        },
    }
);

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    status: TaskStatus;
}

export function StatusBadge({ className, status, ...props }: StatusBadgeProps) {
    const mappedStatus = status.toLowerCase() as "completed" | "failed" | "processing" | "pending";

    const getIcon = () => {
        switch (mappedStatus) {
            case "completed":
                return <CheckCircle className="w-3 h-3" />;
            case "failed":
                return <AlertCircle className="w-3 h-3" />;
            case "processing":
            case "pending":
                return <Clock className="w-3 h-3" />;
        }
    };

    const getLabel = () => {
        return status.charAt(0) + status.slice(1).toLowerCase();
    };

    return (
        <span
            className={cn(statusBadgeVariants({ status: mappedStatus }), className)}
            {...props}
        >
            {getIcon()}
            {getLabel()}
        </span>
    );
} 