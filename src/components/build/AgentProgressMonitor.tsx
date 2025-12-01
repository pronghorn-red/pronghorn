import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  FilePlus, 
  FileEdit, 
  FileX, 
  FolderSearch,
  Loader2,
  CheckCircle,
  XCircle,
  Clock
} from "lucide-react";

interface AgentOperation {
  id: string;
  session_id: string;
  operation_type: string;
  file_path: string | null;
  status: string;
  details: any;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

interface AgentProgressMonitorProps {
  sessionId: string | null;
  shareToken: string | null;
}

export function AgentProgressMonitor({ sessionId, shareToken }: AgentProgressMonitorProps) {
  const [operations, setOperations] = useState<AgentOperation[]>([]);
  const [loading, setLoading] = useState(false);

  // Load operations
  useEffect(() => {
    if (!sessionId) {
      setOperations([]);
      return;
    }

    loadOperations();
  }, [sessionId, shareToken]);

  // Real-time subscription
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`agent-operations-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_file_operations",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          loadOperations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const loadOperations = async () => {
    if (!sessionId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_agent_operations_with_token", {
        p_session_id: sessionId,
        p_token: shareToken || null,
      });

      if (error) throw error;
      setOperations(data || []);
    } catch (error) {
      console.error("Error loading operations:", error);
    } finally {
      setLoading(false);
    }
  };

  const getOperationIcon = (type: string, status: string) => {
    if (status === "in_progress") return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />;
    if (status === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
    if (status === "completed") {
      switch (type) {
        case "create":
          return <FilePlus className="h-4 w-4 text-green-500" />;
        case "edit":
          return <FileEdit className="h-4 w-4 text-blue-500" />;
        case "delete":
          return <FileX className="h-4 w-4 text-red-500" />;
        case "search":
          return <FolderSearch className="h-4 w-4 text-purple-500" />;
        default:
          return <FileText className="h-4 w-4 text-muted-foreground" />;
      }
    }
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-green-500">Completed</Badge>;
      case "in_progress":
        return <Badge variant="default" className="bg-yellow-500">In Progress</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  if (!sessionId) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground text-center">
          No active agent session. Submit a task to begin monitoring.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full">
      <div className="p-3 border-b">
        <h3 className="text-sm font-semibold">Agent Progress</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {operations.length} operation{operations.length !== 1 ? "s" : ""}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {loading && operations.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : operations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No operations yet
            </p>
          ) : (
            operations.map((op) => (
              <div
                key={op.id}
                className="p-3 border rounded-lg bg-card hover:bg-accent/5 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {getOperationIcon(op.operation_type, op.status)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium capitalize">
                        {op.operation_type}
                      </span>
                      {getStatusBadge(op.status)}
                    </div>
                    
                    {op.file_path && (
                      <p className="text-xs text-muted-foreground truncate">
                        {op.file_path}
                      </p>
                    )}
                    
                    {op.error_message && (
                      <p className="text-xs text-destructive mt-1">
                        {op.error_message}
                      </p>
                    )}
                    
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(op.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
