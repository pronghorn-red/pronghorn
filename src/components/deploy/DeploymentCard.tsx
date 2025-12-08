import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Play, Square, Trash2, ExternalLink, Settings, 
  RefreshCw, Cloud, Laptop, Server, GitBranch,
  Rocket, AlertCircle, CheckCircle, Clock, XCircle
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
  const [isDeleting, setIsDeleting] = useState(false);

  const status = statusConfig[deployment.status] || statusConfig.pending;

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this deployment?")) return;
    
    setIsDeleting(true);
    try {
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
    // Generate expected URL based on naming convention
    const envPrefix = deployment.environment === "production" ? "" : `${deployment.environment}-`;
    return `https://${envPrefix}${deployment.name}.pronghorn.cloud`;
  };

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
                  {deployment.status === "running" ? (
                    <Button variant="outline" size="sm" disabled>
                      <Square className="h-4 w-4 mr-1" />
                      Stop
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      <Play className="h-4 w-4 mr-1" />
                      Start
                    </Button>
                  )}
                  <Button variant="default" size="sm" disabled>
                    <Rocket className="h-4 w-4 mr-1" />
                    Deploy
                  </Button>
                </>
              )}
              {deployment.platform === "local" && (
                <Button variant="outline" size="sm" disabled>
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
                <Trash2 className="h-4 w-4" />
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
    </>
  );
};

export default DeploymentCard;
