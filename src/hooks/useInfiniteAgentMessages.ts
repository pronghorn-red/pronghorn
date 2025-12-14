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

  const loadInitialMessages = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setOffset(0);
    
    try {
      const { data, error } = await supabase.rpc("get_agent_messages_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_limit: LIMIT,
        p_offset: 0,
      });

      if (error) throw error;
      
      setMessages((data as AgentMessage[]) || []);
      setHasMore((data || []).length === LIMIT);
      setOffset(LIMIT);
    } catch (error) {
      console.error("Error loading messages:", error);
      setMessages([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [projectId, shareToken]);

  // Load initial messages
  useEffect(() => {
    if (!projectId) {
      setMessages([]);
      setOffset(0);
      setHasMore(true);
      return;
    }

    loadInitialMessages();
  }, [projectId, shareToken, loadInitialMessages]);

  // Real-time subscription for new messages across all sessions
  useEffect(() => {
    if (!projectId) return;

    console.log(`[AgentMessages] Setting up subscription for project ${projectId}`);

    const channel = supabase
      .channel(`agent-messages-project-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_messages",
        },
        (payload) => {
          console.log("[AgentMessages] Postgres change received:", payload);
          loadInitialMessages();
        }
      )
      // Broadcast listener for immediate updates from orchestrator
      .on("broadcast", { event: "agent_message_refresh" }, (payload) => {
        console.log("[AgentMessages] Broadcast received:", payload);
        loadInitialMessages();
      })
      .subscribe((status) => {
        console.log(`[AgentMessages] Subscription status: ${status}`);
      });

    return () => {
      console.log(`[AgentMessages] Cleaning up subscription for project ${projectId}`);
      supabase.removeChannel(channel);
    };
  }, [projectId, loadInitialMessages]);

  const loadMore = useCallback(async () => {
    if (!projectId || loading || !hasMore) return;

    setLoading(true);
    
    try {
      const { data, error } = await supabase.rpc("get_agent_messages_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_limit: LIMIT,
        p_offset: offset,
      });

      if (error) throw error;
      
      const newMessages = (data as AgentMessage[]) || [];
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
