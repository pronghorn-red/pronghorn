import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const displayedSessions = sessions.slice(0, 10);

  return (
    <Accordion type="single" collapsible defaultValue="current" className="border-b bg-muted/30">
      <AccordionItem value="current" className="border-none">
        <AccordionTrigger className="px-3 py-2 hover:no-underline">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Session History</span>
            <Badge variant="outline" className="text-xs">
              {sessions.length}
            </Badge>
          </div>
        </AccordionTrigger>
        
        <AccordionContent className="px-2 pb-2">
          {loading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <p className="text-xs">Loading sessions...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <p className="text-xs">No agent sessions yet.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {displayedSessions.map((session) => (
                <Button
                  key={session.id}
                  variant={activeSessionId === session.id ? "secondary" : "ghost"}
                  className="w-full justify-start h-auto p-2 text-left"
                  onClick={() => onSelectSession(session.id)}
                >
                  <div className="flex flex-col items-start gap-0.5 w-full min-w-0">
                    <div className="flex items-center gap-2 w-full">
                      {getStatusIcon(session.status)}
                      {getStatusBadge(session.status)}
                      <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                        {new Date(session.created_at).toLocaleDateString()} {new Date(session.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {session.task_description && (
                      <p className="text-xs line-clamp-1 w-full text-muted-foreground">
                        {session.task_description}
                      </p>
                    )}
                  </div>
                </Button>
              ))}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
      
      {activeSession && (
        <div className="px-3 py-2 border-t bg-background/50">
          <div className="flex items-center gap-2">
            {getStatusIcon(activeSession.status)}
            {getStatusBadge(activeSession.status)}
            <span className="text-xs flex-1 truncate">
              {activeSession.task_description || "No description"}
            </span>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {new Date(activeSession.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}
    </Accordion>
  );
}
