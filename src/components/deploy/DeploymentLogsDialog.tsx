import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, AlertCircle, Info, AlertTriangle, Rocket, Hammer } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type DeploymentLog = Database["public"]["Tables"]["deployment_logs"]["Row"];

interface DeploymentLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deploymentId: string;
  shareToken: string | null;
}

const logTypeConfig: Record<string, { icon: React.ReactNode; className: string }> = {
  info: { icon: <Info className="h-3 w-3" />, className: "text-blue-500" },
  warning: { icon: <AlertTriangle className="h-3 w-3" />, className: "text-yellow-500" },
  error: { icon: <AlertCircle className="h-3 w-3" />, className: "text-red-500" },
  build: { icon: <Hammer className="h-3 w-3" />, className: "text-purple-500" },
  deploy: { icon: <Rocket className="h-3 w-3" />, className: "text-green-500" },
};

const DeploymentLogsDialog = ({
  open,
  onOpenChange,
  deploymentId,
  shareToken,
}: DeploymentLogsDialogProps) => {
  const [logs, setLogs] = useState<DeploymentLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_deployment_logs_with_token", {
        p_deployment_id: deploymentId,
        p_token: shareToken || null,
        p_limit: 100,
      });

      if (error) throw error;
      setLogs((data as DeploymentLog[]) || []);
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchLogs();
    }
  }, [open, deploymentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Deployment Logs</DialogTitle>
              <DialogDescription>
                View build and deployment logs
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchLogs} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[400px] rounded-md border bg-muted/30 p-4">
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {isLoading ? (
                <RefreshCw className="h-6 w-6 animate-spin" />
              ) : (
                <p>No logs yet</p>
              )}
            </div>
          ) : (
            <div className="space-y-2 font-mono text-sm">
              {logs.map((log) => {
                const config = logTypeConfig[log.log_type] || logTypeConfig.info;
                return (
                  <div key={log.id} className="flex items-start gap-2">
                    <span className="text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </span>
                    <Badge variant="outline" className={`${config.className} text-xs`}>
                      {config.icon}
                      <span className="ml-1">{log.log_type}</span>
                    </Badge>
                    <span className="flex-1 break-all">{log.message}</span>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default DeploymentLogsDialog;
