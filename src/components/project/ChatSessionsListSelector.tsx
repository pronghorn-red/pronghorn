import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface ChatSession {
  id: string;
  title: string | null;
  ai_title: string | null;
  created_at: string;
}

interface ChatSessionsListSelectorProps {
  projectId: string;
  shareToken: string | null;
  selectedChats: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
}

export function ChatSessionsListSelector({
  projectId,
  shareToken,
  selectedChats,
  onSelectionChange
}: ChatSessionsListSelectorProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, [projectId]);

  const loadSessions = async () => {
    try {
      const { data } = await supabase.rpc("get_chat_sessions_with_token", {
        p_project_id: projectId,
        p_token: shareToken
      });

      if (data) {
        setSessions(data);
      }
    } catch (error) {
      console.error("Error loading chat sessions:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSession = (id: string) => {
    const newSelected = new Set(selectedChats);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    onSelectionChange(newSelected);
  };

  const handleSelectAll = () => {
    onSelectionChange(new Set(sessions.map(s => s.id)));
  };

  const handleSelectNone = () => {
    onSelectionChange(new Set());
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading chat sessions...</div>;
  }

  if (sessions.length === 0) {
    return <div className="text-sm text-muted-foreground">No chat sessions in this project.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleSelectAll}>
          Select All
        </Button>
        <Button variant="outline" size="sm" onClick={handleSelectNone}>
          Select None
        </Button>
      </div>
      <div className="space-y-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="flex items-start gap-2 p-2 hover:bg-muted/50 rounded"
          >
            <Checkbox
              id={`session-${session.id}`}
              checked={selectedChats.has(session.id)}
              onCheckedChange={() => toggleSession(session.id)}
            />
            <Label
              htmlFor={`session-${session.id}`}
              className="text-sm cursor-pointer flex-1"
            >
              <div className="font-medium">
                {session.ai_title || session.title || "Untitled Chat"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
              </div>
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}
