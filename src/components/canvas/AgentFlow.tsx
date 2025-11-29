import { useCallback, useState, useEffect } from 'react';
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

// Custom agent node component
function AgentNode({ data }: { data: any }) {
  return (
    <Card className={`${data.color} text-white p-4 rounded-lg shadow-lg min-w-[180px]`}>
      <div className="font-semibold text-sm">{data.label || data.type}</div>
      <div className="text-xs opacity-90 mt-1">{data.description}</div>
    </Card>
  );
}

const nodeTypes: NodeTypes = {
  agent: AgentNode,
};

interface AgentFlowProps {
  onFlowChange?: (nodes: Node[], edges: Edge[]) => void;
}

export function AgentFlow({ onFlowChange }: AgentFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [agentDefinitions, setAgentDefinitions] = useState<AgentDefinition[]>([]);

  useEffect(() => {
    fetch('/data/buildAgents.json')
      .then(res => res.json())
      .then(data => setAgentDefinitions(data))
      .catch(err => console.error('Error loading agent definitions:', err));
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, animated: true, type: 'smoothstep' }, eds));
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

  const addAgentNode = useCallback((agentDef: AgentDefinition) => {
    const newNode: Node = {
      id: `${agentDef.id}-${Date.now()}`,
      type: 'agent',
      position: { x: Math.random() * 300 + 100, y: Math.random() * 300 + 100 },
      data: { 
        type: agentDef.id,
        label: agentDef.label,
        color: agentDef.color,
        description: agentDef.description,
        systemPrompt: agentDef.systemPrompt,
        capabilities: agentDef.capabilities,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    if (onFlowChange) {
      onFlowChange([...nodes, newNode], edges);
    }
  }, [nodes, edges, onFlowChange, setNodes]);

  return (
    <div className="flex gap-4 h-full">
      {/* Agent Palette */}
      <div className="w-64 space-y-2 overflow-y-auto">
        <h3 className="font-semibold text-sm mb-3">Agent Types</h3>
        {agentDefinitions.map((agent) => (
          <Card
            key={agent.id}
            className="p-3 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => addAgentNode(agent)}
          >
            <div className={`w-3 h-3 rounded-full ${agent.color} inline-block mr-2`} />
            <span className="font-medium text-sm">{agent.label}</span>
            <p className="text-xs text-muted-foreground mt-1">{agent.description}</p>
          </Card>
        ))}
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1 border rounded-lg bg-background">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
