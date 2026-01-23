import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProjectCanvas {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  tags: string[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export function useProjectCanvases(projectId: string, token: string | null) {
  const [canvases, setCanvases] = useState<ProjectCanvas[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<any>(null);

  // Load canvases from database
  const loadCanvases = useCallback(async () => {
    if (!projectId) return;

    try {
      const { data, error } = await supabase.rpc("get_project_canvases_with_token", {
        p_project_id: projectId,
        p_token: token || null,
      });

      if (error) {
        console.error("Error fetching canvases:", error);
        // If no canvases exist, create a virtual "Canvas 1" for backward compatibility
        setCanvases([]);
      } else {
        setCanvases((data as ProjectCanvas[]) || []);
        
        // Auto-select default canvas or first canvas
        if (data && data.length > 0 && !activeCanvasId) {
          const defaultCanvas = data.find((c: ProjectCanvas) => c.is_default);
          setActiveCanvasId(defaultCanvas?.id || data[0].id);
        }
      }
    } catch (err) {
      console.error("Error loading canvases:", err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, token, activeCanvasId]);

  // Initial load
  useEffect(() => {
    loadCanvases();
  }, [loadCanvases]);

  // Real-time subscription
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`project-canvases-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_canvases",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log("Project canvases change:", payload);
          
          if (payload.eventType === "INSERT") {
            setCanvases((prev) => {
              const exists = prev.some(c => c.id === payload.new.id);
              if (exists) return prev;
              return [...prev, payload.new as ProjectCanvas];
            });
          } else if (payload.eventType === "UPDATE") {
            setCanvases((prev) =>
              prev.map((canvas) =>
                canvas.id === payload.new.id ? (payload.new as ProjectCanvas) : canvas
              )
            );
          } else if (payload.eventType === "DELETE") {
            setCanvases((prev) => prev.filter((canvas) => canvas.id !== payload.old.id));
            // If deleted canvas was active, switch to first available
            if (activeCanvasId === payload.old.id) {
              setActiveCanvasId(null);
            }
          }
        }
      )
      .on(
        "broadcast",
        { event: "canvases_refresh" },
        () => {
          loadCanvases();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [projectId, token, activeCanvasId, loadCanvases]);

  // Save canvas (create or update)
  const saveCanvas = async (canvas: Partial<ProjectCanvas> & { id: string }) => {
    // Optimistic update
    setCanvases((prev) => {
      const existingIndex = prev.findIndex((c) => c.id === canvas.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], ...canvas };
        return updated;
      } else {
        return [...prev, {
          ...canvas,
          project_id: projectId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as ProjectCanvas];
      }
    });

    const { error } = await supabase.rpc("upsert_project_canvas_with_token", {
      p_id: canvas.id,
      p_project_id: projectId,
      p_token: token || null,
      p_name: canvas.name || "Untitled Canvas",
      p_description: canvas.description || null,
      p_tags: canvas.tags || [],
      p_is_default: canvas.is_default || false,
    });

    if (error) {
      console.error("Error saving canvas:", error);
      loadCanvases(); // Revert on error
    } else if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "canvases_refresh",
        payload: { projectId, canvasId: canvas.id },
      });
    }
  };

  // Delete canvas
  const deleteCanvas = async (canvasId: string) => {
    // Optimistic update
    setCanvases((prev) => prev.filter((c) => c.id !== canvasId));
    
    // If deleting active canvas, switch to another
    if (activeCanvasId === canvasId) {
      const remaining = canvases.filter(c => c.id !== canvasId);
      setActiveCanvasId(remaining.length > 0 ? remaining[0].id : null);
    }

    const { error } = await supabase.rpc("delete_project_canvas_with_token", {
      p_id: canvasId,
      p_token: token || null,
    });

    if (error) {
      console.error("Error deleting canvas:", error);
      loadCanvases(); // Revert on error
    } else if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "canvases_refresh",
        payload: { projectId, canvasId },
      });
    }
  };

  // Migrate legacy data to a canvas
  const migrateLegacyData = async (canvasId: string) => {
    const { error } = await supabase.rpc("migrate_legacy_canvas_data", {
      p_project_id: projectId,
      p_canvas_id: canvasId,
      p_token: token || null,
    });

    if (error) {
      console.error("Error migrating legacy data:", error);
      throw error;
    }
  };

  // Navigate to previous canvas
  const goToPreviousCanvas = useCallback(() => {
    if (canvases.length === 0) return;
    
    const currentIndex = canvases.findIndex(c => c.id === activeCanvasId);
    const prevIndex = currentIndex <= 0 ? canvases.length - 1 : currentIndex - 1;
    setActiveCanvasId(canvases[prevIndex].id);
  }, [canvases, activeCanvasId]);

  // Navigate to next canvas
  const goToNextCanvas = useCallback(() => {
    if (canvases.length === 0) return;
    
    const currentIndex = canvases.findIndex(c => c.id === activeCanvasId);
    const nextIndex = currentIndex >= canvases.length - 1 ? 0 : currentIndex + 1;
    setActiveCanvasId(canvases[nextIndex].id);
  }, [canvases, activeCanvasId]);

  // Get current canvas
  const activeCanvas = canvases.find(c => c.id === activeCanvasId) || null;

  // Check if we're in legacy mode (no explicit canvases yet)
  const isLegacyMode = canvases.length === 0;

  return {
    canvases,
    activeCanvasId,
    activeCanvas,
    setActiveCanvasId,
    isLoading,
    isLegacyMode,
    saveCanvas,
    deleteCanvas,
    migrateLegacyData,
    goToPreviousCanvas,
    goToNextCanvas,
    reloadCanvases: loadCanvases,
  };
}
