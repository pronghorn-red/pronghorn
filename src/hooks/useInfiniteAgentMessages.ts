import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AgentMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  metadata: any;
  created_at: string;
}

export function useInfiniteAgentMessages(projectId: string | null, shareToken: string | null, agentType: string = "coding") {
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
        p_token: shareToken || null,
        p_project_id: projectId,
        p_session_id: null,
        p_limit: LIMIT,
        p_offset: 0,
        p_since: null,
        p_agent_type: agentType,
      });

      if (error) throw error;
      
      // Filter out internal system messages (operation results, hidden messages)
      const filteredData = ((data as AgentMessage[]) || []).filter(msg => {
        // Hide system messages and messages with hidden metadata
        if (msg.role === 'system') return false;
        if (msg.metadata?.hidden) return false;
        if (msg.metadata?.type === 'operation_results') return false;
        return true;
      }).reverse(); // Reverse to show oldest first (RPC returns DESC order)
      
      setMessages(filteredData);
      setHasMore((data || []).length === LIMIT);
      setOffset(LIMIT);
    } catch (error) {
      console.error("Error loading messages:", error);
      setMessages([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [projectId, shareToken, agentType]);

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

  // Debounce ref to prevent rapid refetches
  const refetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
          // Debounce refetches to prevent flickering
          if (refetchTimeoutRef.current) {
            clearTimeout(refetchTimeoutRef.current);
          }
          refetchTimeoutRef.current = setTimeout(() => {
            loadInitialMessages();
          }, 300);
        }
      )
      // Broadcast listener for immediate updates from orchestrator
      .on("broadcast", { event: "agent_message_refresh" }, (payload) => {
        console.log("[AgentMessages] Broadcast received:", payload);
        if (refetchTimeoutRef.current) {
          clearTimeout(refetchTimeoutRef.current);
        }
        refetchTimeoutRef.current = setTimeout(() => {
          loadInitialMessages();
        }, 300);
      })
      .subscribe((status) => {
        console.log(`[AgentMessages] Subscription status: ${status}`);
      });

    return () => {
      console.log(`[AgentMessages] Cleaning up subscription for project ${projectId}`);
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [projectId, loadInitialMessages]);

  const loadMore = useCallback(async () => {
    if (!projectId || loading || !hasMore) return;

    setLoading(true);
    
    try {
      const { data, error } = await supabase.rpc("get_agent_messages_with_token", {
        p_token: shareToken || null,
        p_project_id: projectId,
        p_session_id: null,
        p_limit: LIMIT,
        p_offset: offset,
        p_since: null,
        p_agent_type: agentType,
      });

      if (error) throw error;
      
      // Filter out internal system messages (operation results, hidden messages)
      const newMessages = ((data as AgentMessage[]) || []).filter(msg => {
        if (msg.role === 'system') return false;
        if (msg.metadata?.hidden) return false;
        if (msg.metadata?.type === 'operation_results') return false;
        return true;
      }).reverse(); // Reverse to show oldest first
      setMessages((prev) => [...prev, ...newMessages]);
      setHasMore(newMessages.length === LIMIT);
      setOffset((prev) => prev + LIMIT);
    } catch (error) {
      console.error("Error loading more messages:", error);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [projectId, shareToken, offset, loading, hasMore, agentType]);

  return { messages, loading, hasMore, loadMore, refetch: loadInitialMessages };
}
