import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Requirement } from "@/components/requirements/RequirementsTree";

export function useRealtimeRequirements(
  projectId: string,
  shareToken: string | null,
  enabled: boolean = true
) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<any>(null);

  const buildHierarchy = (flatList: any[]): Requirement[] => {
    const map = new Map<string, Requirement>();
    const roots: Requirement[] = [];

    // Sort by code first
    const sorted = [...flatList].sort((a, b) => {
      const codeA = a.code || "";
      const codeB = b.code || "";
      return codeA.localeCompare(codeB, undefined, { numeric: true });
    });

    // First pass: create all nodes
    sorted.forEach((item) => {
      map.set(item.id, {
        id: item.id,
        code: item.code,
        type: item.type,
        title: item.title,
        content: item.content,
        parentId: item.parent_id,
        children: [],
      });
    });

    // Second pass: build tree
    sorted.forEach((item) => {
      const node = map.get(item.id)!;
      if (item.parent_id) {
        const parent = map.get(item.parent_id);
        if (parent) {
          parent.children!.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  const loadRequirements = async () => {
    if (!enabled) return;
    try {
      const { data, error } = await supabase.rpc("get_requirements_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (error) throw error;

      // Build hierarchical structure
      const hierarchical = buildHierarchy(data || []);
      setRequirements(hierarchical);
    } catch (error) {
      console.error("Error loading requirements:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to check if requirement exists in tree
  const existsInTree = (items: Requirement[], targetId: string): boolean => {
    for (const item of items) {
      if (item.id === targetId) return true;
      if (item.children?.length && existsInTree(item.children, targetId)) return true;
    }
    return false;
  };

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    // Initial load
    loadRequirements();

    // Set up real-time subscription
    const channel = supabase
      .channel(`requirements-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "requirements",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log("Requirements change:", payload);
          
          if (payload.eventType === "INSERT" && payload.new) {
            setRequirements((prev) => {
              // Skip if already exists (was added via optimistic update)
              if (existsInTree(prev, payload.new.id)) {
                console.log("Requirement already exists, skipping duplicate INSERT:", payload.new.id);
                return prev;
              }
              
              // Add new requirement to correct position in hierarchy
              if (payload.new.parent_id) {
                // Add as child - recursive update
                const addToParent = (items: Requirement[]): Requirement[] => {
                  return items.map((item) => {
                    if (item.id === payload.new.parent_id) {
                      const newReq: Requirement = {
                        id: payload.new.id,
                        code: payload.new.code,
                        type: payload.new.type,
                        title: payload.new.title,
                        content: payload.new.content,
                        parentId: payload.new.parent_id,
                        children: [],
                      };
                      return { ...item, children: [...(item.children || []), newReq] };
                    }
                    if (item.children?.length) {
                      return { ...item, children: addToParent(item.children) };
                    }
                    return item;
                  });
                };
                return addToParent(prev);
              } else {
                // Add as root
                const newReq: Requirement = {
                  id: payload.new.id,
                  code: payload.new.code,
                  type: payload.new.type,
                  title: payload.new.title,
                  content: payload.new.content,
                  parentId: null,
                  children: [],
                };
                return [...prev, newReq];
              }
            });
          } else if (payload.eventType === "UPDATE" && payload.new) {
            setRequirements((prev) => {
              // Update requirement in-place
              const updateInTree = (items: Requirement[]): Requirement[] => {
                return items.map((item) => {
                  if (item.id === payload.new.id) {
                    return {
                      ...item,
                      code: payload.new.code,
                      title: payload.new.title,
                      content: payload.new.content,
                    };
                  }
                  if (item.children?.length) {
                    return { ...item, children: updateInTree(item.children) };
                  }
                  return item;
                });
              };
              return updateInTree(prev);
            });
          } else if (payload.eventType === "DELETE" && payload.old) {
            setRequirements((prev) => {
              // Remove requirement from tree (CASCADE handles children)
              const removeFromTree = (items: Requirement[]): Requirement[] => {
                return items
                  .filter((item) => item.id !== payload.old.id)
                  .map((item) => ({
                    ...item,
                    children: item.children ? removeFromTree(item.children) : [],
                  }));
              };
              return removeFromTree(prev);
            });
          }
        }
      )
      .on(
        "broadcast",
        { event: "requirements_refresh" },
        (payload) => {
          console.log("Received requirements refresh broadcast:", payload);
          loadRequirements();
        }
      )
      .subscribe((status) => {
        console.log("Requirements channel status:", status);
        if (status === 'SUBSCRIBED') {
          console.log("✅ Requirements realtime connected");
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error("❌ Requirements realtime connection failed:", status);
          loadRequirements(); // Fallback to full reload
        } else if (status === 'CLOSED') {
          console.warn("⚠️ Requirements realtime connection closed");
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [projectId, enabled]);

  const addRequirement = async (
    parentId: string | null,
    type: Requirement["type"],
    title: string
  ) => {
    // Generate temporary ID for optimistic update
    const tempId = `temp-${Date.now()}`;
    
    // Create optimistic requirement
    const optimisticReq: Requirement = {
      id: tempId,
      code: null,
      type,
      title,
      content: null,
      parentId,
      children: [],
    };

    // Optimistic update: Add to local state immediately
    setRequirements((prev) => {
      if (parentId) {
        // Add as child to parent
        const addToParent = (items: Requirement[]): Requirement[] => {
          return items.map((item) => {
            if (item.id === parentId) {
              return { ...item, children: [...(item.children || []), optimisticReq] };
            }
            if (item.children && item.children.length > 0) {
              return { ...item, children: addToParent(item.children) };
            }
            return item;
          });
        };
        return addToParent(prev);
      } else {
        // Add as root item
        return [...prev, optimisticReq];
      }
    });

    try {
      const { data, error } = await supabase.rpc("insert_requirement_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_parent_id: parentId,
        p_type: type,
        p_title: title
      });

      if (error) throw error;
      
      // Replace temporary requirement with real one that has UUID
      if (data) {
        setRequirements((prev) => {
          const replaceTemp = (items: Requirement[]): Requirement[] => {
            return items.map((item) => {
              if (item.id === tempId) {
                // Replace temporary item with real one from database
                return {
                  id: data.id,
                  code: data.code,
                  type: data.type,
                  title: data.title,
                  content: data.content,
                  parentId: data.parent_id,
                  children: [],
                };
              }
              if (item.children && item.children.length > 0) {
                return { ...item, children: replaceTemp(item.children) };
              }
              return item;
            });
          };
          return replaceTemp(prev);
        });
      }

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "requirements_refresh",
          payload: { projectId, action: "insert", id: data?.id },
        });
      }
    } catch (error) {
      console.error("Error adding requirement:", error);
      
      // Rollback optimistic update on error
      setRequirements((prev) => {
        const removeTemp = (items: Requirement[]): Requirement[] => {
          return items
            .filter((item) => item.id !== tempId)
            .map((item) => ({
              ...item,
              children: item.children ? removeTemp(item.children) : [],
            }));
        };
        return removeTemp(prev);
      });
      
      throw error;
    }
  };

  const updateRequirement = async (id: string, updates: Partial<Requirement>) => {
    // Store original data for rollback
    const originalRequirements = requirements;
    
    try {
      // Optimistic update - update UI immediately
      setRequirements((prev) => {
        const updateItem = (items: Requirement[]): Requirement[] => {
          return items.map((item) => {
            if (item.id === id) {
              return { ...item, ...updates };
            }
            if (item.children && item.children.length > 0) {
              return { ...item, children: updateItem(item.children) };
            }
            return item;
          });
        };
        return updateItem(prev);
      });

      // Then persist to database
      const { error } = await supabase.rpc("update_requirement_with_token", {
        p_id: id,
        p_token: shareToken || null,
        p_title: updates.title || "",
        p_content: updates.content || ""
      });

      if (error) throw error;

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "requirements_refresh",
          payload: { projectId, action: "update", id },
        });
      }
    } catch (error) {
      console.error("Error updating requirement:", error);
      // Rollback on error
      setRequirements(originalRequirements);
      throw error;
    }
  };

  const deleteRequirement = async (id: string) => {
    try {
      await supabase.rpc("delete_requirement_with_token", {
        p_id: id,
        p_token: shareToken || null
      });

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "requirements_refresh",
          payload: { projectId, action: "delete", id },
        });
      }
    } catch (error) {
      console.error("Error deleting requirement:", error);
      throw error;
    }
  };

  return {
    requirements,
    isLoading,
    addRequirement,
    updateRequirement,
    deleteRequirement,
    refresh: loadRequirements,
  };
}
