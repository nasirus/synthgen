"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AlertCircle, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TaskStatus } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { useBatches, batchesService } from "@/lib/api/client";
import { RefreshControl } from "@/components/ui/refresh-control";
import { useRefreshContext } from "@/contexts/refresh-context";
import { toast } from "sonner";

export default function BatchesPage() {
  const [batchToDelete, setBatchToDelete] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const router = useRouter();
  useRefreshContext();

  // Use SWR hook for auto-refreshing batches
  const {
    data,
    error,
    isLoading,
    mutate } = useBatches();

  // Extract batches from data
  const batches = data?.batches || [];

  // Delete batch handler
  const handleDeleteBatch = async () => {
    if (!batchToDelete) return;
    
    setDeleteLoading(true);
    try {
      const response = await batchesService.deleteBatch(batchToDelete);
      
      if (response.status === 200 || response.status === 204) {
        toast.success("Batch deleted successfully");
        // Close dialog & refresh data
        setIsDeleteDialogOpen(false);
        mutate();
      } else {
        toast.error("Failed to delete batch");
      }
    } catch (error) {
      console.error("Error deleting batch:", error);
      toast.error("Error deleting batch");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Open delete dialog
  const confirmDelete = (batchId: string) => {
    setBatchToDelete(batchId);
    setIsDeleteDialogOpen(true);
  };

  // Navigate to batch details
  const navigateToBatch = (batchId: string) => {
    router.push(`/batches/${batchId}`);
  };

  return (
    <div>
      {error && (
        <Card className="mb-6 border-red-500">
          <CardContent className="pt-6">
            <div className="flex items-center text-red-500">
              <AlertCircle className="mr-2" />
              <p>{error.message || "Failed to fetch batches"}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">All Batches</h2>
            <RefreshControl />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : batches.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No batches found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch ID</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Tasks</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.batch_id} className="cursor-pointer hover:bg-secondary/50">
                    <TableCell
                      className="font-medium"
                      onClick={() => navigateToBatch(batch.batch_id)}
                    >
                      {batch.batch_id}
                    </TableCell>
                    <TableCell onClick={() => navigateToBatch(batch.batch_id)}>
                      {new Date(batch.created_at).toLocaleString()}
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(batch.created_at), { addSuffix: true })}
                      </div>
                    </TableCell>
                    <TableCell onClick={() => navigateToBatch(batch.batch_id)}>
                      <StatusBadge status={batch.batch_status as TaskStatus} />
                    </TableCell>
                    <TableCell onClick={() => navigateToBatch(batch.batch_id)}>
                      {Math.round(
                        batch.total_tasks > 0
                          ? ((batch.completed_tasks + batch.cached_tasks) / batch.total_tasks) * 100
                          : 0
                      )}%
                    </TableCell>
                    <TableCell onClick={() => navigateToBatch(batch.batch_id)}>
                      <span className="font-semibold">{batch.total_tasks.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({batch.completed_tasks.toLocaleString()} completed, {batch.cached_tasks.toLocaleString()} cached)
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDelete(batch.batch_id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this batch? This action cannot be undone.
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
              onClick={handleDeleteBatch}
              disabled={deleteLoading}
            >
              {deleteLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 