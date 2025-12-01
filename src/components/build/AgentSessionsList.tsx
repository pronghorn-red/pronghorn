import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle, XCircle, Loader2, ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface AgentSession {
  id: string;
  project_id: string;
  mode: string;
  task_description: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AgentSessionsListProps {
  projectId: string;
  shareToken: string | null;
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}

export function AgentSessionsList({
  projectId,
  shareToken,
  activeSessionId,
  onSelectSession,
}: AgentSessionsListProps) {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  // Load all sessions for this project
  useEffect(() => {
    if (!projectId) return;
    loadSessions();
  }, [projectId, shareToken]);

  // Real-time subscription for session updates
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`agent-sessions-list-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_sessions",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          loadSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const loadSessions = async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_agent_sessions_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (error) throw error;

      // Sort by most recent first
      const sorted = (data || []).sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setSessions(sorted);
    } catch (error) {
      console.error("Error loading sessions:", error);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "running":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: "default",
      failed: "destructive",
      running: "secondary",
    };
    return (
      <Badge variant={variants[status] || "outline"} className="text-xs">
        {status}
      </Badge>
    );
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-b bg-muted/30">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between p-3 h-auto">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Session History</span>
            <Badge variant="outline" className="text-xs">
              {sessions.length}
            </Badge>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="max-h-64 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <p className="text-sm">Loading sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <p className="text-sm">No agent sessions yet.</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {sessions.map((session) => (
              <Button
                key={session.id}
                variant={activeSessionId === session.id ? "secondary" : "ghost"}
                className="w-full justify-start h-auto p-2 text-left"
                onClick={() => onSelectSession(session.id)}
              >
                <div className="flex flex-col items-start gap-1 w-full min-w-0">
                  <div className="flex items-center gap-2 w-full">
                    {getStatusIcon(session.status)}
                    {getStatusBadge(session.status)}
                    <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                      {new Date(session.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  {session.task_description && (
                    <p className="text-xs line-clamp-1 w-full">
                      {session.task_description}
                    </p>
                  )}
                </div>
              </Button>
            ))}
          </div>
        )}
      </CollapsibleContent>
      
      {activeSession && (
        <div className="p-3 border-t bg-background/50">
          <div className="text-xs text-muted-foreground mb-1">Active Session:</div>
          <div className="flex items-center gap-2">
            {getStatusIcon(activeSession.status)}
            {getStatusBadge(activeSession.status)}
            <span className="text-xs flex-1 truncate">
              {activeSession.task_description || "No description"}
            </span>
          </div>
        </div>
      )}
    </Collapsible>
  );
}
