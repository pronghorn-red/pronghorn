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
import { Database, MoreVertical, Play, Pause, RefreshCw, Trash2, Key, Loader2, ExternalLink, Settings, Terminal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConnectionStringDialog } from "./ConnectionStringDialog";
import { DatabaseDialog } from "./DatabaseDialog";

interface DatabaseCardProps {
  database: any;
  shareToken: string | null;
  onRefresh: () => void;
  onExplore?: () => void;
  showExploreOnly?: boolean;
}

export function DatabaseCard({ database, shareToken, onRefresh, onExplore, showExploreOnly = false }: DatabaseCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);

  const invokeRenderDatabase = async (action: string, extraBody: any = {}) => {
    setIsLoading(true);
    setLoadingAction(action);

    try {
      const { data, error } = await supabase.functions.invoke("render-database", {
        body: {
          action,
          databaseId: database.id,
          shareToken,
          ...extraBody,
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || `Failed to ${action}`);
      }

      return data.data;
    } finally {
      setIsLoading(false);
      setLoadingAction(null);
    }
  };

  const handleCreate = async () => {
    try {
      await invokeRenderDatabase("create");
      toast.success("Database provisioning started");
      onRefresh();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSyncStatus = async () => {
    try {
      await invokeRenderDatabase("status");
      toast.success("Status synced");
      onRefresh();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSuspend = async () => {
    try {
      await invokeRenderDatabase("suspend");
      toast.success("Database suspended");
      onRefresh();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleResume = async () => {
    try {
      await invokeRenderDatabase("resume");
      toast.success("Database resumed");
      onRefresh();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleRestart = async () => {
    try {
      await invokeRenderDatabase("restart");
      toast.success("Database restarting");
      onRefresh();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async () => {
    try {
      await invokeRenderDatabase("delete");
      toast.success("Database deleted");
      setShowDeleteDialog(false);
      onRefresh();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleGetConnectionInfo = async () => {
    try {
      const info = await invokeRenderDatabase("connectionInfo");
      setConnectionInfo(info);
      setShowConnectionDialog(true);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getStatusBadge = () => {
    const statusColors: Record<string, string> = {
      pending: "bg-muted text-muted-foreground",
      creating: "bg-blue-500/20 text-blue-400",
      available: "bg-green-500/20 text-green-400",
      suspended: "bg-yellow-500/20 text-yellow-400",
      restarting: "bg-blue-500/20 text-blue-400",
      updating: "bg-blue-500/20 text-blue-400",
      failed: "bg-destructive/20 text-destructive",
      deleted: "bg-muted text-muted-foreground",
    };

    return (
      <Badge className={statusColors[database.status] || "bg-muted text-muted-foreground"}>
        {database.status}
      </Badge>
    );
  };

  const canCreate = database.status === "pending" && !database.render_postgres_id;
  const canSuspend = database.status === "available" && database.render_postgres_id;
  const canResume = database.status === "suspended" && database.render_postgres_id;
  const canRestart = database.status === "available" && database.render_postgres_id;
  const canGetConnection = database.has_connection_info && database.render_postgres_id && database.status === "available";
  const canDelete = true;
  const canSync = database.render_postgres_id && !["pending", "deleted"].includes(database.status);
  const canExplore = database.render_postgres_id && database.status === "available";
  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{database.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {database.provider === "render_postgres" ? "Render PostgreSQL" : "Supabase"} • {database.plan}
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
                {canCreate && (
                  <DropdownMenuItem onClick={handleCreate}>
                    <Play className="h-4 w-4 mr-2" />
                    Create Database
                  </DropdownMenuItem>
                )}
                {canGetConnection && (
                  <DropdownMenuItem onClick={handleGetConnectionInfo}>
                    <Key className="h-4 w-4 mr-2" />
                    Get Connection String
                  </DropdownMenuItem>
                )}
                {canExplore && onExplore && (
                  <DropdownMenuItem onClick={onExplore}>
                    <Terminal className="h-4 w-4 mr-2" />
                    Explore Database
                  </DropdownMenuItem>
                )}
                {canSync && (
                  <DropdownMenuItem onClick={handleSyncStatus}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync Status
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                  <Settings className="h-4 w-4 mr-2" />
                  Edit Configuration
                </DropdownMenuItem>
                {database.dashboard_url && (
                  <DropdownMenuItem asChild>
                    <a href={database.dashboard_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Dashboard
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {canSuspend && (
                  <DropdownMenuItem onClick={handleSuspend}>
                    <Pause className="h-4 w-4 mr-2" />
                    Suspend
                  </DropdownMenuItem>
                )}
                {canResume && (
                  <DropdownMenuItem onClick={handleResume}>
                    <Play className="h-4 w-4 mr-2" />
                    Resume
                  </DropdownMenuItem>
                )}
                {canRestart && (
                  <DropdownMenuItem onClick={handleRestart}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Restart
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowDeleteDialog(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          {showExploreOnly ? (
            // Simplified view for Manage tab - just show explore button
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                PostgreSQL {database.postgres_version || "16"} • {database.region || "oregon"}
              </div>
              {canExplore && onExplore ? (
                <Button onClick={onExplore} variant="default" size="sm">
                  <Terminal className="h-4 w-4 mr-2" />
                  Explore Database
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {database.status === "pending" ? "Database not created yet" : "Database not available"}
                </span>
              )}
            </div>
          ) : (
            // Full view for Deploy tab
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Region</span>
                  <p className="font-medium">{database.region || "oregon"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Version</span>
                  <p className="font-medium">PostgreSQL {database.postgres_version || "16"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Plan</span>
                  <p className="font-medium capitalize">{database.plan}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Created</span>
                  <p className="font-medium">{new Date(database.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {canCreate && (
                <div className="mt-4 pt-4 border-t border-border">
                  <Button onClick={handleCreate} disabled={isLoading} className="w-full">
                    {loadingAction === "create" ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Create Database on Render
                      </>
                    )}
                  </Button>
                </div>
              )}

              {canGetConnection && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex gap-2">
                    <Button onClick={handleGetConnectionInfo} variant="outline" disabled={isLoading} className="flex-1">
                      {loadingAction === "connectionInfo" ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Fetching...
                        </>
                      ) : (
                        <>
                          <Key className="h-4 w-4 mr-2" />
                          Connection String
                        </>
                      )}
                    </Button>
                    {onExplore && (
                      <Button onClick={onExplore} variant="default" disabled={isLoading} className="flex-1">
                        <Terminal className="h-4 w-4 mr-2" />
                        Explore
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Database?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the database "{database.name}" and all its data.
              This action cannot be undone.
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

      <ConnectionStringDialog
        open={showConnectionDialog}
        onOpenChange={setShowConnectionDialog}
        connectionInfo={connectionInfo}
        databaseName={database.name}
      />

      <DatabaseDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        mode="edit"
        database={database}
        projectId={database.project_id}
        shareToken={shareToken}
        onSuccess={onRefresh}
      />

    </>
  );
}
