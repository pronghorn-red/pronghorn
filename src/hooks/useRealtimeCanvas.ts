import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Node, Edge, useNodesState, useEdgesState } from "reactflow";
import { useSearchParams } from "react-router-dom";
import { useShareToken } from "@/hooks/useShareToken";

export function useRealtimeCanvas(projectId: string, initialNodes: Node[], initialEdges: Edge[]) {
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");
  const { isTokenSet } = useShareToken(projectId);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const draggedNodeRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const syncChannelRef = useRef<any>(null);
  
  useEffect(() => {
    if (!projectId || !isTokenSet) {
      return;
    }

    // Initial load
    loadCanvasData();

    // Refresh canvas when tab becomes visible again
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log("Tab visible again, refreshing canvas data");
        loadCanvasData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Set up real-time subscriptions with connection monitoring
    const nodesChannel = supabase
      .channel(`canvas-nodes-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "canvas_nodes",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log("Canvas nodes change:", payload);
          
          // Handle different event types
          if (payload.eventType === 'UPDATE' && payload.new) {
            // Don't update if we're currently dragging this node
            if (draggedNodeRef.current === payload.new.id) {
              return;
            }
            
            // Update only the specific node that changed
            setNodes((nds) => nds.map((node) => 
              node.id === payload.new.id 
                ? {
                    ...node,
                    position: payload.new.position as { x: number; y: number },
                    data: payload.new.data,
                  }
                : node
            ));
          } else if (payload.eventType === 'INSERT' && payload.new) {
            // Add new node
            const newNode: Node = {
              id: payload.new.id,
              type: "custom",
              position: payload.new.position as { x: number; y: number },
              data: payload.new.data,
            };
            setNodes((nds) => [...nds, newNode]);
          } else if (payload.eventType === 'DELETE' && payload.old) {
            // Remove deleted node
            setNodes((nds) => nds.filter((node) => node.id !== payload.old.id));
          }
        }
      )
      .on(
        "broadcast",
        { event: "canvas_refresh" },
        (payload) => {
          console.log("Received canvas refresh broadcast:", payload);
          loadCanvasData();
        }
      )
      .subscribe((status) => {
        console.log("Nodes channel status:", status);
        if (status === 'SUBSCRIBED') {
          console.log("✅ Nodes realtime connected");
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error("❌ Nodes realtime connection failed:", status);
          // Refresh data immediately when connection fails
          loadCanvasData();
        } else if (status === 'CLOSED') {
          console.warn("⚠️ Nodes realtime connection closed");
        }
      });

    syncChannelRef.current = nodesChannel;

    const edgesChannel = supabase
      .channel(`canvas-edges-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "canvas_edges",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log("Canvas edges change:", payload);
          
          if (payload.eventType === 'INSERT' && payload.new) {
            const newEdge: Edge = {
              id: payload.new.id,
              source: payload.new.source_id,
              target: payload.new.target_id,
              label: payload.new.label,
            };
            setEdges((eds) => [...eds, newEdge]);
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setEdges((eds) => eds.filter((edge) => edge.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            setEdges((eds) => eds.map((edge) =>
              edge.id === payload.new.id
                ? {
                    ...edge,
                    source: payload.new.source_id,
                    target: payload.new.target_id,
                    label: payload.new.label,
                  }
                : edge
            ));
          }
        }
      )
      .subscribe((status) => {
        console.log("Edges channel status:", status);
        if (status === 'SUBSCRIBED') {
          console.log("✅ Edges realtime connected");
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error("❌ Edges realtime connection failed:", status);
          // Refresh data immediately when connection fails
          loadCanvasData();
        } else if (status === 'CLOSED') {
          console.warn("⚠️ Edges realtime connection closed");
        }
      });

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(nodesChannel);
      supabase.removeChannel(edgesChannel);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      syncChannelRef.current = null;
    };
  }, [projectId, isTokenSet]);

  const loadCanvasData = async () => {
    try {
      const [nodesResult, edgesResult] = await Promise.all([
        supabase.rpc("get_canvas_nodes_with_token", {
          p_project_id: projectId,
          p_token: shareToken || null,
        }),
        supabase.rpc("get_canvas_edges_with_token", {
          p_project_id: projectId,
          p_token: shareToken || null,
        }),
      ]);

      if (nodesResult.error) throw nodesResult.error;
      if (edgesResult.error) throw edgesResult.error;

      const loadedNodes: Node[] = (nodesResult.data || []).map((node) => ({
        id: node.id,
        type: "custom",
        position: node.position as { x: number; y: number },
        data: node.data,
      }));

      const loadedEdges: Edge[] = (edgesResult.data || []).map((edge: any) => ({
        id: edge.id,
        source: edge.source_id,
        target: edge.target_id,
        label: edge.label,
        type: edge.edge_type || 'default',
        style: edge.style || {},
      }));

      setNodes(loadedNodes);
      setEdges(loadedEdges);
    } catch (error) {
      console.error("Error loading canvas data:", error);
    }
  };

  const saveNode = useCallback(async (node: Node, immediate = false, isDragOperation = false) => {
    try {
      // Only set draggedNodeRef for actual drag operations
      if (isDragOperation) {
        draggedNodeRef.current = node.id;
      }
      
      // Clear any pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      const performSave = async () => {
        // CRITICAL: No direct table queries - RPC function validates access through RLS
        const { error } = await supabase.rpc("upsert_canvas_node_with_token", {
          p_id: node.id,
          p_project_id: projectId,
          p_token: shareToken || null,
          p_type: node.data.type,
          p_position: node.position as any,
          p_data: node.data as any
        });
        if (error) throw error;
        
        // Clear dragged node reference after save (only if it was set)
        if (isDragOperation) {
          setTimeout(() => {
            draggedNodeRef.current = null;
          }, 100);
        }

        if (syncChannelRef.current) {
          syncChannelRef.current.send({
            type: "broadcast",
            event: "canvas_refresh",
            payload: { type: "node", id: node.id },
          });
        }
      };

      if (immediate) {
        await performSave();
      } else {
        // Throttle saves during drag - save every 200ms
        saveTimeoutRef.current = setTimeout(performSave, 200);
      }
    } catch (error) {
      console.error("Error saving node:", error);
      draggedNodeRef.current = null;
    }
  }, [projectId]);

  const saveEdge = async (edge: Edge) => {
    try {
      console.log("Saving edge:", edge);
      
      const edgeData = {
        id: edge.id,
        project_id: projectId,
        source_id: edge.source,
        target_id: edge.target,
        label: (edge.label as string) || null,
        edge_type: edge.type || 'default',
        style: edge.style || {},
      };

      const { data, error } = await supabase.rpc("upsert_canvas_edge_with_token", {
        p_id: edge.id,
        p_project_id: projectId,
        p_token: shareToken || null,
        p_source_id: edge.source,
        p_target_id: edge.target,
        p_label: (edge.label as string) || null,
        p_edge_type: edge.type || 'default',
        p_style: edge.style || {}
      });

      if (error) {
        console.error("Error saving edge:", error);
      } else {
        console.log("Edge saved successfully:", data);
        if (syncChannelRef.current) {
          syncChannelRef.current.send({
            type: "broadcast",
            event: "canvas_refresh",
            payload: { type: "edge", id: edge.id },
          });
        }
      }
    } catch (error) {
      console.error("Error saving edge:", error);
    }
  };

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    saveNode,
    saveEdge,
  };
}
