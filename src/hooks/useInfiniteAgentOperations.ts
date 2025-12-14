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

export function useInfiniteAgentOperations(projectId: string | null, shareToken: string | null) {
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
  }, [projectId, shareToken]);

  // Load initial operations
  useEffect(() => {
    if (!projectId) {
      setOperations([]);
      setOffset(0);
      setHasMore(true);
      return;
    }

    loadInitialOperations();
  }, [projectId, shareToken, loadInitialOperations]);

  // Real-time subscription for new operations across all sessions
  useEffect(() => {
    if (!projectId) return;

    console.log(`[AgentOperations] Setting up subscription for project ${projectId}`);

    const channel = supabase
      .channel(`agent-operations-project-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_file_operations",
        },
        (payload) => {
          console.log("[AgentOperations] Postgres change received:", payload);
          loadInitialOperations();
        }
      )
      // Broadcast listener for immediate updates from orchestrator
      .on("broadcast", { event: "agent_operation_refresh" }, (payload) => {
        console.log("[AgentOperations] Broadcast received:", payload);
        loadInitialOperations();
      })
      .subscribe((status) => {
        console.log(`[AgentOperations] Subscription status: ${status}`);
      });

    return () => {
      console.log(`[AgentOperations] Cleaning up subscription for project ${projectId}`);
      supabase.removeChannel(channel);
    };
  }, [projectId, loadInitialOperations]);

  const loadMore = useCallback(async () => {
    if (!projectId || loading || !hasMore) return;

    setLoading(true);
    
    try {
      const { data, error } = await supabase.rpc("get_agent_operations_by_project_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_limit: LIMIT,
        p_offset: offset,
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
  }, [projectId, shareToken, offset, loading, hasMore]);

  return { operations, loading, hasMore, loadMore, refetch: loadInitialOperations };
}
