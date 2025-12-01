import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";

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

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Agent Sessions
        </CardTitle>
        <CardDescription>
          Click on a session to view its chat and progress history
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full pr-4">
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">Loading sessions...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">No agent sessions yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <Button
                  key={session.id}
                  variant={activeSessionId === session.id ? "secondary" : "ghost"}
                  className="w-full justify-start h-auto p-3"
                  onClick={() => onSelectSession(session.id)}
                >
                  <div className="flex flex-col items-start gap-2 w-full">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(session.status)}
                        {getStatusBadge(session.status)}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(session.created_at).toLocaleString()}
                      </span>
                    </div>
                    {session.task_description && (
                      <p className="text-sm text-left line-clamp-2">
                        {session.task_description}
                      </p>
                    )}
                    {!session.task_description && (
                      <p className="text-sm text-muted-foreground italic">
                        No task description
                      </p>
                    )}
                  </div>
                </Button>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
