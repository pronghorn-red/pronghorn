import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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

export function useInfiniteAgentOperations(
  projectId: string | null, 
  shareToken: string | null,
  agentType: string = "coding"
) {
  const [operations, setOperations] = useState<AgentOperation[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 10;

  const loadInitialOperations = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setOffset(0);
    
    try {
      const { data, error } = await supabase.rpc("get_agent_operations_by_project_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_limit: LIMIT,
        p_offset: 0,
        p_agent_type: agentType,
      });

      if (error) throw error;
      
      setOperations(data || []);
      setHasMore((data || []).length === LIMIT);
      setOffset(LIMIT);
    } catch (error) {
      console.error("Error loading operations:", error);
      setOperations([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [projectId, shareToken, agentType]);

  // Load initial operations
  useEffect(() => {
    if (!projectId) {
      setOperations([]);
      setOffset(0);
      setHasMore(true);
      return;
    }

    loadInitialOperations();
  }, [projectId, shareToken, agentType, loadInitialOperations]);

  // Real-time subscription for agent-type-specific broadcast channel
  useEffect(() => {
    if (!projectId) return;

    console.log(`[AgentOperations] Setting up broadcast subscription for project ${projectId}, type ${agentType}`);

    const channel = supabase
      .channel(`agent-operations-project-${projectId}-${agentType}`)
      .on('broadcast', { event: 'agent_operation_refresh' }, (payload) => {
        console.log(`[AgentOperations] Received refresh broadcast for ${agentType}:`, payload);
        loadInitialOperations();
      })
      .subscribe((status) => {
        console.log(`[AgentOperations] Broadcast subscription status: ${status}`);
      });

    return () => {
      console.log(`[AgentOperations] Cleaning up broadcast subscription for project ${projectId}, type ${agentType}`);
      supabase.removeChannel(channel);
    };
  }, [projectId, agentType, loadInitialOperations]);

  const loadMore = useCallback(async () => {
    if (!projectId || loading || !hasMore) return;

    setLoading(true);
    
    try {
      const { data, error } = await supabase.rpc("get_agent_operations_by_project_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_limit: LIMIT,
        p_offset: offset,
        p_agent_type: agentType,
      });

      if (error) throw error;
      
      const newOperations = data || [];
      setOperations((prev) => [...prev, ...newOperations]);
      setHasMore(newOperations.length === LIMIT);
      setOffset((prev) => prev + LIMIT);
    } catch (error) {
      console.error("Error loading more operations:", error);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [projectId, shareToken, agentType, offset, loading, hasMore]);

  return { operations, loading, hasMore, loadMore, refetch: loadInitialOperations };
}
