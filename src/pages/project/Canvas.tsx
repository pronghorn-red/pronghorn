import { useCallback, useRef, useState, useMemo, useEffect } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { CanvasPalette } from "@/components/canvas/CanvasPalette";
import { CanvasNode } from "@/components/canvas/CanvasNode";
import { NotesNode } from "@/components/canvas/NotesNode";
import { ZoneNode } from "@/components/canvas/ZoneNode";
import { LabelNode } from "@/components/canvas/LabelNode";
// CustomEdge removed - React Flow's built-in edges properly handle styling
import { NodePropertiesPanel } from "@/components/canvas/NodePropertiesPanel";
import { EdgePropertiesPanel } from "@/components/canvas/EdgePropertiesPanel";
import { useParams } from "react-router-dom";
import { useShareToken } from "@/hooks/useShareToken";
import { TokenRecoveryMessage } from "@/components/project/TokenRecoveryMessage";
import { useRealtimeCanvas } from "@/hooks/useRealtimeCanvas";
import { useRealtimeLayers } from "@/hooks/useRealtimeLayers";
import { useNodeTypes } from "@/hooks/useNodeTypes";
import { connectionLogic, getXPosition } from "@/lib/connectionLogic";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  Connection,
  Edge,
  Node,
  NodeChange,
  ReactFlowProvider,
  getNodesBounds,
  getViewportForBounds,
} from "reactflow";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize, Camera, Lasso as LassoIcon, Image, ChevronRight, Wrench, Sparkles, FileSearch, AlignLeft, AlignVerticalJustifyStart, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Grid3x3, ImagePlus, Eye, Trash2, Download, Upload } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AIArchitectDialog } from "@/components/canvas/AIArchitectDialog";
import { InfographicDialog } from "@/components/canvas/InfographicDialog";
import { useToast } from "@/hooks/use-toast";
import { toPng, toSvg } from "html-to-image";
import { Lasso } from "@/components/canvas/Lasso";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";

const nodeTypes = {
  custom: CanvasNode,
  notes: NotesNode,
  zone: ZoneNode,
  label: LabelNode,
};

// No custom edge types - React Flow's built-in edges properly respect style properties
// Edge type (straight, step, etc.) is stored in edge.type and React Flow handles routing

const initialNodes: Node[] = [];

const initialEdges: Edge[] = [];

// Annotation node types that should NOT be affected by Auto Order
const ANNOTATION_TYPES = ['notes', 'zone', 'label', 'NOTES', 'ZONE', 'LABEL'];

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUUID = (id: string): boolean => {
  return UUID_REGEX.test(id);
};

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

// Get all node IDs fully contained in a zone (recursive for nested zones)
const getContainedNodeIds = (
  zoneId: string, 
  allNodes: Node[], 
  positionOverrides?: Map<string, { x: number; y: number }>
): string[] => {
  const zone = allNodes.find(n => n.id === zoneId);
  if (!zone) return [];
  
  const zonePos = positionOverrides?.get(zoneId) || zone.position;
  const zoneWidth = (zone.style?.width as number) || (zone.data?.style?.width as number) || 200;
  const zoneHeight = (zone.style?.height as number) || (zone.data?.style?.height as number) || 150;
  
  const containedIds: string[] = [];
  
  allNodes.forEach(node => {
    if (node.id === zoneId) return; // Skip the zone itself
    
    const nodePos = positionOverrides?.get(node.id) || node.position;
    const nodeWidth = (node.style?.width as number) || (node.data?.style?.width as number) || 150;
    const nodeHeight = (node.style?.height as number) || (node.data?.style?.height as number) || 60;
    
    // Check if fully contained using stored positions
    const isContained = (
      nodePos.x >= zonePos.x &&
      nodePos.y >= zonePos.y &&
      nodePos.x + nodeWidth <= zonePos.x + zoneWidth &&
      nodePos.y + nodeHeight <= zonePos.y + zoneHeight
    );
    
    if (isContained) {
      containedIds.push(node.id);
      
      // If it's a zone, recursively get its contained nodes too
      if (node.type === 'zone') {
        containedIds.push(...getContainedNodeIds(node.id, allNodes, positionOverrides));
      }
    }
  });
  
  return containedIds;
};

// Calculate the nesting depth of a zone (0 = not inside any zone, 1 = inside one zone, etc.)
const calculateZoneDepth = (zoneId: string, allNodes: Node[]): number => {
  const zone = allNodes.find(n => n.id === zoneId);
  if (!zone || zone.type !== 'zone') return 0;
  
  let depth = 0;
  
  // Check all other zones to see if this zone is inside them
  const otherZones = allNodes.filter(n => n.type === 'zone' && n.id !== zoneId);
  
  for (const parentZone of otherZones) {
    if (isNodeFullyInsideZone(zone, parentZone)) {
      // Found a parent zone, recursively calculate its depth + 1
      const parentDepth = calculateZoneDepth(parentZone.id, allNodes);
      depth = Math.max(depth, parentDepth + 1);
    }
  }
  
  return depth;
};

// Calculate z-index for a zone based on nesting depth
// Outermost zones = -1000, each nested level adds 1 (so -999, -998, etc.)
// All zones stay below regular nodes (which are at 0 or undefined)
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

function CanvasFlow() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token, isTokenSet, tokenMissing } = useShareToken(projectId);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [userCollapsedPanel, setUserCollapsedPanel] = useState(false);
  const [copiedNode, setCopiedNode] = useState<Node | null>(null);
  const [isLassoActive, setIsLassoActive] = useState(false);
  const [isIsolateActive, setIsIsolateActive] = useState(false);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [isAIArchitectOpen, setIsAIArchitectOpen] = useState(false);
  const [isInfographicOpen, setIsInfographicOpen] = useState(false);
  const [isClearCanvasOpen, setIsClearCanvasOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Track node positions at drag start for delta calculation
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  
  // Fetch node types from database (include legacy for rendering existing nodes)
  const { data: allNodeTypes } = useNodeTypes(true);
  
  // Initialize visible node types from database
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<string>>(new Set());
  
  // Update visible node types when data loads
  useEffect(() => {
    if (allNodeTypes && visibleNodeTypes.size === 0) {
      setVisibleNodeTypes(new Set(allNodeTypes.map(nt => nt.system_name)));
    }
  }, [allNodeTypes]);

  // Layers management
  const { layers, saveLayer, deleteLayer } = useRealtimeLayers(projectId!, token);

  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange: baseOnNodesChange,
    onEdgesChange,
    saveNode,
    saveEdge,
    loadCanvasData,
  } = useRealtimeCanvas(projectId!, token, isTokenSet, initialNodes, initialEdges);

  // Wrap onNodesChange to handle resize events
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    baseOnNodesChange(changes);
    
    let needsZIndexRecalc = false;
    
    // Check for dimension changes (from NodeResizer)
    changes.forEach((change) => {
      if (change.type === 'dimensions' && 'dimensions' in change && change.dimensions) {
        // Find the node and save its new dimensions
        const node = nodes.find(n => n.id === change.id);
        if (node) {
          const updatedNode = {
            ...node,
            style: {
              ...node.style,
              width: change.dimensions.width,
              height: change.dimensions.height,
            },
          };
          // Debounce the save slightly to avoid excessive saves during resize
          saveNode(updatedNode, false, true);
          
          // If a zone was resized, we need to recalculate z-indexes
          if (node.type === 'zone') {
            needsZIndexRecalc = true;
          }
        }
      }
    });
    
    // Recalculate zone z-indexes if any zone was resized
    if (needsZIndexRecalc) {
      // Use setTimeout to ensure state has been updated
      setTimeout(() => {
        setNodes(nds => applyZoneZIndexes(nds));
      }, 0);
    }
  }, [baseOnNodesChange, nodes, saveNode, setNodes]);

  // Filter nodes and edges based on visibility
  const visibleNodes = useMemo(() => {
    if (!nodes || !Array.isArray(nodes)) return [];
    
    // Filter by node type visibility
    const typeFiltered = nodes.filter((node) => node?.data?.type && visibleNodeTypes.has(node.data.type));
    
    // Filter by layer visibility
    const layerFiltered = typeFiltered.filter((node) => {
      const nodeInLayers = layers.filter((layer) => layer.node_ids.includes(node.id));
      if (nodeInLayers.length === 0) return true; // Node not in any layer, show it
      return nodeInLayers.some((layer) => layer.visible); // Show if in at least one visible layer
    });
    
    // Apply isolate filter if active
    if (isIsolateActive) {
      const selectedNodeIds = new Set(layerFiltered.filter(n => n.selected).map(n => n.id));
      
      // If no nodes selected, show nothing
      if (selectedNodeIds.size === 0) {
        return [];
      }
      
      // Find all nodes connected to selected nodes
      const connectedNodeIds = new Set<string>();
      edges.forEach(edge => {
        if (selectedNodeIds.has(edge.source)) {
          connectedNodeIds.add(edge.target);
        }
        if (selectedNodeIds.has(edge.target)) {
          connectedNodeIds.add(edge.source);
        }
      });
      
      // Show selected nodes + connected nodes
      return layerFiltered.filter(node => 
        selectedNodeIds.has(node.id) || connectedNodeIds.has(node.id)
      );
    }
    
    return layerFiltered;
  }, [nodes, visibleNodeTypes, layers, isIsolateActive, edges]);

  const visibleEdges = useMemo(() => {
    if (!edges || !Array.isArray(edges)) return [];
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    return edges
      .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
      .map((edge) => ({
        ...edge,
        style: edge.style || {
          stroke: 'hsl(var(--primary))',
          strokeWidth: 2,
        },
        labelStyle: edge.labelStyle || { 
          fill: '#000000',
          fontSize: 12,
          fontWeight: 500,
        },
        labelBgStyle: edge.labelBgStyle || { 
          fill: '#ffffff',
          fillOpacity: 0.9,
        },
        labelBgPadding: edge.labelBgPadding || [8, 4] as [number, number],
        labelBgBorderRadius: edge.labelBgBorderRadius || 4,
      }));
  }, [edges, visibleNodes]);

  const handleToggleVisibility = useCallback((type: string) => {
    setVisibleNodeTypes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      // Create edge with proper UUID and styling for export
      const newEdge: Edge = {
        id: crypto.randomUUID(),
        source: params.source!,
        target: params.target!,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
        style: {
          stroke: 'hsl(var(--primary))',
          strokeWidth: 2,
        },
        labelStyle: { 
          fill: '#000000',
          fontSize: 12,
          fontWeight: 500,
        },
        labelBgStyle: { 
          fill: '#ffffff',
          fillOpacity: 0.9,
        },
        labelBgPadding: [8, 4] as [number, number],
        labelBgBorderRadius: 4,
      };
      
      setEdges((eds) => [...eds, newEdge]);
      saveEdge(newEdge);
    },
    [setEdges, saveEdge]
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      setSelectedNode(node);
      setSelectedEdge(null);
      if (!userCollapsedPanel) {
        setIsPanelOpen(true); // Auto-open panel when selecting node, unless user manually collapsed
      }
    },
    [userCollapsedPanel],
  );

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
    if (!userCollapsedPanel) {
      setIsPanelOpen(true); // Auto-open panel when selecting edge, unless user manually collapsed
    }
  }, [userCollapsedPanel]);

  // Capture starting positions on drag start
  const onNodeDragStart = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Store starting positions for all nodes (needed for delta calculation)
      nodes.forEach(n => {
        dragStartPositionsRef.current.set(n.id, { ...n.position });
      });
    },
    [nodes]
  );

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Save the dragged node
      saveNode(node, true, true);
      
      // If it's a zone, also save all contained nodes that moved with it
      if (node.type === 'zone') {
        const containedNodeIds = getContainedNodeIds(node.id, nodes, dragStartPositionsRef.current);
        containedNodeIds.forEach(id => {
          const containedNode = nodes.find(n => n.id === id);
          if (containedNode) {
            saveNode(containedNode, true, true);
          }
        });
      }
      
      // Recalculate z-index for all zones after any node movement (nesting may have changed)
      // Update the dragged node's position first, then recalculate z-indexes
      setNodes(nds => {
        const updatedNodes = nds.map(n => 
          n.id === node.id ? { ...n, position: node.position } : n
        );
        return applyZoneZIndexes(updatedNodes);
      });
      
      // Clear start positions
      dragStartPositionsRef.current.clear();
    },
    [nodes, saveNode, setNodes]
  );

  const onNodeDrag = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Only handle zone movement specially
      if (node.type === 'zone') {
        const startPos = dragStartPositionsRef.current.get(node.id);
        if (startPos) {
          const deltaX = node.position.x - startPos.x;
          const deltaY = node.position.y - startPos.y;
          
          if (deltaX !== 0 || deltaY !== 0) {
            // Find all nodes contained in this zone (using start positions for containment check)
            const containedNodeIds = getContainedNodeIds(node.id, nodes, dragStartPositionsRef.current);
            
            if (containedNodeIds.length > 0) {
              // Move all contained nodes by the same delta
              setNodes(nds => nds.map(n => {
                if (containedNodeIds.includes(n.id)) {
                  const nStartPos = dragStartPositionsRef.current.get(n.id);
                  if (nStartPos) {
                    return {
                      ...n,
                      position: {
                        x: nStartPos.x + deltaX,
                        y: nStartPos.y + deltaY
                      }
                    };
                  }
                }
                return n;
              }));
            }
          }
        }
      }
      
      // Throttled save during drag (every 200ms), is drag operation
      saveNode(node, false, true);
    },
    [nodes, setNodes, saveNode]
  );

  const handleNodeUpdate = useCallback(
    (nodeId: string, updates: Partial<Node>) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            const updatedNode = { ...node, ...updates };
            saveNode(updatedNode, true, false); // Immediate save, NOT a drag operation
            return updatedNode;
          }
          return node;
        })
      );
    },
    [setNodes, saveNode]
  );

  const handleEdgeUpdate = useCallback(
    (edgeId: string, updates: Partial<Edge>) => {
      setEdges((eds) =>
        eds.map((edge) => {
          if (edge.id === edgeId) {
            const updatedEdge = { ...edge, ...updates };
            saveEdge(updatedEdge);
            return updatedEdge;
          }
          return edge;
        })
      );
    },
    [setEdges, saveEdge]
  );

  // Visual-only update (no database save)
  const handleEdgeVisualUpdate = useCallback(
    (edgeId: string, updates: Partial<Edge>) => {
      setEdges((eds) =>
        eds.map((edge) => {
          if (edge.id === edgeId) {
            return { ...edge, ...updates };
          }
          return edge;
        })
      );
    },
    [setEdges]
  );

  const handleEdgeDelete = useCallback(
    async (edgeId: string) => {
      setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
      
      // Delete from database using RPC with token validation
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.rpc("delete_canvas_edge_with_token", {
        p_id: edgeId,
        p_token: token,
      });
      
      if (error) {
        console.error("Error deleting edge:", error);
        toast({
          title: "Error",
          description: "Failed to delete edge from database",
          variant: "destructive",
        });
      }
    },
    [setEdges, token, toast]
  );

  const handleNodeDelete = useCallback(
    async (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      
      // Delete from database using RPC with token validation
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.rpc("delete_canvas_node_with_token", {
        p_id: nodeId,
        p_token: token,
      });
      
      if (error) {
        console.error("Error deleting node:", error);
        toast({
          title: "Error",
          description: "Failed to delete node from database",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Node deleted",
        });
      }
    },
    [setNodes, token, toast]
  );

  const handleMultiNodeDelete = useCallback(
    async (nodeIds: string[]) => {
      // Delete nodes from UI
      setNodes((nds) => nds.filter((node) => !nodeIds.includes(node.id)));
      
      // Delete edges connected to these nodes
      setEdges((eds) => eds.filter((edge) => 
        !nodeIds.includes(edge.source) && !nodeIds.includes(edge.target)
      ));
      
      // Delete from database
      const { supabase } = await import("@/integrations/supabase/client");
      
      for (const nodeId of nodeIds) {
        await supabase.rpc("delete_canvas_node_with_token", {
          p_id: nodeId,
          p_token: token,
        });
      }
      
      toast({
        title: `${nodeIds.length} nodes deleted`,
      });
    },
    [setNodes, setEdges, token, toast]
  );

  // Handle keyboard shortcuts for copy/paste/delete
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = event.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || 
                       target.tagName === 'TEXTAREA' || 
                       target.isContentEditable;
      
      if (isTyping) return;
      
      // Delete key for edges
      if (event.key === "Delete" && selectedEdge) {
        event.preventDefault();
        handleEdgeDelete(selectedEdge.id);
        setSelectedEdge(null);
        setIsPanelOpen(false); // Collapse panel when deleting
        return;
      }
      
      // Delete key for single or multiple selected nodes
      if (event.key === "Delete") {
        event.preventDefault();
        const selectedNodesList = nodes.filter((n) => n.selected);
        
        if (selectedNodesList.length > 0) {
          handleMultiNodeDelete(selectedNodesList.map((n) => n.id));
          setSelectedNode(null);
          setIsPanelOpen(false); // Collapse panel when deleting
        } else if (selectedNode) {
          handleNodeDelete(selectedNode.id);
          setSelectedNode(null);
          setIsPanelOpen(false); // Collapse panel when deleting
        }
        return;
      }
      
      // Copy node (Ctrl+C or Cmd+C)
      if ((event.ctrlKey || event.metaKey) && event.key === "c" && selectedNode) {
        event.preventDefault();
        setCopiedNode(selectedNode);
        toast({
          title: "Node copied",
          description: "Press Ctrl+V to paste",
        });
      }
      
      // Paste node (Ctrl+V or Cmd+V)
      if ((event.ctrlKey || event.metaKey) && event.key === "v" && copiedNode) {
        event.preventDefault();
        
        const newNode: Node = {
          id: crypto.randomUUID(),
          type: "custom",
          position: {
            x: copiedNode.position.x + 50,
            y: copiedNode.position.y + 50,
          },
          data: {
            ...copiedNode.data,
          },
        };
        
        setNodes((nds) => [...nds, newNode]);
        saveNode(newNode, true, false);
        
        toast({
          title: "Node pasted",
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEdge, selectedNode, copiedNode, nodes, handleEdgeDelete, handleNodeDelete, handleMultiNodeDelete, setNodes, saveNode, toast]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");

      if (!type || !reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Determine React Flow node type and default style based on dropped type
      let nodeType = "custom";
      let defaultStyle: { width?: number; height?: number; zIndex?: number } = {};
      
      if (type === "NOTES") {
        nodeType = "notes";
        defaultStyle = { width: 250, height: 200 };
      } else if (type === "ZONE") {
        nodeType = "zone";
        defaultStyle = { width: 400, height: 300, zIndex: -1 };
      } else if (type === "LABEL") {
        nodeType = "label";
        defaultStyle = { width: 150, height: 40 };
      }

      const newNode: Node = {
        id: crypto.randomUUID(),
        type: nodeType,
        position,
        // Z-index will be calculated after adding to nodes array
        zIndex: undefined,
        style: Object.keys(defaultStyle).length > 0 ? defaultStyle : undefined,
        data: {
          label: `New ${type}`,
          type,
          nodeType, // Store the React Flow node type for persistence
        },
      };

      // Add node and recalculate z-indexes for all zones
      setNodes((nds) => applyZoneZIndexes(nds.concat(newNode)));
      await saveNode(newNode);
      
      // Automatically add to active layer if one is set
      if (activeLayerId) {
        const activeLayer = layers.find((l) => l.id === activeLayerId);
        if (activeLayer) {
          await saveLayer({
            ...activeLayer,
            node_ids: [...activeLayer.node_ids, newNode.id],
          });
        }
      }
    },
    [reactFlowInstance, setNodes, saveNode, activeLayerId, layers, saveLayer]
  );

  const handleNodeClickToAdd = useCallback(
    async (type: string) => {
      if (!reactFlowInstance) return;

      // Get the center of the viewport
      const wrapper = reactFlowWrapper.current;
      if (!wrapper) return;

      const bounds = wrapper.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;

      const position = reactFlowInstance.screenToFlowPosition({
        x: centerX,
        y: centerY,
      });

      // Determine React Flow node type and default style based on type
      let nodeType = "custom";
      let defaultStyle: { width?: number; height?: number; zIndex?: number } = {};
      
      if (type === "NOTES") {
        nodeType = "notes";
        defaultStyle = { width: 250, height: 200 };
      } else if (type === "ZONE") {
        nodeType = "zone";
        defaultStyle = { width: 400, height: 300, zIndex: -1 };
      } else if (type === "LABEL") {
        nodeType = "label";
        defaultStyle = { width: 150, height: 40 };
      }

      const newNode: Node = {
        id: crypto.randomUUID(),
        type: nodeType,
        position,
        // Z-index will be calculated after adding to nodes array
        zIndex: undefined,
        style: Object.keys(defaultStyle).length > 0 ? defaultStyle : undefined,
        data: {
          label: `New ${type}`,
          type,
          nodeType, // Store the React Flow node type for persistence
        },
      };

      // Add node and recalculate z-indexes for all zones
      setNodes((nds) => applyZoneZIndexes(nds.concat(newNode)));
      await saveNode(newNode);
      
      // Automatically add to active layer if one is set
      if (activeLayerId) {
        const activeLayer = layers.find((l) => l.id === activeLayerId);
        if (activeLayer) {
          await saveLayer({
            ...activeLayer,
            node_ids: [...activeLayer.node_ids, newNode.id],
          });
        }
      }

      toast({
        title: "Node added",
        description: `${type} node added to canvas`,
      });
    },
    [reactFlowInstance, reactFlowWrapper, setNodes, saveNode, activeLayerId, layers, saveLayer, toast]
  );

  const handleArchitectureGenerated = useCallback(
    async (generatedNodes: any[], generatedEdges: any[]) => {
      try {
        // Create maps to track node ID mappings
        const nodeIdMap = new Map<string, string>(); // label -> UUID
        const originalIdToUUID = new Map<string, string>(); // original AI id -> UUID
        
        // Insert all nodes
        const newNodes: Node[] = [];
        for (const genNode of generatedNodes) {
          const nodeId = crypto.randomUUID();
          
          // Map by label (primary lookup)
          nodeIdMap.set(genNode.label, nodeId);
          
          // Also map by original AI id if it provided one (for edge source/target lookup)
          if (genNode.id) {
            originalIdToUUID.set(genNode.id, nodeId);
          }
          
          const newNode: Node = {
            id: nodeId,
            type: "custom",
            position: { x: genNode.x || 0, y: genNode.y || 0 },
            data: {
              label: genNode.label,
              type: genNode.type,
              subtitle: genNode.subtitle,
              description: genNode.description,
            },
          };
          
          newNodes.push(newNode);
          await saveNode(newNode, true, false);
        }
        
        // Add nodes to state
        setNodes((nds) => [...nds, ...newNodes]);
        
        // Create edges with robust source/target lookup
        const newEdges: Edge[] = [];
        let skippedEdges = 0;
        for (const genEdge of generatedEdges) {
          // Try multiple lookup strategies for source
          let sourceId = nodeIdMap.get(genEdge.source) // By label
            || originalIdToUUID.get(genEdge.source) // By original AI id
            || (isValidUUID(genEdge.source) && newNodes.find(n => n.id === genEdge.source)?.id); // Direct UUID if valid
          
          // Try multiple lookup strategies for target
          let targetId = nodeIdMap.get(genEdge.target)
            || originalIdToUUID.get(genEdge.target)
            || (isValidUUID(genEdge.target) && newNodes.find(n => n.id === genEdge.target)?.id);
          
          if (sourceId && targetId) {
            // Normalize edge type - React Flow uses 'default' for bezier, not 'bezier'
            let edgeType = genEdge.type || undefined;
            if (edgeType === 'bezier') {
              edgeType = 'default';
            }
            
            const edge: Edge = {
              id: crypto.randomUUID(),
              source: sourceId,
              target: targetId,
              type: edgeType, // Use normalized type
              label: genEdge.relationship,
              style: {
                stroke: 'hsl(var(--primary))',
                strokeWidth: 2,
              },
              labelStyle: { 
                fill: '#000000',
                fontSize: 12,
                fontWeight: 500,
              },
              labelBgStyle: { 
                fill: '#ffffff',
                fillOpacity: 0.9,
              },
              labelBgPadding: [8, 4] as [number, number],
              labelBgBorderRadius: 4,
            };
            
            newEdges.push(edge);
            await saveEdge(edge);
          } else {
            console.warn(`[Canvas] Could not resolve edge: ${genEdge.source} -> ${genEdge.target}`);
            skippedEdges++;
          }
        }
        
        // Add edges to state
        setEdges((eds) => [...eds, ...newEdges]);
        
        const skippedMsg = skippedEdges > 0 ? ` (${skippedEdges} edges skipped due to unresolvable IDs)` : '';
        toast({
          title: "Architecture created!",
          description: `Added ${newNodes.length} nodes and ${newEdges.length} connections to canvas.${skippedMsg}`,
        });
      } catch (error) {
        console.error('Error creating architecture:', error);
        toast({
          title: "Error",
          description: "Failed to create some nodes or edges. Check console for details.",
          variant: "destructive",
        });
      }
    },
    [setNodes, setEdges, saveNode, saveEdge, toast]
  );

  const refreshCanvas = useCallback(() => {
    // Clear local state and reload from database to ensure a consistent view
    setSelectedNode(null);
    setSelectedEdge(null);
    setNodes([]);
    setEdges([]);
    loadCanvasData();
  }, [setNodes, setEdges, loadCanvasData]);

  // Create multiple Notes nodes from selected artifacts
  const handleCreateMultipleNotesFromArtifacts = useCallback(
    async (artifacts: any[], sourceNode?: Node) => {
      if (!reactFlowInstance) return;
      
      // Use source node position or fall back to selected node or default
      const startPosition = sourceNode?.position || selectedNode?.position || { x: 100, y: 100 };
      const nodeWidth = (sourceNode?.style?.width as number) || 250;
      const nodeHeight = (sourceNode?.style?.height as number) || 200;
      
      // Create a Notes node for each artifact with cascading layout
      for (let i = 0; i < artifacts.length; i++) {
        const artifact = artifacts[i];
        
        // Build content with image embedded as markdown (like paste behavior)
        let nodeContent = artifact.content || '';
        if (artifact.image_url) {
          const imageMarkdown = `![${artifact.ai_title || 'Artifact Image'}](${artifact.image_url})`;
          nodeContent = nodeContent 
            ? `${nodeContent}\n\n${imageMarkdown}` 
            : imageMarkdown;
        }
        
        const newNode: Node = {
          id: crypto.randomUUID(),
          type: "notes",
          // Cascade: +50px for each subsequent node
          position: {
            x: startPosition.x + (i + 1) * 50,
            y: startPosition.y + (i + 1) * 50,
          },
          style: { width: nodeWidth, height: nodeHeight },
          data: {
            type: "NOTES",
            nodeType: "notes",
            label: artifact.ai_title || "Artifact",
            content: nodeContent,  // Image embedded as markdown
            artifactId: artifact.id,
          },
        };
        
        setNodes((nds) => [...nds, newNode]);
        await saveNode(newNode, true, false);
      }
      
      toast({
        title: `Created ${artifacts.length} Notes nodes`,
        description: "Notes cascaded from selected node",
      });
    },
    [reactFlowInstance, selectedNode, setNodes, saveNode, toast]
  );

  const handleDownloadSnapshot = useCallback(
    async (format: 'png' | 'svg') => {
      const viewport = document.querySelector('.react-flow__viewport') as HTMLElement;
      if (!viewport || visibleNodes.length === 0) {
        toast({
          title: "Error",
          description: "Canvas not found or no nodes to export",
          variant: "destructive",
        });
        return;
      }

      try {
        if (format === 'png') {
          // PNG export - use viewport as-is
          const dataUrl = await toPng(viewport, { backgroundColor: '#ffffff' });
          const link = document.createElement('a');
          link.download = 'canvas-snapshot.png';
          link.href = dataUrl;
          link.click();
        } else {
          // SVG export - crop to visible nodes with proper viewBox
          const nodesBounds = getNodesBounds(visibleNodes);
          const padding = 50;
          
          const bounds = {
            x: nodesBounds.x - padding,
            y: nodesBounds.y - padding,
            width: nodesBounds.width + padding * 2,
            height: nodesBounds.height + padding * 2,
          };

          // Generate SVG
          const svgDataUrl = await toSvg(viewport, { 
            backgroundColor: '#ffffff',
          });
          
          // Extract SVG content from data URL (it's URL-encoded, not base64)
          const svgContent = decodeURIComponent(svgDataUrl.split(',')[1]);
          const parser = new DOMParser();
          const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
          const svgElement = svgDoc.documentElement;
          
          // Set viewBox to crop to bounds
          svgElement.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
          svgElement.setAttribute('width', bounds.width.toString());
          svgElement.setAttribute('height', bounds.height.toString());
          
          // Convert back to data URL
          const serializer = new XMLSerializer();
          const modifiedSvg = serializer.serializeToString(svgElement);
          const finalDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(modifiedSvg);
          
          const link = document.createElement('a');
          link.download = 'canvas-snapshot.svg';
          link.href = finalDataUrl;
          link.click();
        }
        
        toast({
          title: "Snapshot downloaded",
          description: `Canvas exported as ${format.toUpperCase()}`,
        });
      } catch (error) {
        console.error('Error downloading snapshot:', error);
        toast({
          title: "Error",
          description: "Failed to export canvas",
          variant: "destructive",
        });
      }
    },
    [visibleNodes, toast]
  );

  const handleSelectLayer = useCallback(
    (nodeIds: string[]) => {
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          selected: nodeIds.includes(node.id),
        }))
      );
    },
    [setNodes]
  );

  const handleClosePanel = () => {
    setIsPanelOpen(false);
    setSelectedNode(null);
    setSelectedEdge(null);
    setUserCollapsedPanel(false);
  };

  const handleTogglePanel = () => {
    const newState = !isPanelOpen;
    setIsPanelOpen(newState);
    if (!newState) {
      // User manually collapsed it
      setUserCollapsedPanel(true);
    } else {
      // User manually expanded it
      setUserCollapsedPanel(false);
    }
  };

  const selectedNodesList = useMemo(() => {
    return visibleNodes.filter((n) => n.selected);
  }, [visibleNodes]);

  // Auto-disable isolate when no nodes are selected
  useEffect(() => {
    if (isIsolateActive && selectedNodesList.length === 0) {
      setIsIsolateActive(false);
      toast({
        title: "Isolate disabled",
        description: "No nodes selected",
      });
    }
  }, [isIsolateActive, selectedNodesList.length, toast]);

  // Alignment functions for multiple selected nodes
  const handleAlignLeft = useCallback(() => {
    if (selectedNodesList.length <= 1) return;
    
    const minX = Math.min(...selectedNodesList.map(n => n.position.x));
    const updates = selectedNodesList.map(node => ({
      ...node,
      position: { ...node.position, x: minX }
    }));
    
    setNodes((nds) =>
      nds.map((node) => {
        const update = updates.find((u) => u.id === node.id);
        return update || node;
      })
    );
    
    updates.forEach(node => {
      saveNode(node, true, false);
    });
    
    toast({
      title: "Nodes aligned",
      description: "Aligned to leftmost position",
    });
  }, [selectedNodesList, setNodes, saveNode, toast]);

  const handleAlignTop = useCallback(() => {
    if (selectedNodesList.length <= 1) return;
    
    const minY = Math.min(...selectedNodesList.map(n => n.position.y));
    const updates = selectedNodesList.map(node => ({
      ...node,
      position: { ...node.position, y: minY }
    }));
    
    setNodes((nds) =>
      nds.map((node) => {
        const update = updates.find((u) => u.id === node.id);
        return update || node;
      })
    );
    
    updates.forEach(node => {
      saveNode(node, true, false);
    });
    
    toast({
      title: "Nodes aligned",
      description: "Aligned to topmost position",
    });
  }, [selectedNodesList, setNodes, saveNode, toast]);

  const handleDistributeHorizontally = useCallback(() => {
    if (selectedNodesList.length <= 2) return;
    
    const sorted = [...selectedNodesList].sort((a, b) => a.position.x - b.position.x);
    const minX = sorted[0].position.x;
    const maxX = sorted[sorted.length - 1].position.x;
    const spacing = (maxX - minX) / (sorted.length - 1);
    
    const updates = sorted.map((node, index) => ({
      ...node,
      position: { ...node.position, x: minX + (spacing * index) }
    }));
    
    setNodes((nds) =>
      nds.map((node) => {
        const update = updates.find((u) => u.id === node.id);
        return update || node;
      })
    );
    
    updates.forEach(node => {
      saveNode(node, true, false);
    });
    
    toast({
      title: "Nodes distributed",
      description: "Distributed evenly horizontally",
    });
  }, [selectedNodesList, setNodes, saveNode, toast]);

  const handleDistributeVertically = useCallback(() => {
    if (selectedNodesList.length <= 2) return;
    
    const sorted = [...selectedNodesList].sort((a, b) => a.position.y - b.position.y);
    const minY = sorted[0].position.y;
    const maxY = sorted[sorted.length - 1].position.y;
    const spacing = (maxY - minY) / (sorted.length - 1);
    
    const updates = sorted.map((node, index) => ({
      ...node,
      position: { ...node.position, y: minY + (spacing * index) }
    }));
    
    setNodes((nds) =>
      nds.map((node) => {
        const update = updates.find((u) => u.id === node.id);
        return update || node;
      })
    );
    
    updates.forEach(node => {
      saveNode(node, true, false);
    });
    
    toast({
      title: "Nodes distributed",
      description: "Distributed evenly vertically",
    });
  }, [selectedNodesList, setNodes, saveNode, toast]);

  const handleAutoOrder = useCallback(() => {
    // Configuration
    const VERTICAL_SPACING = 84;    // Space between nodes vertically
    const START_Y = 50;             // Top margin
    
    // Build typeOrder dynamically from connectionLogic flow hierarchy
    const typeOrder: string[] = connectionLogic.flowHierarchy.levels
      .sort((a, b) => a.level - b.level)
      .flatMap(level => level.types);
    
    // Helper: Check if a node is inside ANY zone
    const isNodeInsideAnyZone = (node: Node): boolean => {
      const zones = nodes.filter(n => n.type === 'zone');
      return zones.some(zone => zone.id !== node.id && isNodeFullyInsideZone(node, zone));
    };
    
    // Determine candidate nodes
    const candidateNodes = selectedNodesList.length > 1 
      ? selectedNodesList 
      : visibleNodes;
    
    // Filter out:
    // 1. Annotation nodes (notes, zone, label)
    // 2. Nodes that are inside any zone
    const nodesToOrder = candidateNodes.filter(node => {
      const nodeType = node.type?.toLowerCase();
      
      // Skip annotation types
      if (ANNOTATION_TYPES.includes(nodeType || '')) {
        return false;
      }
      
      // Skip nodes inside zones
      if (isNodeInsideAnyZone(node)) {
        return false;
      }
      
      return true;
    });
    
    if (nodesToOrder.length === 0) return;
    
    // Step 1: Group nodes by their X position (column)
    const nodesByColumn = new Map<number, Node[]>();
    
    nodesToOrder.forEach(node => {
      const type = node.data?.type as string;
      const xPos = type ? getXPosition(type) : 700; // Default x if no type
      
      if (!nodesByColumn.has(xPos)) {
        nodesByColumn.set(xPos, []);
      }
      nodesByColumn.get(xPos)!.push(node);
    });
    
    // Step 2: Sort nodes within each column by type order (so like types stay together)
    nodesByColumn.forEach((nodesInColumn) => {
      nodesInColumn.sort((a, b) => {
        const typeA = a.data?.type as string || 'OTHER';
        const typeB = b.data?.type as string || 'OTHER';
        const indexA = typeOrder.indexOf(typeA);
        const indexB = typeOrder.indexOf(typeB);
        // Types not in typeOrder go to end
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
      });
    });
    
    // Step 3: Position all nodes in each column, stacking vertically
    const updates: Node[] = [];
    
    nodesByColumn.forEach((nodesInColumn, xPos) => {
      let currentY = START_Y;
      nodesInColumn.forEach(node => {
        updates.push({
          ...node,
          position: { x: xPos, y: currentY }
        });
        currentY += VERTICAL_SPACING;
      });
    });
    
    // Apply updates
    setNodes((nds) =>
      nds.map((node) => {
        const update = updates.find((u) => u.id === node.id);
        return update || node;
      })
    );
    
    // Save all updated nodes
    updates.forEach(node => {
      saveNode(node, true, false);
    });
    
    toast({
      title: "Nodes ordered",
      description: `Auto-ordered ${updates.length} node${updates.length !== 1 ? 's' : ''} by type`,
    });
  }, [selectedNodesList, visibleNodes, setNodes, saveNode, toast]);

  const handleClearCanvas = useCallback(async () => {
    const nodeCount = nodes.length;
    const edgeCount = edges.length;
    const layerCount = layers.length;
    
    if (nodeCount === 0 && edgeCount === 0 && layerCount === 0) {
      toast({
        title: "Canvas is empty",
        description: "Nothing to clear",
      });
      return;
    }
    
    const { supabase } = await import("@/integrations/supabase/client");
    
    // Delete all nodes from database
    for (const node of nodes) {
      await supabase.rpc("delete_canvas_node_with_token", {
        p_id: node.id,
        p_token: token,
      });
    }
    
    // Delete all layers
    for (const layer of layers) {
      await deleteLayer(layer.id);
    }
    
    // Clear local state
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setSelectedEdge(null);
    setIsPanelOpen(false);
    
    toast({
      title: "Canvas cleared",
      description: `Removed ${nodeCount} nodes, ${edgeCount} edges, and ${layerCount} layers`,
    });
    
    setIsClearCanvasOpen(false);
  }, [nodes, edges, layers, token, deleteLayer, setNodes, setEdges, toast]);

  // Export canvas to JSON
  const handleExportCanvas = useCallback(() => {
    const exportData = {
      _meta: {
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        projectId: projectId || "",
        description: "Pronghorn.RED Canvas Export - contains architecture diagram nodes, edges, and layers. This file can be imported back to recreate the canvas."
      },
      
      _documentation: {
        overview: "This JSON file represents a visual architecture canvas. An AI or human can interpret this structure to understand or recreate the diagram.",
        nodeStructure: {
          description: "Each node represents an architectural element on the canvas",
          fields: {
            id: "Unique UUID identifier for the node",
            type: "React Flow node type: 'custom' (standard architecture nodes), 'notes' (sticky notes with markdown), 'zone' (grouping containers), 'label' (text labels)",
            position: "X,Y coordinates on the canvas (origin is top-left)",
            "data.type": "Semantic node type from nodeTypes list (e.g., 'PAGE', 'COMPONENT', 'DATABASE', 'API_SERVICE')",
            "data.label": "Primary display text / node title",
            "data.subtitle": "Optional secondary descriptive text",
            "data.content": "For notes nodes, contains markdown content",
            style: "Optional CSS-like styling object (width, height, backgroundColor)"
          }
        },
        edgeStructure: {
          description: "Edges represent connections/relationships between nodes (arrows)",
          fields: {
            id: "Unique UUID identifier for the edge",
            source: "ID of the source node (where arrow starts)",
            target: "ID of the target node (where arrow ends)",
            label: "Optional connection label (e.g., 'uses', 'calls', 'depends on')",
            type: "Edge routing style: 'default' (curved bezier), 'straight', 'step' (right angles), 'smoothstep'",
            style: "Optional styling (stroke color, strokeWidth)"
          }
        },
        layerStructure: {
          description: "Layers organize nodes into toggleable visibility groups",
          fields: {
            id: "Unique UUID identifier for the layer",
            name: "Display name for the layer",
            node_ids: "Array of node IDs belonging to this layer",
            visible: "Whether the layer is currently visible (true/false)"
          }
        },
        connectionRules: "The connectionRules section defines valid source->target relationships and the left-to-right flow hierarchy for node types"
      },
      
      nodeTypes: (allNodeTypes || []).map(nt => ({
        system_name: nt.system_name,
        display_label: nt.display_label,
        description: nt.description,
        category: nt.category,
        color_class: nt.color_class,
        order_score: nt.order_score
      })),
      
      connectionRules: {
        description: "Valid connections follow a left-to-right flow hierarchy. Lower levels appear on the left, higher levels on the right.",
        flowHierarchy: connectionLogic.flowHierarchy.levels,
        validConnections: connectionLogic.validConnections
      },
      
      nodes: nodes.map(n => ({
        id: n.id,
        type: n.type || 'custom',
        position: n.position,
        data: n.data,
        ...(n.style && Object.keys(n.style).length > 0 ? { style: n.style } : {})
      })),
      
      edges: edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        ...(e.label ? { label: e.label } : {}),
        type: e.type || 'default',
        ...(e.style && Object.keys(e.style).length > 0 ? { style: e.style } : {})
      })),
      
      layers: layers.map(l => ({
        id: l.id,
        name: l.name,
        node_ids: l.node_ids,
        visible: l.visible
      }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `canvas-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({ 
      title: "Canvas Exported", 
      description: `Exported ${nodes.length} nodes, ${edges.length} edges, ${layers.length} layers` 
    });
  }, [nodes, edges, layers, allNodeTypes, projectId, toast]);

  // Handle file selection for import
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        // Validate basic structure
        if (!data.nodes || !Array.isArray(data.nodes)) {
          throw new Error("Invalid canvas export: missing nodes array");
        }
        
        setPendingImport(data);
        setIsImportDialogOpen(true);
      } catch (err) {
        toast({ 
          title: "Import Failed", 
          description: err instanceof Error ? err.message : "Invalid JSON file",
          variant: "destructive"
        });
      }
    };
    reader.readAsText(file);
    
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [toast]);

  // Execute import (add or replace mode)
  const handleImport = useCallback(async (mode: 'add' | 'replace') => {
    if (!pendingImport || !projectId) return;
    
    try {
      // Generate new UUIDs for all imported elements to avoid conflicts
      const idMap = new Map<string, string>();
      
      // Create ID mappings
      pendingImport.nodes.forEach((n: any) => {
        idMap.set(n.id, crypto.randomUUID());
      });
      (pendingImport.edges || []).forEach((e: any) => {
        idMap.set(e.id, crypto.randomUUID());
      });
      (pendingImport.layers || []).forEach((l: any) => {
        idMap.set(l.id, crypto.randomUUID());
      });
      
      // Transform nodes with new IDs
      const importedNodes: Node[] = pendingImport.nodes.map((n: any) => ({
        id: idMap.get(n.id)!,
        type: n.type || 'custom',
        position: n.position,
        data: n.data,
        style: n.style,
        selected: true  // Select all imported nodes for easy repositioning
      }));
      
      // Transform edges with remapped source/target IDs
      const importedEdges: Edge[] = (pendingImport.edges || [])
        .filter((e: any) => idMap.has(e.source) && idMap.has(e.target))
        .map((e: any) => ({
          id: idMap.get(e.id)!,
          source: idMap.get(e.source)!,
          target: idMap.get(e.target)!,
          label: e.label,
          type: e.type || 'default',
          style: e.style || {
            stroke: 'hsl(var(--primary))',
            strokeWidth: 2,
          },
          labelStyle: { 
            fill: '#000000',
            fontSize: 12,
            fontWeight: 500,
          },
          labelBgStyle: { 
            fill: '#ffffff',
            fillOpacity: 0.9,
          },
          labelBgPadding: [8, 4] as [number, number],
          labelBgBorderRadius: 4,
        }));
      
      // Transform layers with remapped node IDs
      const importedLayers = (pendingImport.layers || []).map((l: any) => ({
        id: idMap.get(l.id)!,
        project_id: projectId,
        name: l.name,
        node_ids: l.node_ids.map((nid: string) => idMap.get(nid)).filter(Boolean),
        visible: l.visible
      }));
      
      if (mode === 'replace') {
        // Clear existing canvas first
        await handleClearCanvas();
      } else {
        // Deselect existing nodes before adding
        setNodes(nds => nds.map(n => ({ ...n, selected: false })));
      }
      
      // Add imported nodes (selected for easy repositioning)
      setNodes(nds => mode === 'replace' ? importedNodes : [...nds, ...importedNodes]);
      setEdges(eds => mode === 'replace' ? importedEdges : [...eds, ...importedEdges]);
      
      // Save to database
      for (const node of importedNodes) {
        await saveNode(node, true, false);
      }
      for (const edge of importedEdges) {
        await saveEdge(edge);
      }
      for (const layer of importedLayers) {
        await saveLayer(layer);
      }
      
      setIsImportDialogOpen(false);
      setPendingImport(null);
      
      toast({
        title: "Canvas Imported",
        description: `${mode === 'replace' ? 'Replaced with' : 'Added'} ${importedNodes.length} nodes, ${importedEdges.length} edges, ${importedLayers.length} layers. Imported nodes are selected - drag to reposition.`
      });
    } catch (err) {
      toast({
        title: "Import Failed",
        description: err instanceof Error ? err.message : "Failed to import canvas",
        variant: "destructive"
      });
    }
  }, [pendingImport, projectId, saveNode, saveEdge, saveLayer, setNodes, setEdges, handleClearCanvas, toast]);

  // Show token recovery message if token is missing
  if (tokenMissing) {
    return (
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        <PrimaryNav />
        <TokenRecoveryMessage />
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <PrimaryNav />
      
      <div className="flex flex-1 overflow-hidden">
        <ProjectSidebar projectId={projectId!} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
        
        <div className="flex flex-1 overflow-hidden">
          <CanvasPalette
            visibleNodeTypes={visibleNodeTypes}
            onToggleVisibility={handleToggleVisibility}
            onNodeClick={handleNodeClickToAdd}
            layers={layers}
            selectedNodes={selectedNodesList}
            onSaveLayer={saveLayer}
            onDeleteLayer={deleteLayer}
            onSelectLayer={handleSelectLayer}
            activeLayerId={activeLayerId}
            onSetActiveLayer={setActiveLayerId}
            onMenuClick={() => setIsSidebarOpen(true)}
          />
          
          <div
            className="flex-1 relative"
            ref={reactFlowWrapper}
          >
            <TooltipProvider>
              <AIArchitectDialog
                projectId={projectId!}
                existingNodes={nodes}
                existingEdges={edges}
                onArchitectureGenerated={handleArchitectureGenerated}
                open={isAIArchitectOpen}
                onOpenChange={(open) => {
                  setIsAIArchitectOpen(open);
                  if (!open) {
                    // Fully refresh canvas from database when dialog closes
                    refreshCanvas();
                  }
                }}
                onCanvasRefresh={refreshCanvas}
              />
              
              <InfographicDialog
                projectId={projectId!}
                shareToken={token}
                open={isInfographicOpen}
                onOpenChange={setIsInfographicOpen}
              />
              
              {/* Top-left canvas tools (AI Architect, Lasso, Export, etc.) */}
              {!isAIArchitectOpen && (
                <div className="absolute top-4 left-4 z-10 flex gap-2">
                  {isMobile ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="outline" className="bg-card/80">
                          <Wrench className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-popover z-50">
                        <DropdownMenuItem onClick={() => setIsAIArchitectOpen(true)}>
                          <Sparkles className="h-4 w-4 mr-2" />
                          AI Architect
                        </DropdownMenuItem>
                         <DropdownMenuItem onClick={() => setIsLassoActive(!isLassoActive)}>
                          <LassoIcon className="h-4 w-4 mr-2" />
                          {isLassoActive ? "Disable" : "Enable"} Lasso Select
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setIsIsolateActive(!isIsolateActive)}>
                          <Eye className="h-4 w-4 mr-2" />
                          {isIsolateActive ? "Disable" : "Enable"} Isolate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownloadSnapshot('png')}>
                          <Image className="h-4 w-4 mr-2" />
                          Export PNG
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownloadSnapshot('svg')}>
                          <FileSearch className="h-4 w-4 mr-2" />
                          Export SVG
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setIsInfographicOpen(true)}>
                          <ImagePlus className="h-4 w-4 mr-2" />
                          Generate Infographic
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleAlignLeft} disabled={selectedNodesList.length <= 1}>
                          <AlignLeft className="h-4 w-4 mr-2" />
                          Align Left
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleAlignTop} disabled={selectedNodesList.length <= 1}>
                          <AlignVerticalJustifyStart className="h-4 w-4 mr-2" />
                          Align Top
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={handleDistributeHorizontally}
                          disabled={selectedNodesList.length <= 2}
                        >
                          <AlignHorizontalDistributeCenter className="h-4 w-4 mr-2" />
                          Distribute Horizontally
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={handleDistributeVertically}
                          disabled={selectedNodesList.length <= 2}
                        >
                          <AlignVerticalDistributeCenter className="h-4 w-4 mr-2" />
                          Distribute Vertically
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleAutoOrder}>
                          <Grid3x3 className="h-4 w-4 mr-2" />
                          Auto Order
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => setIsClearCanvasOpen(true)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Clear Canvas
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleExportCanvas}>
                          <Download className="h-4 w-4 mr-2" />
                          Export JSON
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                          <Upload className="h-4 w-4 mr-2" />
                          Import JSON
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => setIsAIArchitectOpen(true)}
                            variant="outline"
                            className="bg-card/80"
                            size="icon"
                          >
                            <Sparkles className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>AI Architect</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => setIsLassoActive(!isLassoActive)}
                            variant={isLassoActive ? "default" : "outline"}
                            className={isLassoActive ? "" : "bg-card/80"}
                            size="icon"
                          >
                            <LassoIcon className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Lasso Select</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => setIsIsolateActive(!isIsolateActive)}
                            variant={isIsolateActive ? "default" : "outline"}
                            className={isIsolateActive ? "" : "bg-card/80"}
                            size="icon"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Isolate Selection</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => handleDownloadSnapshot('png')}
                            size="sm"
                            variant="outline"
                            className="bg-card/80"
                          >
                            <Image className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Export PNG</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => handleDownloadSnapshot('svg')}
                            size="sm"
                            variant="outline"
                            className="bg-card/80"
                          >
                            <Camera className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Export SVG</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => setIsInfographicOpen(true)}
                            size="sm"
                            variant="outline"
                            className="bg-card/80"
                          >
                            <ImagePlus className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Generate Infographic</p>
                        </TooltipContent>
                      </Tooltip>
                      {/* Alignment buttons */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={handleAlignLeft}
                            size="sm"
                            variant="outline"
                            className="bg-card/80"
                            disabled={selectedNodesList.length <= 1}
                          >
                            <AlignLeft className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Align Left</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={handleAlignTop}
                            size="sm"
                            variant="outline"
                            className="bg-card/80"
                            disabled={selectedNodesList.length <= 1}
                          >
                            <AlignVerticalJustifyStart className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Align Top</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={handleDistributeHorizontally}
                            size="sm"
                            variant="outline"
                            className="bg-card/80"
                            disabled={selectedNodesList.length <= 2}
                          >
                            <AlignHorizontalDistributeCenter className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Distribute Horizontally</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={handleDistributeVertically}
                            size="sm"
                            variant="outline"
                            className="bg-card/80"
                            disabled={selectedNodesList.length <= 2}
                          >
                            <AlignVerticalDistributeCenter className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Distribute Vertically</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={handleAutoOrder}
                            size="sm"
                            variant="outline"
                            className="bg-card/80"
                          >
                            <Grid3x3 className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Auto Order</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => setIsClearCanvasOpen(true)}
                            size="sm"
                            variant="outline"
                            className="bg-card/80 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Clear Canvas</p>
                        </TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </div>
              )}
              
              {/* Second row - JSON Import/Export buttons */}
              {!isAIArchitectOpen && !isMobile && (
                <div className="absolute top-16 left-4 z-10 flex gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handleExportCanvas}
                        size="sm"
                        variant="outline"
                        className="bg-card/80 h-8 w-8 p-0"
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>Export JSON</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        size="sm"
                        variant="outline"
                        className="bg-card/80 h-8 w-8 p-0"
                      >
                        <Upload className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>Import JSON</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
              
              {/* Hidden file input for JSON import (shared by mobile and desktop) */}
              <input
                type="file"
                ref={fileInputRef}
                accept=".json"
                className="hidden"
                onChange={handleFileSelect}
              />
            </TooltipProvider>

            {/* Clear Canvas Confirmation Dialog */}
            <AlertDialog open={isClearCanvasOpen} onOpenChange={setIsClearCanvasOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear Canvas?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {nodes.length} nodes, {edges.length} edges, and {layers.length} layers from the canvas. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleClearCanvas}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Clear Canvas
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Import Canvas Dialog */}
            <AlertDialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Import Canvas</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div>
                      {pendingImport && (
                        <>
                          <p className="mb-2">
                            Found <strong>{pendingImport.nodes?.length || 0}</strong> nodes, <strong>{pendingImport.edges?.length || 0}</strong> edges, 
                            and <strong>{pendingImport.layers?.length || 0}</strong> layers.
                          </p>
                          <p className="mb-2">
                            <strong>Add to Canvas:</strong> Merge with existing elements. New elements will be selected 
                            so you can drag them to avoid overlaps.
                          </p>
                          <p>
                            <strong>Replace Canvas:</strong> Clear all existing elements and import fresh.
                          </p>
                        </>
                      )}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex gap-2 sm:justify-end">
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <Button variant="outline" onClick={() => handleImport('add')}>
                    Add to Canvas
                  </Button>
                  <AlertDialogAction onClick={() => handleImport('replace')}>
                    Replace Canvas
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Main project canvas is fully unmounted while AI Architect is open to avoid flicker */}
            {!isAIArchitectOpen && (
              <ReactFlow
                nodes={visibleNodes}
                edges={visibleEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onEdgeClick={onEdgeClick}
                onNodeDragStart={onNodeDragStart}
                onNodeDrag={onNodeDrag}
                onNodeDragStop={onNodeDragStop}
                onInit={setReactFlowInstance}
                onDrop={onDrop}
                onDragOver={onDragOver}
                nodeTypes={nodeTypes}
                deleteKeyCode={null}
                minZoom={0.05}
                maxZoom={4}
                className="bg-background"
                defaultEdgeOptions={{
                  style: { strokeWidth: 2 },
                }}
                selectionOnDrag={!isLassoActive}
                panOnDrag={!isLassoActive}
                multiSelectionKeyCode="Shift"
                onPaneClick={() => {
                  setSelectedNode(null);
                  setSelectedEdge(null);
                  setIsPanelOpen(false); // Collapse panel when clicking empty canvas
                }}
              >
                <Background />
                <Controls />
                <MiniMap
                  nodeColor={(node) => {
                    const colors: Record<string, string> = {
                      COMPONENT: "#3b82f6",
                      API: "#10b981",
                      DATABASE: "#a855f7",
                      SERVICE: "#f97316",
                    };
                    return colors[node.data.type] || "#6b7280";
                  }}
                  className="bg-card border border-border"
                />
                {isLassoActive && <Lasso partial={true} setNodes={setNodes} />}
              </ReactFlow>
            )}
          </div>

          {/* Properties panel is also hidden while AI Architect is open */}
          {!isAIArchitectOpen && (
            selectedNode ? (
              <NodePropertiesPanel
                node={selectedNode}
                onClose={handleClosePanel}
                onUpdate={handleNodeUpdate}
                onDelete={handleNodeDelete}
                projectId={projectId!}
                isOpen={isPanelOpen}
                onToggle={handleTogglePanel}
                onCreateMultipleNotesFromArtifacts={handleCreateMultipleNotesFromArtifacts}
              />
            ) : selectedEdge ? (
              <EdgePropertiesPanel
                edge={selectedEdge}
                onClose={handleClosePanel}
                onUpdate={handleEdgeUpdate}
                onVisualUpdate={handleEdgeVisualUpdate}
                onDelete={handleEdgeDelete}
                isOpen={isPanelOpen}
                onToggle={handleTogglePanel}
              />
            ) : (
              <div className="w-12 border-l border-border bg-card flex flex-col items-center py-4 h-full z-50">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsPanelOpen(!isPanelOpen)}
                  className="h-8 w-8"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                </Button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasFlow />
    </ReactFlowProvider>
  );
}
