import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Deployment = Database["public"]["Tables"]["project_deployments"]["Row"];

export const useRealtimeDeployments = (
  projectId: string | undefined,
  shareToken: string | null,
  enabled: boolean = true
) => {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadDeployments = useCallback(async () => {
    if (!projectId || !enabled) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_deployments_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (!error) {
        setDeployments((data as Deployment[]) || []);
      }
    } catch (error) {
      console.error("Error loading deployments:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, shareToken, enabled]);

  // Refresh from Render.com for cloud deployments, then reload from DB
  const refreshFromRender = useCallback(async () => {
    if (!projectId || !enabled) return;

    setIsRefreshing(true);
    try {
      // Get current deployments from DB first
      const { data: currentDeployments } = await supabase.rpc("get_deployments_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      const cloudDeployments = (currentDeployments as Deployment[] || []).filter(
        d => d.platform === "pronghorn_cloud" && d.render_service_id
      );

      // For each cloud deployment with a render_service_id, fetch real status
      for (const deployment of cloudDeployments) {
        try {
          await supabase.functions.invoke("render-service", {
            body: {
              action: "status",
              deploymentId: deployment.id,
              shareToken: shareToken,
            },
          });
        } catch (err) {
          console.error(`Failed to refresh status for ${deployment.id}:`, err);
        }
      }

      // Reload from DB to get updated statuses
      await loadDeployments();
    } catch (error) {
      console.error("Error refreshing from Render:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [projectId, shareToken, enabled, loadDeployments]);

  // Broadcast refresh to other clients
  const broadcastRefresh = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "deployment_refresh",
        payload: { projectId },
      });
    }
  }, [projectId]);

  useEffect(() => {
    loadDeployments();

    if (!projectId || !enabled) return;

    const channel = supabase
      .channel(`deployments-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_deployments",
          filter: `project_id=eq.${projectId}`,
        },
        () => loadDeployments()
      )
      .on("broadcast", { event: "deployment_refresh" }, () => loadDeployments())
      .subscribe((status) => {
        console.log("Deployments channel status:", status);
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [projectId, enabled, shareToken, loadDeployments]);

  return {
    deployments,
    isLoading,
    isRefreshing,
    refresh: refreshFromRender,
    broadcastRefresh,
  };
};
