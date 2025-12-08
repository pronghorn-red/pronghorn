import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Play, Square, Trash2, ExternalLink, Settings, 
  RefreshCw, Cloud, Laptop, Server, GitBranch,
  Rocket, CheckCircle, Clock, XCircle, Download, Eye
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import DeploymentConfigDialog from "./DeploymentConfigDialog";
import DeploymentLogsDialog from "./DeploymentLogsDialog";
import type { Database } from "@/integrations/supabase/types";

type Deployment = Database["public"]["Tables"]["project_deployments"]["Row"];

interface DeploymentCardProps {
  deployment: Deployment;
  shareToken: string | null;
  onUpdate: () => void;
}

const statusConfig: Record<string, { icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  pending: { icon: <Clock className="h-3 w-3" />, variant: "secondary", label: "Pending" },
  building: { icon: <RefreshCw className="h-3 w-3 animate-spin" />, variant: "secondary", label: "Building" },
  deploying: { icon: <Rocket className="h-3 w-3 animate-pulse" />, variant: "default", label: "Deploying" },
  running: { icon: <CheckCircle className="h-3 w-3" />, variant: "default", label: "Running" },
  stopped: { icon: <Square className="h-3 w-3" />, variant: "outline", label: "Stopped" },
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

  const status = statusConfig[deployment.status] || statusConfig.pending;

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
    if (!confirm("Are you sure you want to delete this deployment?")) return;
    
    setIsDeleting(true);
    try {
      // If there's a Render service, delete it first
      if (deployment.render_service_id) {
        await invokeRenderService('delete');
      }
      
      const { error } = await supabase.rpc("delete_deployment_with_token", {
        p_deployment_id: deployment.id,
        p_token: shareToken || null,
      });
      
      if (error) throw error;
      toast.success("Deployment deleted");
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

  return (
    <>
      <Card className="border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {platformIcons[deployment.platform]}
              <div>
                <CardTitle className="text-base font-medium">{deployment.name}</CardTitle>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <GitBranch className="h-3 w-3" />
                  <span>{deployment.branch}</span>
                  <span>•</span>
                  <span className="capitalize">{deployment.environment}</span>
                  <span>•</span>
                  <span>{deployment.project_type}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={status.variant} className="flex items-center gap-1">
                {status.icon}
                {status.label}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {deployment.platform === "pronghorn_cloud" && (
                <a 
                  href={getDeploymentUrl()} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  {getDeploymentUrl()}
                </a>
              )}
              {deployment.platform === "local" && (
                <span className="flex items-center gap-1">
                  <Laptop className="h-3 w-3" />
                  Run: {deployment.run_command}
                </span>
              )}
              {deployment.last_deployed_at && (
                <span className="text-xs ml-4">
                  Last deployed: {new Date(deployment.last_deployed_at).toLocaleString()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {deployment.platform === "pronghorn_cloud" && (
                <>
                  {!hasRenderService ? (
                    <Button 
                      variant="default" 
                      size="sm" 
                      onClick={handleCreate}
                      disabled={isActionLoading === 'create'}
                    >
                      {isActionLoading === 'create' ? (
                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Cloud className="h-4 w-4 mr-1" />
                      )}
                      Create Service
                    </Button>
                  ) : (
                    <>
                      {deployment.status === "running" || deployment.status === "deploying" ? (
                        <>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleStop}
                            disabled={isActionLoading === 'stop'}
                          >
                            {isActionLoading === 'stop' ? (
                              <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Square className="h-4 w-4 mr-1" />
                            )}
                            Stop
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleRestart}
                            disabled={isActionLoading === 'restart'}
                          >
                            {isActionLoading === 'restart' ? (
                              <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4 mr-1" />
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
                        >
                          {isActionLoading === 'start' ? (
                            <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4 mr-1" />
                          )}
                          Start
                        </Button>
                      )}
                      <Button 
                        variant="default" 
                        size="sm" 
                        onClick={handleDeploy}
                        disabled={isActionLoading === 'deploy'}
                      >
                        {isActionLoading === 'deploy' ? (
                          <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Rocket className="h-4 w-4 mr-1" />
                        )}
                        Deploy
                      </Button>
                      {deployment.url && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setIsPreviewOpen(true)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
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
                >
                  {isActionLoading === 'download' ? (
                    <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-1" />
                  )}
                  Download Package
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsLogsOpen(true)}
              >
                Logs
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => setIsConfigOpen(true)}
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <DeploymentConfigDialog
        open={isConfigOpen}
        onOpenChange={setIsConfigOpen}
        deployment={deployment}
        shareToken={shareToken}
        onUpdate={onUpdate}
      />

      <DeploymentLogsDialog
        open={isLogsOpen}
        onOpenChange={setIsLogsOpen}
        deploymentId={deployment.id}
        shareToken={shareToken}
      />

      {/* Preview Dialog */}
      {isPreviewOpen && deployment.url && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-background border rounded-lg shadow-lg w-full max-w-6xl h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                <span className="font-medium">Preview: {deployment.name}</span>
                <a 
                  href={deployment.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open in new tab
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