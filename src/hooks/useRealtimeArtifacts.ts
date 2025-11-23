import { useEffect, useState } from "react";
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

  const loadArtifacts = async () => {
    if (!projectId || !enabled) return;

    try {
      const { data, error } = await supabase.rpc("get_artifacts_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (error) throw error;
      setArtifacts(data || []);
    } catch (error) {
      console.error("Error loading artifacts:", error);
      toast.error("Failed to load artifacts");
    } finally {
      setIsLoading(false);
    }
  };

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
        () => {
          loadArtifacts();
        }
      )
      .on("broadcast", { event: "artifact_refresh" }, () => {
        loadArtifacts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, enabled, shareToken]);

  const addArtifact = async (content: string, sourceType?: string, sourceId?: string) => {
    if (!projectId) return;

    try {
      const { data, error } = await supabase.rpc("insert_artifact_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_content: content,
        p_source_type: sourceType || null,
        p_source_id: sourceId || null,
      });

      if (error) throw error;
      toast.success("Artifact created successfully");
      return data;
    } catch (error) {
      console.error("Error creating artifact:", error);
      toast.error("Failed to create artifact");
      throw error;
    }
  };

  const updateArtifact = async (
    id: string,
    content?: string,
    aiTitle?: string,
    aiSummary?: string
  ) => {
    // Store original for rollback
    const originalArtifacts = artifacts;

    try {
      // Optimistically update UI
      setArtifacts((prev) =>
        prev.map((artifact) =>
          artifact.id === id
            ? {
                ...artifact,
                ...(content !== undefined && { content }),
                ...(aiTitle !== undefined && { ai_title: aiTitle }),
                ...(aiSummary !== undefined && { ai_summary: aiSummary }),
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
      });

      if (error) throw error;
      toast.success("Artifact updated successfully");
      return data;
    } catch (error) {
      // Rollback on error
      setArtifacts(originalArtifacts);
      console.error("Error updating artifact:", error);
      toast.error("Failed to update artifact");
      throw error;
    }
  };

  const deleteArtifact = async (id: string) => {
    try {
      const { error } = await supabase.rpc("delete_artifact_with_token", {
        p_id: id,
        p_token: shareToken || null,
      });

      if (error) throw error;
      toast.success("Artifact deleted successfully");
    } catch (error) {
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
