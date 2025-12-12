import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Play, Square, Trash2, ExternalLink, Settings, 
  RefreshCw, Cloud, Laptop, Server, GitBranch,
  Rocket, CheckCircle, Clock, XCircle, Download, Eye, RotateCcw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import DeploymentDialog from "./DeploymentDialog";
import DeploymentLogsDialog from "./DeploymentLogsDialog";
import type { Database } from "@/integrations/supabase/types";

type Deployment = Database["public"]["Tables"]["project_deployments"]["Row"];

interface DeploymentCardProps {
  deployment: Deployment;
  shareToken: string | null;
  onUpdate: () => void;
}

const statusConfig: Record<string, { icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline"; label: string; pulse?: boolean }> = {
  pending: { icon: <Clock className="h-3 w-3" />, variant: "secondary", label: "Pending" },
  building: { icon: <RefreshCw className="h-3 w-3 animate-spin" />, variant: "secondary", label: "Building", pulse: true },
  deploying: { icon: <Rocket className="h-3 w-3" />, variant: "default", label: "Deploying", pulse: true },
  running: { icon: <CheckCircle className="h-3 w-3" />, variant: "default", label: "Running" },
  stopped: { icon: <Square className="h-3 w-3" />, variant: "outline", label: "Stopped" },
  suspended: { icon: <Square className="h-3 w-3" />, variant: "outline", label: "Suspended" },
  failed: { icon: <XCircle className="h-3 w-3" />, variant: "destructive", label: "Failed" },
  deleted: { icon: <Trash2 className="h-3 w-3" />, variant: "destructive", label: "Deleted" },
};

const platformIcons: Record<string, React.ReactNode> = {
  pronghorn_cloud: <Cloud className="h-4 w-4" />,
  local: <Laptop className="h-4 w-4" />,
  dedicated_vm: <Server className="h-4 w-4" />,
};

const DeploymentCard = ({ deployment, shareToken, onUpdate }: DeploymentCardProps) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);

  const status = statusConfig[deployment.status] || statusConfig.pending;

  // Check if status is transitional (should auto-refresh)
  const isTransitionalStatus = deployment.status === "building" || deployment.status === "deploying";

  // Auto-refresh for transitional statuses
  const syncStatus = useCallback(async () => {
    if (!deployment.render_service_id) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('render-service', {
        body: {
          action: 'status',
          deploymentId: deployment.id,
          shareToken: shareToken || null,
        },
      });

      if (!error && data?.success) {
        // If status changed, trigger parent update
        if (data.data?.status !== deployment.status) {
          onUpdate();
        }
      }
    } catch (error) {
      console.error('Error syncing status:', error);
    }
  }, [deployment.id, deployment.render_service_id, deployment.status, shareToken, onUpdate]);

  // Setup auto-refresh when status is transitional
  useEffect(() => {
    if (isTransitionalStatus && deployment.render_service_id) {
      autoRefreshRef.current = setInterval(syncStatus, 10000);
    } else {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    }

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
  }, [isTransitionalStatus, deployment.render_service_id, syncStatus]);

  const invokeRenderService = async (action: string) => {
    setIsActionLoading(action);
    try {
      const { data, error } = await supabase.functions.invoke('render-service', {
        body: {
          action,
          deploymentId: deployment.id,
          shareToken: shareToken || null,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast.success(`${action.charAt(0).toUpperCase() + action.slice(1)} successful`);
      onUpdate();
    } catch (error: any) {
      console.error(`Error ${action}:`, error);
      toast.error(error.message || `Failed to ${action}`);
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleCreate = () => invokeRenderService('create');
  const handleDeploy = () => invokeRenderService('deploy');
  const handleStart = () => invokeRenderService('start');
  const handleStop = () => invokeRenderService('stop');
  const handleRestart = () => invokeRenderService('restart');
  const handleSyncStatus = () => invokeRenderService('status');

  const handleDownloadPackage = async () => {
    setIsActionLoading('download');
    try {
      const { data, error } = await supabase.functions.invoke('generate-local-package', {
        body: {
          deploymentId: deployment.id,
          shareToken: shareToken || null,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      // Decode base64 to binary
      const binaryString = atob(data.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create a blob and trigger download
      const blob = new Blob([bytes], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || `${deployment.environment}-${deployment.name}-local.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Package downloaded');
    } catch (error: any) {
      console.error('Error downloading package:', error);
      toast.error(error.message || 'Failed to download package');
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this deployment? This will also delete the service on Render.com.")) return;
    
    setIsDeleting(true);
    try {
      // If there's a Render service, delete it on Render.com first
      if (deployment.render_service_id) {
        const { data, error } = await supabase.functions.invoke('render-service', {
          body: {
            action: 'delete',
            deploymentId: deployment.id,
            shareToken: shareToken || null,
          },
        });
        
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Failed to delete Render service');
      }
      
      // Then delete from our database
      const { error } = await supabase.rpc("delete_deployment_with_token", {
        p_deployment_id: deployment.id,
        p_token: shareToken || null,
      });
      
      if (error) throw error;
      toast.success("Deployment deleted from Render and database");
      onUpdate();
    } catch (error: any) {
      console.error("Error deleting deployment:", error);
      toast.error(error.message || "Failed to delete deployment");
    } finally {
      setIsDeleting(false);
    }
  };

  const getDeploymentUrl = () => {
    if (deployment.url) return deployment.url;
    // Generate expected URL: env-appname.onrender.com
    return `https://${deployment.environment}-${deployment.name}.onrender.com`;
  };

  const hasRenderService = !!deployment.render_service_id;
  const isRunning = deployment.status === "running" || deployment.status === "deploying" || deployment.status === "building";
  const isStopped = deployment.status === "stopped" || deployment.status === "failed" || deployment.status === "pending";

  return (
    <>
      <Card className="border">
        <CardHeader className="pb-2 sm:pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start sm:items-center gap-3">
              <div className="mt-1 sm:mt-0">{platformIcons[deployment.platform]}</div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-sm sm:text-base font-medium truncate">{deployment.name}</CardTitle>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    {deployment.branch}
                  </span>
                  <span className="hidden sm:inline">•</span>
                  <span className="capitalize">{deployment.environment}</span>
                  <span className="hidden sm:inline">•</span>
                  <span className="hidden sm:inline">{deployment.project_type}</span>
                </div>
              </div>
            </div>
            <Badge 
              variant={status.variant} 
              className={`flex items-center gap-1 self-start sm:self-center ${status.pulse ? "animate-pulse" : ""}`}
            >
              {status.icon}
              {status.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {/* URL and last deployed */}
          <div className="text-xs text-muted-foreground mb-3">
            {deployment.platform === "pronghorn_cloud" && (
              <a 
                href={getDeploymentUrl()} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-foreground transition-colors truncate"
              >
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{getDeploymentUrl()}</span>
              </a>
            )}
            {deployment.platform === "local" && (
              <span className="flex items-center gap-1">
                <Laptop className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">Run: {deployment.run_command}</span>
              </span>
            )}
            {deployment.last_deployed_at && (
              <span className="block mt-1">
                Last deployed: {new Date(deployment.last_deployed_at).toLocaleString()}
              </span>
            )}
          </div>

          {/* Action buttons - responsive wrap */}
          <div className="flex flex-wrap items-center gap-2">
            {deployment.platform === "pronghorn_cloud" && (
              <>
                {!hasRenderService ? (
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={handleCreate}
                    disabled={isActionLoading === 'create'}
                    className="text-xs"
                  >
                    {isActionLoading === 'create' ? (
                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Cloud className="h-3 w-3 mr-1" />
                    )}
                    Create Service
                  </Button>
                ) : (
                  <>
                    {isRunning ? (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={handleStop}
                          disabled={isActionLoading === 'stop'}
                          className="text-xs"
                        >
                          {isActionLoading === 'stop' ? (
                            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Square className="h-3 w-3 mr-1" />
                          )}
                          Stop
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={handleRestart}
                          disabled={isActionLoading === 'restart'}
                          className="text-xs"
                        >
                          {isActionLoading === 'restart' ? (
                            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3 mr-1" />
                          )}
                          Restart
                        </Button>
                      </>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleStart}
                        disabled={isActionLoading === 'start'}
                        className="text-xs"
                      >
                        {isActionLoading === 'start' ? (
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3 mr-1" />
                        )}
                        Start
                      </Button>
                    )}
                    <Button 
                      variant="default" 
                      size="sm" 
                      onClick={handleDeploy}
                      disabled={isActionLoading === 'deploy'}
                      className="text-xs"
                    >
                      {isActionLoading === 'deploy' ? (
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Rocket className="h-3 w-3 mr-1" />
                      )}
                      Deploy
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleSyncStatus}
                      disabled={isActionLoading === 'status'}
                      className="text-xs"
                      title="Sync status from Render"
                    >
                      {isActionLoading === 'status' ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                    </Button>
                    {deployment.url && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setIsPreviewOpen(true)}
                        className="text-xs"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Preview
                      </Button>
                    )}
                  </>
                )}
              </>
            )}
            {deployment.platform === "local" && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDownloadPackage}
                disabled={isActionLoading === 'download'}
                className="text-xs"
              >
                {isActionLoading === 'download' ? (
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Download className="h-3 w-3 mr-1" />
                )}
                Download
              </Button>
            )}
            
            {/* Utility buttons */}
            <div className="flex items-center gap-1 ml-auto">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsLogsOpen(true)}
                className="text-xs"
              >
                Logs
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7"
                onClick={() => setIsConfigOpen(true)}
              >
                <Settings className="h-3 w-3" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <DeploymentDialog
        open={isConfigOpen}
        onOpenChange={setIsConfigOpen}
        projectId={deployment.project_id}
        shareToken={shareToken}
        mode="edit"
        deployment={deployment}
        onSuccess={onUpdate}
      />

      <DeploymentLogsDialog
        open={isLogsOpen}
        onOpenChange={setIsLogsOpen}
        deploymentId={deployment.id}
        shareToken={shareToken}
        renderServiceId={deployment.render_service_id}
      />

      {/* Preview Dialog */}
      {isPreviewOpen && deployment.url && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
          <div className="bg-background border rounded-lg shadow-lg w-full max-w-6xl h-[90vh] sm:h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b">
              <div className="flex items-center gap-2 min-w-0">
                <Eye className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium text-sm truncate">{deployment.name}</span>
                <a 
                  href={deployment.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span className="hidden sm:inline">Open</span>
                </a>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsPreviewOpen(false)}>
                Close
              </Button>
            </div>
            <div className="flex-1 p-1">
              <iframe 
                src={deployment.url} 
                className="w-full h-full rounded border"
                title={`Preview of ${deployment.name}`}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DeploymentCard;
