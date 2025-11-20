import { useCallback, useRef, useState, useMemo, useEffect } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { NodePalette, NodeType } from "@/components/canvas/NodePalette";
import { CanvasNode } from "@/components/canvas/CanvasNode";
import { NodePropertiesPanel } from "@/components/canvas/NodePropertiesPanel";
import { EdgePropertiesPanel } from "@/components/canvas/EdgePropertiesPanel";
import { useParams } from "react-router-dom";
import { useRealtimeCanvas } from "@/hooks/useRealtimeCanvas";
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
import { ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { AIArchitectDialog } from "@/components/canvas/AIArchitectDialog";
import { useToast } from "@/hooks/use-toast";

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
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [showProperties, setShowProperties] = useState(false);
  const [copiedNode, setCopiedNode] = useState<Node | null>(null);
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<NodeType>>(
    new Set(ALL_NODE_TYPES)
  );
  const { toast } = useToast();

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
    return nodes.filter((node) => node?.data?.type && visibleNodeTypes.has(node.data.type));
  }, [nodes, visibleNodeTypes]);

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

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
    setShowProperties(true);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
    setShowProperties(true);
  }, []);

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
    (edgeId: string) => {
      setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
      // Delete from database via RPC or direct delete
      const edgeToDelete = edges.find((e) => e.id === edgeId);
      if (edgeToDelete) {
        // This will be handled by the real-time subscription
        import("@/integrations/supabase/client").then(({ supabase }) => {
          supabase.from("canvas_edges").delete().eq("id", edgeId).then();
        });
      }
    },
    [setEdges, edges]
  );

  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      // Delete from database
      import("@/integrations/supabase/client").then(({ supabase }) => {
        supabase.from("canvas_nodes").delete().eq("id", nodeId).then();
      });
      toast({
        title: "Node deleted",
      });
    },
    [setNodes, toast]
  );

  // Handle keyboard shortcuts for copy/paste/delete
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = event.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || 
                       target.tagName === 'TEXTAREA' || 
                       target.isContentEditable;
      
      // Delete key for edges (only if not typing)
      if ((event.key === "Delete" || event.key === "Backspace") && selectedEdge && !isTyping) {
        event.preventDefault();
        handleEdgeDelete(selectedEdge.id);
        setSelectedEdge(null);
        setShowProperties(false);
      }
      
      // Delete key for nodes (only if not typing)
      if ((event.key === "Delete" || event.key === "Backspace") && selectedNode && !isTyping) {
        event.preventDefault();
        handleNodeDelete(selectedNode.id);
        setSelectedNode(null);
        setShowProperties(false);
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
  }, [selectedEdge, selectedNode, copiedNode, handleEdgeDelete, handleNodeDelete, setNodes, saveNode, toast]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
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
      saveNode(newNode);
    },
    [reactFlowInstance, setNodes, saveNode]
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

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      
      <div className="flex relative">
        <ProjectSidebar projectId={projectId!} />
        
        <div className="flex flex-1 w-full">
          <NodePalette 
            visibleNodeTypes={visibleNodeTypes}
            onToggleVisibility={handleToggleVisibility}
          />
          
          <div className="flex-1 relative" ref={reactFlowWrapper}>
            <div className="absolute top-4 left-4 z-10">
              <AIArchitectDialog
                projectId={projectId!}
                existingNodes={nodes}
                existingEdges={edges}
                onArchitectureGenerated={handleArchitectureGenerated}
              />
            </div>
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
              fitView
              className="bg-background"
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
            </ReactFlow>
          </div>

          {showProperties && selectedNode && (
            <NodePropertiesPanel
              node={selectedNode}
              onClose={() => setShowProperties(false)}
              onUpdate={handleNodeUpdate}
              onDelete={handleNodeDelete}
              projectId={projectId!}
            />
          )}

          {showProperties && selectedEdge && (
            <EdgePropertiesPanel
              edge={selectedEdge}
              onClose={() => setShowProperties(false)}
              onUpdate={handleEdgeUpdate}
              onVisualUpdate={handleEdgeVisualUpdate}
              onDelete={handleEdgeDelete}
            />
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
