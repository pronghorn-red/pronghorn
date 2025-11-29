import { useCallback, useState, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Background,
  Controls,
  Connection,
  NodeTypes,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Card } from '@/components/ui/card';

interface AgentDefinition {
  id: string;
  label: string;
  color: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
}

// Custom agent node component with connection handles
function AgentNode({ data }: { data: any }) {
  // Color mapping from Tailwind classes to actual colors
  const colorMap: Record<string, string> = {
    'bg-blue-500': '#3b82f6',
    'bg-green-500': '#22c55e',
    'bg-red-500': '#ef4444',
    'bg-purple-500': '#a855f7',
    'bg-orange-500': '#f97316',
    'bg-cyan-500': '#06b6d4',
    'bg-pink-500': '#ec4899',
    'bg-yellow-500': '#eab308',
    'bg-indigo-500': '#6366f1',
    'bg-teal-500': '#14b8a6',
    'bg-gray-600': '#4b5563',
  };

  const bgColor = colorMap[data.color] || '#3b82f6';

  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} className="w-3 h-3" />
      <Card 
        className="p-4 rounded-lg shadow-lg min-w-[180px] border-2" 
        style={{ 
          backgroundColor: bgColor,
          borderColor: bgColor,
          color: '#ffffff'
        }}
      >
        <div className="font-semibold text-sm">{data.label || data.type}</div>
        <div className="text-xs opacity-90 mt-1">{data.description}</div>
      </Card>
      <Handle type="source" position={Position.Right} className="w-3 h-3" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  agent: AgentNode,
};

interface AgentFlowProps {
  onFlowChange?: (nodes: Node[], edges: Edge[]) => void;
  agentDefinitions: AgentDefinition[];
}

export function AgentFlow({ onFlowChange, agentDefinitions }: AgentFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowInstance || !reactFlowWrapper.current) return;

      const agentData = event.dataTransfer.getData('application/reactflow');
      if (!agentData) return;

      const agent: AgentDefinition = JSON.parse(agentData);
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const newNode: Node = {
        id: `${agent.id}-${Date.now()}`,
        type: 'agent',
        position,
        data: {
          type: agent.id,
          label: agent.label,
          color: agent.color,
          description: agent.description,
          systemPrompt: agent.systemPrompt,
          capabilities: agent.capabilities,
        },
      };

      setNodes((nds) => [...nds, newNode]);
      if (onFlowChange) {
        onFlowChange([...nodes, newNode], edges);
      }
    },
    [reactFlowInstance, nodes, edges, onFlowChange, setNodes]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ 
        ...connection, 
        animated: true, 
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
        },
        style: { strokeWidth: 2 }
      }, eds));
      if (onFlowChange) {
        onFlowChange(nodes, edges);
      }
    },
    [nodes, edges, onFlowChange]
  );

  const onNodeDragStop = useCallback(() => {
    if (onFlowChange) {
      onFlowChange(nodes, edges);
    }
  }, [nodes, edges, onFlowChange]);


  return (
    <div ref={reactFlowWrapper} className="h-full w-full bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        defaultEdgeOptions={{
          animated: true,
          type: 'smoothstep',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
          },
          style: { strokeWidth: 2 }
        }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
