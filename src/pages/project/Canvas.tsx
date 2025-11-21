import { useCallback, useRef, useState, useMemo, useEffect } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { NodeType } from "@/components/canvas/NodePalette";
import { CanvasPalette } from "@/components/canvas/CanvasPalette";
import { CanvasNode } from "@/components/canvas/CanvasNode";
import { NodePropertiesPanel } from "@/components/canvas/NodePropertiesPanel";
import { EdgePropertiesPanel } from "@/components/canvas/EdgePropertiesPanel";
import { useParams } from "react-router-dom";
import { useShareToken } from "@/hooks/useShareToken";
import { useRealtimeCanvas } from "@/hooks/useRealtimeCanvas";
import { useRealtimeLayers } from "@/hooks/useRealtimeLayers";
import ReactFlow, {

  Background,
  Controls,
  MiniMap,
  addEdge,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize, Camera, Lasso as LassoIcon, Image, ChevronRight } from "lucide-react";
import { AIArchitectDialog } from "@/components/canvas/AIArchitectDialog";
import { useToast } from "@/hooks/use-toast";
import { toPng, toSvg } from "html-to-image";
import { Lasso } from "@/components/canvas/Lasso";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const nodeTypes = {
  custom: CanvasNode,
};

const initialNodes: Node[] = [];

const initialEdges: Edge[] = [];

// All node types that can be visible
const ALL_NODE_TYPES: NodeType[] = [
  "PROJECT", "PAGE", "COMPONENT", "API", "DATABASE", 
  "SERVICE", "WEBHOOK", "FIREWALL", "SECURITY", 
  "REQUIREMENT", "STANDARD", "TECH_STACK"
];

function CanvasFlow() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token } = useShareToken(projectId);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [userCollapsedPanel, setUserCollapsedPanel] = useState(false);
  const [copiedNode, setCopiedNode] = useState<Node | null>(null);
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<NodeType>>(
    new Set(ALL_NODE_TYPES)
  );
  const [isLassoActive, setIsLassoActive] = useState(false);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const { toast } = useToast();

  // Layers management
  const { layers, saveLayer, deleteLayer } = useRealtimeLayers(projectId!, token);

  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    saveNode,
    saveEdge,
  } = useRealtimeCanvas(projectId!, initialNodes, initialEdges);

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
    
    return layerFiltered;
  }, [nodes, visibleNodeTypes, layers]);

  const visibleEdges = useMemo(() => {
    if (!edges || !Array.isArray(edges)) return [];
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    return edges.filter(
      (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );
  }, [edges, visibleNodes]);

  const handleToggleVisibility = useCallback((type: NodeType) => {
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
      // Create edge with proper UUID
      const newEdge: Edge = {
        id: crypto.randomUUID(),
        source: params.source!,
        target: params.target!,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
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

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      saveNode(node, true, true); // Immediate save on drag stop, is drag operation
    },
    [saveNode]
  );

  const onNodeDrag = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Throttled save during drag (every 200ms), is drag operation
      saveNode(node, false, true);
    },
    [saveNode]
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

      const type = event.dataTransfer.getData("application/reactflow") as NodeType;

      if (!type || !reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: crypto.randomUUID(),
        type: "custom",
        position,
        data: {
          label: `New ${type}`,
          type,
        },
      };

      setNodes((nds) => nds.concat(newNode));
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

  const handleArchitectureGenerated = useCallback(
    async (generatedNodes: any[], generatedEdges: any[]) => {
      try {
        // Create a map to track generated node UUIDs
        const nodeIdMap = new Map<string, string>();
        
        // Insert all nodes
        const newNodes: Node[] = [];
        for (const genNode of generatedNodes) {
          const nodeId = crypto.randomUUID();
          nodeIdMap.set(genNode.label, nodeId);
          
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
        
        // Create edges based on the mapping
        const newEdges: Edge[] = [];
        for (const genEdge of generatedEdges) {
          const sourceId = nodeIdMap.get(genEdge.source);
          const targetId = nodeIdMap.get(genEdge.target);
          
          if (sourceId && targetId) {
            const edge: Edge = {
              id: crypto.randomUUID(),
              source: sourceId,
              target: targetId,
              label: genEdge.relationship,
            };
            
            newEdges.push(edge);
            await saveEdge(edge);
          }
        }
        
        // Add edges to state
        setEdges((eds) => [...eds, ...newEdges]);
        
        toast({
          title: "Architecture created!",
          description: `Added ${newNodes.length} nodes and ${newEdges.length} connections to canvas.`,
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

  const handleDownloadSnapshot = useCallback(
    async (format: 'png' | 'svg') => {
      const viewport = document.querySelector('.react-flow__viewport') as HTMLElement;
      if (!viewport) {
        toast({
          title: "Error",
          description: "Canvas not found",
          variant: "destructive",
        });
        return;
      }

      try {
        const dataUrl = format === 'png' 
          ? await toPng(viewport, { backgroundColor: '#ffffff' })
          : await toSvg(viewport, { backgroundColor: '#ffffff' });
        
        const link = document.createElement('a');
        link.download = `canvas-snapshot.${format}`;
        link.href = dataUrl;
        link.click();
        
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
    [toast]
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

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <PrimaryNav />
      
      <div className="flex flex-1 overflow-hidden">
        <ProjectSidebar projectId={projectId!} />
        
        <div className="flex flex-1 overflow-hidden">
          <CanvasPalette
            visibleNodeTypes={visibleNodeTypes}
            onToggleVisibility={handleToggleVisibility}
            layers={layers}
            selectedNodes={selectedNodesList}
            onSaveLayer={saveLayer}
            onDeleteLayer={deleteLayer}
            onSelectLayer={handleSelectLayer}
            activeLayerId={activeLayerId}
            onSetActiveLayer={setActiveLayerId}
          />
          
          <div className="flex-1 relative" ref={reactFlowWrapper}>
            <TooltipProvider>
              <div className="absolute top-4 left-4 z-10 flex gap-2">
                <AIArchitectDialog
                  projectId={projectId!}
                  existingNodes={nodes}
                  existingEdges={edges}
                  onArchitectureGenerated={handleArchitectureGenerated}
                />
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
              </div>
            </TooltipProvider>
            <ReactFlow
              nodes={visibleNodes}
              edges={visibleEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
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
           </div>

          {selectedNode ? (
            <NodePropertiesPanel
              node={selectedNode}
              onClose={handleClosePanel}
              onUpdate={handleNodeUpdate}
              onDelete={handleNodeDelete}
              projectId={projectId!}
              isOpen={isPanelOpen}
              onToggle={handleTogglePanel}
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
            <div className="w-12 border-l border-border bg-card flex flex-col items-center py-4 h-full">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsPanelOpen(!isPanelOpen)}
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </Button>
            </div>
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
