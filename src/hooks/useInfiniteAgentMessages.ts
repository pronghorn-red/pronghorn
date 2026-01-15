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
  const LIMIT = 50;

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

  // Ref for loading state to avoid stale closure in subscription callback
  const loadingRef = useRef(loading);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  // Real-time subscription for agent-type-specific broadcast channel
  useEffect(() => {
    if (!projectId) return;

    console.log(`[AgentMessages] Setting up broadcast subscription for project ${projectId}, type ${agentType}`);

    const channel = supabase
      .channel(`agent-messages-project-${projectId}-${agentType}`)
      .on('broadcast', { event: 'agent_message_refresh' }, (payload) => {
        console.log(`[AgentMessages] Received refresh broadcast for ${agentType}:`, payload);
        // Reload messages when we receive a broadcast from our agent type
        loadInitialMessages();
      })
      .subscribe((status) => {
        console.log(`[AgentMessages] Broadcast subscription status: ${status}`);
      });

    return () => {
      console.log(`[AgentMessages] Cleaning up broadcast subscription for project ${projectId}, type ${agentType}`);
      supabase.removeChannel(channel);
    };
  }, [projectId, agentType, loadInitialMessages]);

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
