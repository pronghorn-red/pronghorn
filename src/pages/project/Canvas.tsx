import { useCallback, useRef, useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { NodePalette, NodeType } from "@/components/canvas/NodePalette";
import { CanvasNode } from "@/components/canvas/CanvasNode";
import { useParams } from "react-router-dom";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
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

const initialNodes: Node[] = [
  {
    id: "1",
    type: "custom",
    data: { label: "Login Component", type: "COMPONENT", subtitle: "React" },
    position: { x: 250, y: 100 },
  },
  {
    id: "2",
    type: "custom",
    data: { label: "Auth API", type: "API", subtitle: "/api/auth" },
    position: { x: 500, y: 100 },
  },
  {
    id: "3",
    type: "custom",
    data: { label: "User Database", type: "DATABASE", subtitle: "PostgreSQL" },
    position: { x: 750, y: 100 },
  },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "1", target: "2", label: "calls", animated: true },
  { id: "e2-3", source: "2", target: "3", label: "queries" },
];

function CanvasFlow() {
  const { projectId } = useParams<{ projectId: string }>();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
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
        id: `node-${Date.now()}`,
        type: "custom",
        position,
        data: {
          label: `New ${type}`,
          type,
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      
      <div className="flex">
        <ProjectSidebar projectId={projectId!} />
        
        <div className="flex flex-1">
          <NodePalette />
          
          <div className="flex-1 relative" ref={reactFlowWrapper}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
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
            
            {/* Toolbar */}
            <div className="absolute top-4 left-4 flex gap-2">
              <Button variant="secondary" size="sm" className="gap-2">
                <ZoomIn className="h-3 w-3" />
                Zoom In
              </Button>
              <Button variant="secondary" size="sm" className="gap-2">
                <ZoomOut className="h-3 w-3" />
                Zoom Out
              </Button>
              <Button variant="secondary" size="sm" className="gap-2">
                <Maximize className="h-3 w-3" />
                Fit View
              </Button>
            </div>
          </div>
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
