import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Layer {
  id: string;
  project_id: string;
  name: string;
  node_ids: string[];
  visible: boolean;
  created_at: string;
  updated_at: string;
}

export function useRealtimeLayers(projectId: string, token: string | null) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<any>(null);

  const loadLayers = async () => {
    if (!projectId) return;

    const { data, error } = await supabase.rpc("get_canvas_layers_with_token", {
      p_project_id: projectId,
      p_token: token || null,
    });

    if (error) {
      console.error("Error fetching layers:", error);
    } else {
      setLayers(data || []);
    }
    setIsLoading(false);
  };

  // Fetch initial layers
  useEffect(() => {
    loadLayers();
  }, [projectId, token]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`canvas-layers-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "canvas_layers",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log("Canvas layers change:", payload);
          
          if (payload.eventType === "INSERT") {
            setLayers((prev) => {
              // Check if layer already exists (from optimistic update)
              const exists = prev.some(layer => layer.id === payload.new.id);
              if (exists) {
                // Replace optimistic layer with real database layer
                return prev.map(layer => 
                  layer.id === payload.new.id ? (payload.new as Layer) : layer
                );
              }
              return [...prev, payload.new as Layer];
            });
          } else if (payload.eventType === "UPDATE") {
            setLayers((prev) =>
              prev.map((layer) =>
                layer.id === payload.new.id ? (payload.new as Layer) : layer
              )
            );
          } else if (payload.eventType === "DELETE") {
            setLayers((prev) => prev.filter((layer) => layer.id !== payload.old.id));
          }
        }
      )
      .on(
        "broadcast",
        { event: "layers_refresh" },
        (payload) => {
          console.log("Received layers refresh broadcast:", payload);
          loadLayers();
        }
      )
      .subscribe((status) => {
        console.log("Layers channel status:", status);
        if (status === 'SUBSCRIBED') {
          console.log("✅ Layers realtime connected");
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error("❌ Layers realtime connection failed:", status);
          // Refetch data if connection fails
          loadLayers();
        } else if (status === 'CLOSED') {
          console.warn("⚠️ Layers realtime connection closed");
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [projectId, token]);

  const saveLayer = async (layer: Partial<Layer> & { id: string }) => {
    // Optimistic update: Update UI immediately
    setLayers((prev) => {
      const existingIndex = prev.findIndex((l) => l.id === layer.id);
      if (existingIndex >= 0) {
        // Update existing layer
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], ...layer };
        return updated;
      } else {
        // Add new layer
        return [...prev, { ...layer, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Layer];
      }
    });

    const { error } = await supabase.rpc("upsert_canvas_layer_with_token", {
      p_id: layer.id,
      p_project_id: projectId,
      p_token: token || null,
      p_name: layer.name || "Untitled Layer",
      p_node_ids: layer.node_ids || [],
      p_visible: layer.visible ?? true,
    });

    if (error) {
      console.error("Error saving layer:", error);
      // Revert on error by refetching
      loadLayers();
    } else if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "layers_refresh",
        payload: { projectId, layerId: layer.id },
      });
    }
  };

  const deleteLayer = async (layerId: string) => {
    // Optimistic update: Remove from UI immediately
    setLayers((prev) => prev.filter((l) => l.id !== layerId));

    const { error } = await supabase.rpc("delete_canvas_layer_with_token", {
      p_id: layerId,
      p_token: token || null,
    });

    if (error) {
      console.error("Error deleting layer:", error);
      // Revert on error by refetching
      loadLayers();
    } else if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "layers_refresh",
        payload: { projectId, layerId },
      });
    }
  };

  return { layers, isLoading, saveLayer, deleteLayer };
}
