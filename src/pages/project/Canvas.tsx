import { useCallback, useRef, useState, useMemo } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { NodePalette, NodeType } from "@/components/canvas/NodePalette";
import { CanvasNode } from "@/components/canvas/CanvasNode";
import { NodePropertiesPanel } from "@/components/canvas/NodePropertiesPanel";
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
  const [showProperties, setShowProperties] = useState(false);
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<NodeType>>(
    new Set(ALL_NODE_TYPES)
  );

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
            <ReactFlow
              nodes={visibleNodes}
              edges={visibleEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
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

          {showProperties && (
            <NodePropertiesPanel
              node={selectedNode}
              onClose={() => setShowProperties(false)}
              onUpdate={handleNodeUpdate}
              projectId={projectId!}
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
