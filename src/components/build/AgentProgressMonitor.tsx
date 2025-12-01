import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useInfiniteAgentOperations } from "@/hooks/useInfiniteAgentOperations";
import { 
  FileText, 
  FilePlus, 
  FileEdit, 
  FileX, 
  FolderSearch,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Brain
} from "lucide-react";

interface BlackboardEntry {
  id: string;
  session_id: string;
  entry_type: string;
  content: string;
  metadata: any;
  created_at: string;
}

interface AgentProgressMonitorProps {
  projectId: string;
  shareToken: string | null;
}

export function AgentProgressMonitor({ projectId, shareToken }: AgentProgressMonitorProps) {
  const { operations, loading, hasMore, loadMore } = useInfiniteAgentOperations(projectId, shareToken);
  const [blackboard, setBlackboard] = useState<BlackboardEntry[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (loading || !hasMore) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreTriggerRef.current) {
      observerRef.current.observe(loadMoreTriggerRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loading, hasMore, loadMore]);

  // Temporarily hide blackboard since we're showing cross-session operations
  // const loadBlackboard = async () => { ... };

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

  return (
    <div className="flex flex-col h-full">
      {/* Blackboard temporarily hidden for cross-session view */}
      {false && blackboard.length > 0 && (
        <Card>
          <div className="p-3 border-b">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Agent Memory</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              What the agent is thinking and planning
            </p>
          </div>
          <ScrollArea className="max-h-[200px]">
            <div className="p-3 space-y-2">
              {blackboard.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3 border rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="capitalize">
                      {entry.entry_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{entry.content}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}

      {/* Operations Section */}
      <Card className="flex flex-col flex-1">
        <div className="p-3 border-b">
          <h3 className="text-sm font-semibold">File Operations</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {operations.length} operation{operations.length !== 1 ? "s" : ""}
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {operations.length === 0 && loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : operations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No operations yet
              </p>
            ) : (
              <>
              {operations.map((op) => (
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
              ))}
              
              {/* Load more trigger */}
              {hasMore && (
                <div ref={loadMoreTriggerRef} className="flex items-center justify-center py-4">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    <p className="text-xs text-muted-foreground">Scroll for more...</p>
                  )}
                </div>
              )}
              </>
            )}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
