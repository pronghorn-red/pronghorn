import { useCallback, useState, useRef, useEffect } from 'react';
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
function AgentNode({ data, id, selected }: { data: any; id: string; selected: boolean }) {
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
  const isExecuting = data.isExecuting || false;

  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} className="w-3 h-3" />
      <Card 
        className={`p-4 rounded-lg shadow-lg min-w-[180px] border-2 transition-all ${
          isExecuting ? 'ring-4 ring-yellow-400 animate-pulse' : ''
        } ${selected ? 'ring-2 ring-white' : ''}`}
        style={{ 
          backgroundColor: bgColor,
          borderColor: bgColor,
          color: '#ffffff'
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="font-semibold text-sm">{data.label || data.type}</div>
          <div className="flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onPlay?.(id);
              }}
              className="w-6 h-6 flex items-center justify-center bg-white/20 hover:bg-white/30 rounded transition-colors"
              title="Execute from this agent"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
                <path d="M3 2.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zM3 8a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9A.5.5 0 0 1 3 8zm0 5.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5z" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onEdit?.(id);
              }}
              className="w-6 h-6 flex items-center justify-center bg-white/20 hover:bg-white/30 rounded transition-colors"
              title="Edit agent prompt"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
        </div>
        <div className="text-xs opacity-90">{data.description}</div>
      </Card>
      <Handle type="source" position={Position.Right} className="w-3 h-3" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  agentNode: AgentNode,
};

interface AgentFlowProps {
  onFlowChange?: (nodes: Node[], edges: Edge[]) => void;
  agentDefinitions: AgentDefinition[];
  executingAgentId?: string | null;
  onEditAgent?: (nodeId: string) => void;
  onPlayAgent?: (nodeId: string) => void;
}

export function AgentFlow({ onFlowChange, agentDefinitions, executingAgentId, onEditAgent, onPlayAgent }: AgentFlowProps) {
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
      
      // Use screenToFlowPosition with raw client coordinates
      // This automatically accounts for zoom and pan
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `${agent.id}-${Date.now()}`,
        type: 'agentNode',
        position,
        data: {
          type: agent.id,
          label: agent.label,
          color: agent.color,
          description: agent.description,
          systemPrompt: agent.systemPrompt,
          capabilities: agent.capabilities,
          onEdit: onEditAgent,
          onPlay: onPlayAgent,
        },
      };

      setNodes((nds) => [...nds, newNode]);
      if (onFlowChange) {
        onFlowChange([...nodes, newNode], edges);
      }
    },
    [reactFlowInstance, nodes, edges, onFlowChange, setNodes, onEditAgent, onPlayAgent]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const newEdges = addEdge({ 
          ...connection, 
          animated: true, 
          type: 'bezier',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
          },
          style: { strokeWidth: 2 }
        }, eds);

        if (onFlowChange) {
          onFlowChange(nodes, newEdges);
        }

        return newEdges;
      });
    },
    [nodes, onFlowChange, setEdges]
  );

  const onNodeDragStop = useCallback(() => {
    if (onFlowChange) {
      onFlowChange(nodes, edges);
    }
  }, [nodes, edges, onFlowChange]);

  // Update nodes with execution state
  useEffect(() => {
    setNodes((nds) => 
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isExecuting: executingAgentId === node.data.type,
          onEdit: onEditAgent,
          onPlay: onPlayAgent,
        },
      }))
    );
  }, [executingAgentId, onEditAgent, onPlayAgent]);

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
          type: 'bezier',
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
