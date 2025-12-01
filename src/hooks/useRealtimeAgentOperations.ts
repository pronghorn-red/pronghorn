import { useEffect, useState } from "react";
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

export function useRealtimeAgentOperations(sessionId: string | null, shareToken: string | null) {
  const [operations, setOperations] = useState<AgentOperation[]>([]);
  const [loading, setLoading] = useState(false);

  // Load operations
  useEffect(() => {
    if (!sessionId) {
      setOperations([]);
      return;
    }

    loadOperations();
  }, [sessionId, shareToken]);

  // Real-time subscription
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`agent-operations-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_file_operations",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          loadOperations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const loadOperations = async () => {
    if (!sessionId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_agent_operations_with_token", {
        p_session_id: sessionId,
        p_token: shareToken || null,
      });

      if (error) throw error;
      setOperations(data || []);
    } catch (error) {
      console.error("Error loading operations:", error);
      setOperations([]);
    } finally {
      setLoading(false);
    }
  };

  return { operations, loading, refetch: loadOperations };
}
