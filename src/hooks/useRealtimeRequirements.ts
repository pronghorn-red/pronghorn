import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Requirement } from "@/components/requirements/RequirementsTree";

export function useRealtimeRequirements(projectId: string) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
          console.log("Requirements change detected:", payload);
          loadRequirements();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const loadRequirements = async () => {
    try {
      const { data, error } = await supabase
        .from("requirements")
        .select("*")
        .eq("project_id", projectId)
        .order("order_index", { ascending: true });

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

  const addRequirement = async (
    parentId: string | null,
    type: Requirement["type"],
    title: string
  ) => {
    try {
      const { error } = await supabase.from("requirements").insert({
        project_id: projectId,
        parent_id: parentId,
        type,
        title,
        order_index: 0,
      });

      if (error) throw error;
    } catch (error) {
      console.error("Error adding requirement:", error);
      throw error;
    }
  };

  const updateRequirement = async (id: string, updates: Partial<Requirement>) => {
    try {
      const { error } = await supabase
        .from("requirements")
        .update({
          title: updates.title,
          content: updates.content,
        })
        .eq("id", id);

      if (error) throw error;
    } catch (error) {
      console.error("Error updating requirement:", error);
      throw error;
    }
  };

  const deleteRequirement = async (id: string) => {
    try {
      const { error } = await supabase.from("requirements").delete().eq("id", id);

      if (error) throw error;
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
