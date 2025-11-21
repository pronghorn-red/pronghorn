import { useEffect, useState } from "react";
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

  // Fetch initial layers
  useEffect(() => {
    if (!projectId) return;

    const fetchLayers = async () => {
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

    fetchLayers();
  }, [projectId, token]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`canvas_layers:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "canvas_layers",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setLayers((prev) => [...prev, payload.new as Layer]);
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const saveLayer = async (layer: Partial<Layer> & { id: string }) => {
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
    }
  };

  const deleteLayer = async (layerId: string) => {
    const { error } = await supabase.rpc("delete_canvas_layer_with_token", {
      p_id: layerId,
      p_token: token || null,
    });

    if (error) {
      console.error("Error deleting layer:", error);
    }
  };

  return { layers, isLoading, saveLayer, deleteLayer };
}
