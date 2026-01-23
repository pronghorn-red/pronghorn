import { useEffect, useState, useRef, useCallback, useMemo } from "react";
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
  // Provenance tracking fields
  provenance_id: string | null;
  provenance_path: string | null;
  provenance_page: number | null;
  provenance_total_pages: number | null;
  // Folder fields
  parent_id: string | null;
  is_folder: boolean;
  // Publishing
  is_published: boolean;
  // For tree structure
  children?: Artifact[];
}

// Build a hierarchical tree from a flat list of artifacts
export const buildArtifactHierarchy = (flatList: Artifact[]): Artifact[] => {
  const map = new Map<string, Artifact>();
  const roots: Artifact[] = [];

  // First pass: create map with children array
  flatList.forEach((item) => {
    map.set(item.id, { ...item, children: [] });
  });

  // Second pass: build hierarchy
  flatList.forEach((item) => {
    const node = map.get(item.id)!;
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  // Sort: folders first, then by title alphabetically
  const sortItems = (items: Artifact[]) => {
    items.sort((a, b) => {
      if (a.is_folder !== b.is_folder) return a.is_folder ? -1 : 1;
      return (a.ai_title || '').localeCompare(b.ai_title || '');
    });
    items.forEach(item => {
      if (item.children?.length) sortItems(item.children);
    });
  };
  sortItems(roots);
  
  return roots;
};

// Get all descendant IDs of an artifact (for folder selection)
export const getAllDescendantIds = (artifact: Artifact): string[] => {
  const descendants: string[] = [artifact.id];
  if (artifact.children) {
    artifact.children.forEach((child) => {
      descendants.push(...getAllDescendantIds(child));
    });
  }
  return descendants;
};

// Get folder path breadcrumbs
export const getArtifactPath = (artifacts: Artifact[], targetId: string): Artifact[] => {
  const path: Artifact[] = [];
  const findPath = (items: Artifact[], target: string): boolean => {
    for (const item of items) {
      if (item.id === target) {
        path.unshift(item);
        return true;
      }
      if (item.children?.length) {
        if (findPath(item.children, target)) {
          path.unshift(item);
          return true;
        }
      }
    }
    return false;
  };
  findPath(artifacts, targetId);
  return path;
};

export const useRealtimeArtifacts = (
  projectId: string | undefined,
  shareToken: string | null,
  enabled: boolean = true
) => {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingDeletionsRef = useRef<Set<string>>(new Set());

  // Build hierarchy from flat list
  const artifactTree = useMemo(() => buildArtifactHierarchy(artifacts), [artifacts]);

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

  const addArtifact = async (
    content: string, 
    sourceType?: string, 
    sourceId?: string, 
    imageUrl?: string,
    parentId?: string,
    options?: {
      title?: string;
      provenanceId?: string;
      provenancePath?: string;
      provenancePage?: number;
      provenanceTotalPages?: number;
    }
  ) => {
    if (!projectId) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticArtifact: Artifact = {
      id: tempId,
      project_id: projectId,
      content,
      ai_title: options?.title || null,
      ai_summary: null,
      source_type: sourceType || null,
      source_id: sourceId || null,
      image_url: imageUrl || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: null,
      provenance_id: options?.provenanceId || null,
      provenance_path: options?.provenancePath || null,
      provenance_page: options?.provenancePage || null,
      provenance_total_pages: options?.provenanceTotalPages || null,
      parent_id: parentId || null,
      is_folder: false,
      is_published: false,
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
        p_ai_title: options?.title || null,
        p_provenance_id: options?.provenanceId || null,
        p_provenance_path: options?.provenancePath || null,
        p_provenance_page: options?.provenancePage || null,
        p_provenance_total_pages: options?.provenanceTotalPages || null,
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

  const addFolder = async (name: string, parentId?: string | null) => {
    if (!projectId) return;

    const tempId = `temp-folder-${Date.now()}`;
    const optimisticFolder: Artifact = {
      id: tempId,
      project_id: projectId,
      content: '',
      ai_title: name,
      ai_summary: null,
      source_type: null,
      source_id: null,
      image_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: null,
      provenance_id: null,
      provenance_path: null,
      provenance_page: null,
      provenance_total_pages: null,
      parent_id: parentId || null,
      is_folder: true,
      is_published: false,
    };

    setArtifacts((prev) => [...prev, optimisticFolder]);

    try {
      const { data, error } = await supabase.rpc("insert_artifact_folder_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_name: name,
        p_parent_id: parentId || null,
      });

      if (error) throw error;

      if (data) {
        setArtifacts((prev) =>
          prev.map((artifact) => (artifact.id === tempId ? data : artifact))
        );
      }

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'artifact_refresh',
          payload: { action: 'insert', id: data?.id }
        });
      }

      toast.success("Folder created successfully");
      return data;
    } catch (error) {
      setArtifacts((prev) => prev.filter((artifact) => artifact.id !== tempId));
      console.error("Error creating folder:", error);
      toast.error("Failed to create folder");
      throw error;
    }
  };

  const moveArtifact = async (artifactId: string, newParentId: string | null) => {
    const originalArtifacts = artifacts;

    try {
      // Optimistically update
      setArtifacts((prev) =>
        prev.map((artifact) =>
          artifact.id === artifactId
            ? { ...artifact, parent_id: newParentId, updated_at: new Date().toISOString() }
            : artifact
        )
      );

      const { data, error } = await supabase.rpc("move_artifact_with_token", {
        p_artifact_id: artifactId,
        p_token: shareToken || null,
        p_new_parent_id: newParentId,
      });

      if (error) throw error;

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'artifact_refresh',
          payload: { action: 'move', id: artifactId }
        });
      }

      toast.success("Artifact moved successfully");
      return data;
    } catch (error: any) {
      setArtifacts(originalArtifacts);
      console.error("Error moving artifact:", error);
      toast.error(error.message || "Failed to move artifact");
      throw error;
    }
  };

  const renameFolder = async (folderId: string, newName: string) => {
    const originalArtifacts = artifacts;

    try {
      setArtifacts((prev) =>
        prev.map((artifact) =>
          artifact.id === folderId
            ? { ...artifact, ai_title: newName, updated_at: new Date().toISOString() }
            : artifact
        )
      );

      const { data, error } = await supabase.rpc("rename_artifact_folder_with_token", {
        p_artifact_id: folderId,
        p_token: shareToken || null,
        p_new_name: newName,
      });

      if (error) throw error;

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'artifact_refresh',
          payload: { action: 'rename', id: folderId }
        });
      }

      toast.success("Folder renamed successfully");
      return data;
    } catch (error) {
      setArtifacts(originalArtifacts);
      console.error("Error renaming folder:", error);
      toast.error("Failed to rename folder");
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
      
      // Optimistically remove from UI (includes children due to cascade)
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

  // Delete a folder but move its children to root first
  const deleteFolder = async (folderId: string) => {
    const originalArtifacts = artifacts;
    const folder = artifacts.find(a => a.id === folderId);
    
    if (!folder || !folder.is_folder) {
      toast.error("Not a valid folder");
      return;
    }

    try {
      // Find all direct children of this folder
      const directChildren = artifacts.filter(a => a.parent_id === folderId);
      
      // Move all children to root first
      for (const child of directChildren) {
        await supabase.rpc("move_artifact_with_token", {
          p_artifact_id: child.id,
          p_token: shareToken || null,
          p_new_parent_id: null,
        });
      }
      
      // Now delete the empty folder
      pendingDeletionsRef.current.add(folderId);
      setArtifacts((prev) => prev.filter((artifact) => artifact.id !== folderId));
      
      // Also update children to have no parent in state
      setArtifacts((prev) => prev.map(a => 
        a.parent_id === folderId ? { ...a, parent_id: null } : a
      ));

      const { error } = await supabase.rpc("delete_artifact_with_token", {
        p_id: folderId,
        p_token: shareToken || null,
      });

      if (error) throw error;
      
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'artifact_refresh',
          payload: { action: 'delete_folder', id: folderId }
        });
      }
      
      toast.success("Folder deleted, contents moved to root");
    } catch (error) {
      pendingDeletionsRef.current.delete(folderId);
      setArtifacts(originalArtifacts);
      console.error("Error deleting folder:", error);
      toast.error("Failed to delete folder");
      throw error;
    }
  };

  const broadcastRefresh = useCallback((action: string = 'refresh', id?: string) => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'artifact_refresh',
        payload: { action, id }
      });
    }
  }, []);

  const updatePublishedStatus = async (id: string, isPublished: boolean) => {
    const originalArtifacts = artifacts;

    try {
      // Optimistic update
      setArtifacts(prev =>
        prev.map(artifact =>
          artifact.id === id
            ? { ...artifact, is_published: isPublished, updated_at: new Date().toISOString() }
            : artifact
        )
      );

      const { data, error } = await supabase.rpc("update_artifact_published_with_token", {
        p_id: id,
        p_token: shareToken || null,
        p_is_published: isPublished,
      });

      if (error) throw error;

      // Broadcast update
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'artifact_refresh',
          payload: { action: 'publish', id }
        });
      }

      toast.success(isPublished ? "Artifact published" : "Artifact unpublished");
      return data;
    } catch (error) {
      setArtifacts(originalArtifacts);
      console.error("Error updating publish status:", error);
      toast.error("Failed to update publish status");
      throw error;
    }
  };

  return {
    artifacts,
    artifactTree,
    isLoading,
    addArtifact,
    addFolder,
    moveArtifact,
    renameFolder,
    updateArtifact,
    updatePublishedStatus,
    deleteArtifact,
    deleteFolder,
    refresh: loadArtifacts,
    broadcastRefresh,
  };
};
