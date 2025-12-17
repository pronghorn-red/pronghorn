import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ExternalDatabaseConnection {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  host: string | null;
  port: number;
  database_name: string | null;
  ssl_mode: string | null;
  status: string;
  last_connected_at: string | null;
  last_error: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export const useRealtimeExternalDatabases = (
  projectId: string | undefined,
  shareToken: string | null,
  enabled: boolean = true
) => {
  const [connections, setConnections] = useState<ExternalDatabaseConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadConnections = useCallback(async () => {
    if (!projectId || !enabled) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_db_connections_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (!error) {
        setConnections((data as ExternalDatabaseConnection[]) || []);
      } else {
        // Owner-only access - non-owners get empty list
        console.log("External connections access:", error.message);
        setConnections([]);
      }
    } catch (error) {
      console.error("Error loading external connections:", error);
      setConnections([]);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, shareToken, enabled]);

  const broadcastRefresh = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "external_db_refresh",
        payload: { projectId },
      });
    }
  }, [projectId]);

  useEffect(() => {
    loadConnections();

    if (!projectId || !enabled) return;

    const channel = supabase
      .channel(`external-databases-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_database_connections",
          filter: `project_id=eq.${projectId}`,
        },
        () => loadConnections()
      )
      .on("broadcast", { event: "external_db_refresh" }, () => loadConnections())
      .subscribe((status) => {
        console.log("External databases channel status:", status);
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [projectId, enabled, shareToken, loadConnections]);

  return {
    connections,
    isLoading,
    refresh: loadConnections,
    broadcastRefresh,
  };
};
