"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { batchesService } from "@/services/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle, Clock, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Batch } from "@/lib/types";

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batchToDelete, setBatchToDelete] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const router = useRouter();

  const fetchBatches = async () => {
    try {
      setLoading(true);
      const response = await batchesService.getBatches();
      setBatches(response.data.batches || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to fetch batches");
      console.error("Error fetching batches:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  const handleDeleteBatch = async () => {
    if (!batchToDelete) return;

    try {
      await batchesService.deleteBatch(batchToDelete);
      fetchBatches();
      setIsDeleteDialogOpen(false);
      setBatchToDelete(null);
    } catch (err: any) {
      console.error("Error deleting batch:", err);
      setError(err.message || "Failed to delete batch");
    }
  };

  const confirmDelete = (batchId: string) => {
    setBatchToDelete(batchId);
    setIsDeleteDialogOpen(true);
  };

  const navigateToBatchDetail = (batchId: string) => {
    router.push(`/batches/${batchId}`);
  };

  const navigateToBatchStats = (batchId: string) => {
    router.push(`/batches/${batchId}/stats`);
  };

  const getStatusBadge = (status: string, completedTasks: number, totalTasks: number) => {
    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    if (status === "COMPLETED") {
      return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
    } else if (status === "FAILED") {
      return <Badge className="bg-red-500"><AlertCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
    } else {
      return <Badge className="bg-blue-500"><Clock className="w-3 h-3 mr-1" /> In Progress ({Math.round(progress)}%)</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-6">
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
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-1/4 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : batches.length === 0 ? (
        <Card>
          <CardContent className="pt-6 flex flex-col items-center justify-center h-40">
            <p className="text-muted-foreground text-lg">No batches found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch ID</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead>Tasks</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch.batch_id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium" onClick={() => navigateToBatchDetail(batch.batch_id)}>
                        {batch.batch_id}
                      </TableCell>
                      <TableCell onClick={() => navigateToBatchDetail(batch.batch_id)}>
                        {new Date(batch.created_at).toLocaleString()}
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(batch.created_at), { addSuffix: true })}
                        </div>
                      </TableCell>
                      <TableCell onClick={() => navigateToBatchDetail(batch.batch_id)}>
                        {batch.completed_tasks} / {batch.total_tasks}
                      </TableCell>
                      <TableCell onClick={() => navigateToBatchDetail(batch.batch_id)}>
                        {getStatusBadge(batch.batch_status, batch.completed_tasks, batch.total_tasks)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigateToBatchStats(batch.batch_id)}
                          >
                            Stats
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigateToBatchDetail(batch.batch_id)}
                          >
                            View
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDelete(batch.batch_id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this batch? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteBatch}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 