import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Node, Edge, useNodesState, useEdgesState } from "reactflow";

// Helper: Check if a node is fully contained inside a zone
const isNodeFullyInsideZone = (node: Node, zone: Node): boolean => {
  const nodeWidth = (node.style?.width as number) || (node.data?.style?.width as number) || 150;
  const nodeHeight = (node.style?.height as number) || (node.data?.style?.height as number) || 60;
  const zoneWidth = (zone.style?.width as number) || (zone.data?.style?.width as number) || 200;
  const zoneHeight = (zone.style?.height as number) || (zone.data?.style?.height as number) || 150;
  
  return (
    node.position.x >= zone.position.x &&
    node.position.y >= zone.position.y &&
    node.position.x + nodeWidth <= zone.position.x + zoneWidth &&
    node.position.y + nodeHeight <= zone.position.y + zoneHeight
  );
};

// Calculate the nesting depth of a zone (0 = not inside any zone, 1 = inside one zone, etc.)
const calculateZoneDepth = (zoneId: string, allNodes: Node[]): number => {
  const zone = allNodes.find(n => n.id === zoneId);
  if (!zone || zone.type !== 'zone') return 0;
  
  let depth = 0;
  const otherZones = allNodes.filter(n => n.type === 'zone' && n.id !== zoneId);
  
  for (const parentZone of otherZones) {
    if (isNodeFullyInsideZone(zone, parentZone)) {
      const parentDepth = calculateZoneDepth(parentZone.id, allNodes);
      depth = Math.max(depth, parentDepth + 1);
    }
  }
  
  return depth;
};

// Calculate z-index for a zone based on nesting depth
const calculateZoneZIndex = (zoneId: string, allNodes: Node[]): number => {
  const depth = calculateZoneDepth(zoneId, allNodes);
  return -1000 + depth;
};

// Apply dynamic z-index to all zones based on their nesting
const applyZoneZIndexes = (allNodes: Node[]): Node[] => {
  return allNodes.map(node => {
    if (node.type === 'zone') {
      return {
        ...node,
        zIndex: calculateZoneZIndex(node.id, allNodes)
      };
    }
    return node;
  });
};

export function useRealtimeCanvas(
  projectId: string,
  shareToken: string | null,
  isTokenSet: boolean,
  initialNodes: Node[],
  initialEdges: Edge[],
  canvasId?: string | null
) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const draggedNodeRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const syncChannelRef = useRef<any>(null);

  // Wrap loadCanvasData in useCallback with shareToken and canvasId in dependencies
  const loadCanvasData = useCallback(async () => {
    try {
      const [nodesResult, edgesResult] = await Promise.all([
        supabase.rpc("get_canvas_nodes_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
          p_canvas_id: canvasId || null,
        }),
        supabase.rpc("get_canvas_edges_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
          p_canvas_id: canvasId || null,
        }),
      ]);

      if (nodesResult.error) throw nodesResult.error;
      if (edgesResult.error) throw edgesResult.error;

      const loadedNodes: Node[] = (nodesResult.data || []).map((node: any) => {
        const nodeType = (node.data as any)?.nodeType || "custom";
        const dataType = (node.data as any)?.type || node.type;
        const loadedStyle = (node.data as any)?.style || {};
        
        // Strip zIndex from style - z-index is calculated dynamically for zones
        const { zIndex: _stripZIndex, ...styleWithoutZIndex } = loadedStyle;
        
        return {
          id: node.id,
          type: nodeType, // Use stored nodeType for React Flow
          position: node.position as { x: number; y: number },
          style: Object.keys(styleWithoutZIndex).length > 0 ? styleWithoutZIndex : undefined,
          // Z-index will be calculated after all nodes are loaded
          zIndex: undefined,
          data: {
            ...(node.data || {}),
            type: dataType,
          },
        };
      });

      // Calculate dynamic z-index for zones based on nesting depth
      const nodesWithZIndex = applyZoneZIndexes(loadedNodes);

      const loadedEdges: Edge[] = (edgesResult.data || []).map((edge: any) => ({
        id: edge.id,
        source: edge.source_id,
        target: edge.target_id,
        label: edge.label,
        type: edge.edge_type || 'default',
        style: edge.style || {},
      }));

      setNodes(nodesWithZIndex);
      setEdges(loadedEdges);
    } catch (error) {
      console.error("Error loading canvas data:", error);
    }
  }, [projectId, shareToken, canvasId, setNodes, setEdges]);
  
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
            
            // Update only the specific node that changed, then recalculate zone z-indexes
            setNodes((nds) => {
              const updatedNodes = nds.map((node) => {
                if (node.id !== payload.new.id) return node;
                
                const loadedStyle = (payload.new.data as any)?.style || {};
                // Strip zIndex from style - only use node.zIndex for z-ordering
                const { zIndex: _stripZIndex, ...styleWithoutZIndex } = loadedStyle;
                
                return {
                  ...node,
                  position: payload.new.position as { x: number; y: number },
                  style: Object.keys(styleWithoutZIndex).length > 0 ? styleWithoutZIndex : node.style,
                  data: {
                    ...(payload.new.data || {}),
                    type: (payload.new.data as any)?.type || payload.new.type,
                  },
                };
              });
              // Recalculate z-indexes as nesting may have changed
              return applyZoneZIndexes(updatedNodes);
            });
          } else if (payload.eventType === 'INSERT' && payload.new) {
            // Add new node (skip if already exists from optimistic update)
            setNodes((nds) => {
              if (nds.some(node => node.id === payload.new.id)) {
                console.log("Node already exists, skipping duplicate INSERT:", payload.new.id);
                return nds;
              }
              const loadedStyle = (payload.new.data as any)?.style || {};
              // Strip zIndex from style - only use node.zIndex for z-ordering
              const { zIndex: _stripZIndex, ...styleWithoutZIndex } = loadedStyle;
              
              const newNode: Node = {
                id: payload.new.id,
                type: (payload.new.data as any)?.nodeType || "custom", // Use stored nodeType
                position: payload.new.position as { x: number; y: number },
                style: Object.keys(styleWithoutZIndex).length > 0 ? styleWithoutZIndex : undefined,
                data: {
                  ...(payload.new.data || {}),
                  type: (payload.new.data as any)?.type || payload.new.type,
                },
              };
              // Apply z-indexes to all zones after adding new node
              return applyZoneZIndexes([...nds, newNode]);
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
            // Strip zIndex from style before saving - z-index is calculated dynamically
            style: (() => {
              const { zIndex: _stripZIndex, ...styleWithoutZIndex } = (node.style || {}) as Record<string, any>;
              return styleWithoutZIndex;
            })(),
            nodeType: node.type, // Save React Flow node type
          } as any,
          p_canvas_id: canvasId || null,
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
  }, [projectId, shareToken, canvasId]);

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
        p_style: JSON.parse(JSON.stringify(edge.style || {})),
        p_canvas_id: canvasId || null,
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
