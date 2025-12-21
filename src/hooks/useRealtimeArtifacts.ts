import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Artifact {
  id: string;
  project_id: string;
  content: string;
  ai_title: string | null;
  ai_summary: string | null;
  source_type: string | null;
  source_id: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export const useRealtimeArtifacts = (
  projectId: string | undefined,
  shareToken: string | null,
  enabled: boolean = true
) => {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingDeletionsRef = useRef<Set<string>>(new Set());

  // Wrap loadArtifacts in useCallback with shareToken in dependencies
  const loadArtifacts = useCallback(async () => {
    if (!projectId || !enabled) return;

    try {
      const { data, error } = await supabase.rpc("get_artifacts_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (error) throw error;
      
      // Filter out any artifacts that are pending deletion
      const filteredData = (data || []).filter(
        (artifact: Artifact) => !pendingDeletionsRef.current.has(artifact.id)
      );
      setArtifacts(filteredData);
    } catch (error) {
      console.error("Error loading artifacts:", error);
      toast.error("Failed to load artifacts");
    } finally {
      setIsLoading(false);
    }
  }, [projectId, shareToken, enabled]);

  useEffect(() => {
    loadArtifacts();

    if (!projectId || !enabled) return;

    const channel = supabase
      .channel(`artifacts-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "artifacts",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log("Artifacts postgres_changes:", payload);
          
          // Skip reload if this is a delete we initiated
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id?: string })?.id;
            if (deletedId && pendingDeletionsRef.current.has(deletedId)) {
              pendingDeletionsRef.current.delete(deletedId);
              return; // Don't reload, we already removed it optimistically
            }
          }
          
          loadArtifacts();
        }
      )
      .on("broadcast", { event: "artifact_refresh" }, (payload) => {
        console.log("Received artifacts refresh broadcast:", payload);
        
        // Skip if this is a delete broadcast for something we're deleting
        if (payload.payload?.action === 'delete') {
          const deletedId = payload.payload?.id;
          if (deletedId && pendingDeletionsRef.current.has(deletedId)) {
            return; // Don't reload
          }
        }
        
        loadArtifacts();
      })
      .subscribe((status) => {
        console.log("Artifacts channel status:", status);
        if (status === 'SUBSCRIBED') {
          console.log("✅ Artifacts realtime connected");
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error("❌ Artifacts realtime connection failed:", status);
          loadArtifacts();
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [projectId, enabled, shareToken, loadArtifacts]);

  const addArtifact = async (content: string, sourceType?: string, sourceId?: string, imageUrl?: string) => {
    if (!projectId) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticArtifact: Artifact = {
      id: tempId,
      project_id: projectId,
      content,
      ai_title: null,
      ai_summary: null,
      source_type: sourceType || null,
      source_id: sourceId || null,
      image_url: imageUrl || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: null,
    };

    setArtifacts((prev) => [...prev, optimisticArtifact]);

    try {
      const { data, error } = await supabase.rpc("insert_artifact_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_content: content,
        p_source_type: sourceType || null,
        p_source_id: sourceId || null,
        p_image_url: imageUrl || null,
      });

      if (error) throw error;

      if (data) {
        setArtifacts((prev) =>
          prev.map((artifact) => (artifact.id === tempId ? data : artifact))
        );
      }

      // Broadcast using the subscribed channel reference (like Canvas does)
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'artifact_refresh',
          payload: { action: 'insert', id: data?.id }
        });
      }

      toast.success("Artifact created successfully");
      return data;
    } catch (error) {
      setArtifacts((prev) => prev.filter((artifact) => artifact.id !== tempId));
      console.error("Error creating artifact:", error);
      toast.error("Failed to create artifact");
      throw error;
    }
  };

  const updateArtifact = async (
    id: string,
    content?: string,
    aiTitle?: string,
    aiSummary?: string,
    imageUrl?: string
  ) => {
    const originalArtifacts = artifacts;

    try {
      setArtifacts((prev) =>
        prev.map((artifact) =>
          artifact.id === id
            ? {
                ...artifact,
                ...(content !== undefined && { content }),
                ...(aiTitle !== undefined && { ai_title: aiTitle }),
                ...(aiSummary !== undefined && { ai_summary: aiSummary }),
                ...(imageUrl !== undefined && { image_url: imageUrl }),
                updated_at: new Date().toISOString(),
              }
            : artifact
        )
      );

      const { data, error } = await supabase.rpc("update_artifact_with_token", {
        p_id: id,
        p_token: shareToken || null,
        p_content: content || null,
        p_ai_title: aiTitle || null,
        p_ai_summary: aiSummary || null,
        p_image_url: imageUrl || null,
      });

      if (error) throw error;
      
      // Broadcast using the subscribed channel reference (like Canvas does)
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'artifact_refresh',
          payload: { action: 'update', id }
        });
      }
      
      toast.success("Artifact updated successfully");
      return data;
    } catch (error) {
      setArtifacts(originalArtifacts);
      console.error("Error updating artifact:", error);
      toast.error("Failed to update artifact");
      throw error;
    }
  };

  const deleteArtifact = async (id: string) => {
    const originalArtifacts = artifacts;

    try {
      // Mark as pending deletion BEFORE removing from UI
      pendingDeletionsRef.current.add(id);
      
      // Optimistically remove from UI
      setArtifacts((prev) => prev.filter((artifact) => artifact.id !== id));

      const { error } = await supabase.rpc("delete_artifact_with_token", {
        p_id: id,
        p_token: shareToken || null,
      });

      if (error) throw error;
      
      // Broadcast using the subscribed channel reference (like Canvas does)
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'artifact_refresh',
          payload: { action: 'delete', id }
        });
      }
      
      toast.success("Artifact deleted successfully");
    } catch (error) {
      // Remove from pending on error
      pendingDeletionsRef.current.delete(id);
      setArtifacts(originalArtifacts);
      console.error("Error deleting artifact:", error);
      toast.error("Failed to delete artifact");
      throw error;
    }
  };

  return {
    artifacts,
    isLoading,
    addArtifact,
    updateArtifact,
    deleteArtifact,
    refresh: loadArtifacts,
  };
};
