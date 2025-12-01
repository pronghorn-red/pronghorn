import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AgentMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  metadata: any;
  created_at: string;
}

export function useInfiniteAgentMessages(projectId: string | null, shareToken: string | null) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 10;

  // Load initial messages
  useEffect(() => {
    if (!projectId) {
      setMessages([]);
      setOffset(0);
      setHasMore(true);
      return;
    }

    loadInitialMessages();
  }, [projectId, shareToken]);

  // Real-time subscription for new messages across all sessions
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`agent-messages-project-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_messages",
        },
        (payload) => {
          const newMessage = payload.new as AgentMessage;
          // Add to top of list if it belongs to this project
          setMessages((prev) => [newMessage, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const loadInitialMessages = async () => {
    if (!projectId) return;

    setLoading(true);
    setOffset(0);
    
    try {
      const { data, error } = await supabase.rpc("get_agent_messages_by_project_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_limit: LIMIT,
        p_offset: 0,
      });

      if (error) throw error;
      
      setMessages(data || []);
      setHasMore((data || []).length === LIMIT);
      setOffset(LIMIT);
    } catch (error) {
      console.error("Error loading messages:", error);
      setMessages([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = useCallback(async () => {
    if (!projectId || loading || !hasMore) return;

    setLoading(true);
    
    try {
      const { data, error } = await supabase.rpc("get_agent_messages_by_project_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_limit: LIMIT,
        p_offset: offset,
      });

      if (error) throw error;
      
      const newMessages = data || [];
      setMessages((prev) => [...prev, ...newMessages]);
      setHasMore(newMessages.length === LIMIT);
      setOffset((prev) => prev + LIMIT);
    } catch (error) {
      console.error("Error loading more messages:", error);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [projectId, shareToken, offset, loading, hasMore]);

  return { messages, loading, hasMore, loadMore, refetch: loadInitialMessages };
}
