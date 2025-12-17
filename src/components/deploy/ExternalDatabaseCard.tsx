import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link, MoreVertical, Trash2, Loader2, Settings, Terminal, CheckCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConnectDatabaseDialog } from "./ConnectDatabaseDialog";
import type { ExternalDatabaseConnection } from "@/hooks/useRealtimeExternalDatabases";

interface ExternalDatabaseCardProps {
  connection: ExternalDatabaseConnection;
  shareToken: string | null;
  onRefresh: () => void;
  onExplore?: () => void;
  showExploreOnly?: boolean;
}

export function ExternalDatabaseCard({
  connection,
  shareToken,
  onRefresh,
  onExplore,
  showExploreOnly = false,
}: ExternalDatabaseCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const handleTestConnection = async () => {
    setIsLoading(true);
    setLoadingAction("test");

    try {
      const { data, error } = await supabase.functions.invoke("manage-database", {
        body: {
          action: "test_connection",
          connectionId: connection.id,
          shareToken,
        },
      });

      if (error || !data?.success) {
        // Update status to failed
        await supabase.rpc("update_db_connection_status_with_token", {
          p_connection_id: connection.id,
          p_token: shareToken,
          p_status: "failed",
          p_last_error: data?.error || "Connection test failed",
        });
        toast.error(data?.error || "Connection test failed");
      } else {
        // Update status to connected
        await supabase.rpc("update_db_connection_status_with_token", {
          p_connection_id: connection.id,
          p_token: shareToken,
          p_status: "connected",
          p_last_error: null,
        });
        toast.success("Connection successful!");
      }
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || "Connection test failed");
    } finally {
      setIsLoading(false);
      setLoadingAction(null);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    setLoadingAction("delete");

    try {
      const { error } = await supabase.rpc("delete_db_connection_with_token", {
        p_connection_id: connection.id,
        p_token: shareToken,
      });

      if (error) throw error;

      toast.success("Connection deleted");
      setShowDeleteDialog(false);
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete connection");
    } finally {
      setIsLoading(false);
      setLoadingAction(null);
    }
  };

  const getStatusBadge = () => {
    const statusColors: Record<string, string> = {
      untested: "bg-muted text-muted-foreground",
      connected: "bg-green-500/20 text-green-400",
      failed: "bg-destructive/20 text-destructive",
    };

    return (
      <Badge className={statusColors[connection.status] || "bg-muted text-muted-foreground"}>
        {connection.status}
      </Badge>
    );
  };

  const canExplore = connection.status === "connected";

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Link className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{connection.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                External PostgreSQL
                {connection.host && ` • ${connection.host}`}
                {connection.port && connection.port !== 5432 && `:${connection.port}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MoreVertical className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canExplore && onExplore && (
                  <DropdownMenuItem onClick={onExplore}>
                    <Terminal className="h-4 w-4 mr-2" />
                    Explore Database
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleTestConnection}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Test Connection
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                  <Settings className="h-4 w-4 mr-2" />
                  Edit Connection
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          {showExploreOnly ? (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {connection.database_name && `Database: ${connection.database_name}`}
                {connection.description && ` • ${connection.description}`}
              </div>
              {canExplore && onExplore ? (
                <Button onClick={onExplore} variant="default" size="sm">
                  <Terminal className="h-4 w-4 mr-2" />
                  Explore Database
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {connection.status === "untested"
                    ? "Test connection first"
                    : "Connection not available"}
                </span>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Host</span>
                  <p className="font-medium truncate">{connection.host || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Port</span>
                  <p className="font-medium">{connection.port || 5432}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Database</span>
                  <p className="font-medium truncate">{connection.database_name || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">SSL</span>
                  <p className="font-medium capitalize">{connection.ssl_mode || "require"}</p>
                </div>
              </div>

              {connection.description && (
                <p className="text-sm text-muted-foreground mt-3">{connection.description}</p>
              )}

              {connection.last_error && connection.status === "failed" && (
                <p className="text-sm text-destructive mt-3">Error: {connection.last_error}</p>
              )}

              <div className="mt-4 pt-4 border-t border-border flex gap-2">
                <Button
                  onClick={handleTestConnection}
                  variant="outline"
                  disabled={isLoading}
                  className="flex-1"
                >
                  {loadingAction === "test" ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      {connection.status === "connected" ? (
                        <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Test Connection
                    </>
                  )}
                </Button>
                {canExplore && onExplore && (
                  <Button onClick={onExplore} variant="default" className="flex-1">
                    <Terminal className="h-4 w-4 mr-2" />
                    Explore
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the connection "{connection.name}". This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loadingAction === "delete" ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConnectDatabaseDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        projectId={connection.project_id}
        shareToken={shareToken}
        onSuccess={onRefresh}
        editConnection={{
          id: connection.id,
          name: connection.name,
          description: connection.description,
          host: connection.host,
          port: connection.port,
          database_name: connection.database_name,
          ssl_mode: connection.ssl_mode,
        }}
      />
    </>
  );
}
