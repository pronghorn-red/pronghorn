import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Node, Edge, useNodesState, useEdgesState } from "reactflow";

export function useRealtimeCanvas(
  projectId: string,
  shareToken: string | null,
  isTokenSet: boolean,
  initialNodes: Node[],
  initialEdges: Edge[]
) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const draggedNodeRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const syncChannelRef = useRef<any>(null);

  // Wrap loadCanvasData in useCallback with shareToken in dependencies
  const loadCanvasData = useCallback(async () => {
    try {
      const [nodesResult, edgesResult] = await Promise.all([
        supabase.rpc("get_canvas_nodes_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
        }),
        supabase.rpc("get_canvas_edges_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
        }),
      ]);

      if (nodesResult.error) throw nodesResult.error;
      if (edgesResult.error) throw edgesResult.error;

      const loadedNodes: Node[] = (nodesResult.data || []).map((node: any) => ({
        id: node.id,
        type: (node.data as any)?.nodeType || "custom", // Use stored nodeType for React Flow
        position: node.position as { x: number; y: number },
        style: (node.data as any)?.style || undefined, // Load saved dimensions
        data: {
          ...(node.data || {}),
          type: (node.data as any)?.type || node.type,
        },
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
  }, [projectId, shareToken, setNodes, setEdges]);
  
  useEffect(() => {
    // Wait for token to be ready before making RPC calls
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
                    data: {
                      ...(payload.new.data || {}),
                      type: (payload.new.data as any)?.type || payload.new.type,
                    },
                  }
                : node
            ));
          } else if (payload.eventType === 'INSERT' && payload.new) {
            // Add new node (skip if already exists from optimistic update)
            setNodes((nds) => {
              if (nds.some(node => node.id === payload.new.id)) {
                console.log("Node already exists, skipping duplicate INSERT:", payload.new.id);
                return nds;
              }
              const newNode: Node = {
                id: payload.new.id,
                type: (payload.new.data as any)?.nodeType || "custom", // Use stored nodeType
                position: payload.new.position as { x: number; y: number },
                style: (payload.new.data as any)?.style || undefined, // Load dimensions
                data: {
                  ...(payload.new.data || {}),
                  type: (payload.new.data as any)?.type || payload.new.type,
                },
              };
              return [...nds, newNode];
            });
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
            // Add new edge (skip if already exists from optimistic update)
            setEdges((eds) => {
              if (eds.some(edge => edge.id === payload.new.id)) {
                console.log("Edge already exists, skipping duplicate INSERT:", payload.new.id);
                return eds;
              }
              const newEdge: Edge = {
                id: payload.new.id,
                source: payload.new.source_id,
                target: payload.new.target_id,
                label: payload.new.label,
                type: payload.new.edge_type || 'default',
                style: payload.new.style || {},
              };
              return [...eds, newEdge];
            });
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
                    type: payload.new.edge_type || edge.type || 'default',
                    style: payload.new.style || edge.style || {},
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
  }, [projectId, isTokenSet, shareToken, loadCanvasData, setNodes, setEdges]);

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
          p_token: shareToken,
          p_type: node.data.type,
          p_position: node.position as any,
          p_data: {
            ...node.data,
            style: node.style, // Save dimensions
            nodeType: node.type, // Save React Flow node type
          } as any
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
  }, [projectId, shareToken]);

  const saveEdge = async (edge: Edge) => {
    try {
      console.log("Saving edge:", edge);

      const { data, error } = await supabase.rpc("upsert_canvas_edge_with_token", {
        p_id: edge.id,
        p_project_id: projectId,
        p_token: shareToken,
        p_source_id: edge.source,
        p_target_id: edge.target,
        p_label: (edge.label as string) || null,
        p_edge_type: edge.type || 'default',
        p_style: JSON.parse(JSON.stringify(edge.style || {}))
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
    loadCanvasData,
  };
}
