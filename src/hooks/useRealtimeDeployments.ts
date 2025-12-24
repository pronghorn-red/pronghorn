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

  // Merge new deployments with existing ones to avoid UI disruption
  const mergeDeployments = useCallback((newData: Deployment[]) => {
    setDeployments(prev => {
      if (prev.length === 0) return newData;
      
      // Create a map of new deployments by ID
      const newMap = new Map(newData.map(d => [d.id, d]));
      
      // Check if anything actually changed
      let hasChanges = prev.length !== newData.length;
      
      if (!hasChanges) {
        for (const existing of prev) {
          const updated = newMap.get(existing.id);
          if (!updated || 
              existing.status !== updated.status ||
              existing.render_service_id !== updated.render_service_id ||
              existing.url !== updated.url ||
              existing.last_deployed_at !== updated.last_deployed_at) {
            hasChanges = true;
            break;
          }
        }
      }
      
      if (!hasChanges) return prev; // Return same reference to avoid re-render
      
      // Merge: update existing items in place, add new ones, remove deleted ones
      return newData.map(newDep => {
        const existing = prev.find(p => p.id === newDep.id);
        // If fields are the same, preserve the existing object reference
        if (existing &&
            existing.status === newDep.status &&
            existing.render_service_id === newDep.render_service_id &&
            existing.url === newDep.url &&
            existing.last_deployed_at === newDep.last_deployed_at) {
          return existing;
        }
        return newDep;
      });
    });
  }, []);

  const loadDeployments = useCallback(async () => {
    if (!projectId || !enabled) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_deployments_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (!error) {
        mergeDeployments((data as Deployment[]) || []);
      }
    } catch (error) {
      console.error("Error loading deployments:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, shareToken, enabled, mergeDeployments]);

  // Refresh from Render.com for cloud deployments, then reload from DB
  const refreshFromRender = useCallback(async () => {
    if (!projectId || !enabled) return;

    setIsRefreshing(true);
    try {
      // Use current deployments state instead of fetching again
      const cloudDeployments = deployments.filter(
        d => d.platform === "pronghorn_cloud" && d.render_service_id
      );

      // For each cloud deployment with a render_service_id, fetch real status
      await Promise.all(cloudDeployments.map(async (deployment) => {
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
      }));

      // Reload from DB to get updated statuses (uses merge to avoid disruption)
      const { data, error } = await supabase.rpc("get_deployments_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });
      
      if (!error && data) {
        mergeDeployments(data as Deployment[]);
      }
    } catch (error) {
      console.error("Error refreshing from Render:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [projectId, shareToken, enabled, deployments, mergeDeployments]);

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
