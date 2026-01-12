import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Play, Square, Settings2, BarChart3, Grid3x3, MessageSquare } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgentFlow } from './AgentFlow';
import { AgentPromptEditDialog } from './AgentPromptEditDialog';
import { IterationVisualizer } from './IterationVisualizer';
import { ChangeHeatmap } from './ChangeHeatmap';
import { BlackboardViewer } from './BlackboardViewer';
import { ProjectSelector } from '@/components/project/ProjectSelector';
import { Node, Edge } from 'reactflow';
import { toast } from 'sonner';

interface IterativeEnhancementProps {
  projectId: string;
  shareToken: string | null;
  existingNodes: any[];
  existingEdges: any[];
  onArchitectureGenerated: (nodes: any[], edges: any[]) => void;
  onCanvasRefresh?: () => void;
}

export function IterativeEnhancement({
  projectId,
  shareToken,
  existingNodes,
  existingEdges,
  onArchitectureGenerated,
  onCanvasRefresh,
}: IterativeEnhancementProps) {
  const [agentFlowNodes, setAgentFlowNodes] = useState<Node[]>([]);
  const [agentFlowEdges, setAgentFlowEdges] = useState<Edge[]>([]);
  const [iterations, setIterations] = useState(5);
  const [isRunning, setIsRunning] = useState(false);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [selectedContext, setSelectedContext] = useState<any>(null);
  const [changeLogs, setChangeLogs] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [visualizationMode, setVisualizationMode] = useState<'chart' | 'heatmap' | 'blackboard'>('chart');
  const [orchestratorEnabled, setOrchestratorEnabled] = useState(true);
  const [drawEdges, setDrawEdges] = useState(true);
  const [blackboard, setBlackboard] = useState<string[]>([]);
  const [agentDefinitions, setAgentDefinitions] = useState<any[]>([]);
  const [executingAgentId, setExecutingAgentId] = useState<string | null>(null);
  const [editingAgentNodeId, setEditingAgentNodeId] = useState<string | null>(null);
  const [agentPrompts, setAgentPrompts] = useState<Record<string, { system: string; user: string }>>({});
  const [initialNodeCount, setInitialNodeCount] = useState(0);
  const [initialEdgeCount, setInitialEdgeCount] = useState(0);
  const [currentNodeCount, setCurrentNodeCount] = useState(0);
  const [currentEdgeCount, setCurrentEdgeCount] = useState(0);

  useEffect(() => {
    fetch('/data/buildAgents.json')
      .then(res => res.json())
      .then(data => setAgentDefinitions(data))
      .catch(err => console.error('Error loading agent definitions:', err));
  }, []);

  const onDragStart = (event: React.DragEvent, agent: any) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(agent));
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleFlowChange = (nodes: Node[], edges: Edge[]) => {
    setAgentFlowNodes(nodes);
    setAgentFlowEdges(edges);
  };

  const createStandardFlow = (flowType: 'simple' | 'standard' | 'full' | 'simplify') => {
    const flowDefinitions = {
      simple: ['architect', 'developer'],
      standard: ['architect', 'developer', 'dba', 'qa', 'cyber'],
      full: ['architect', 'standards', 'developer', 'dba', 'cloudops', 'qa', 'uat', 'cyber'],
      simplify: ['simplifier', 'integrator', 'simplifier'],
    } as const;

    const agentIds = flowDefinitions[flowType];
    const agents = agentIds.map(id => agentDefinitions.find((a) => a.id === id)).filter(Boolean);

    if (agents.length === 0) {
      toast.error('Agent definitions not loaded yet');
      return;
    }

    // Create nodes in staggered layout (3 per row)
    const nodesPerRow = 3;
    const horizontalSpacing = 300;
    const verticalSpacing = 150;
    
    const newNodes: Node[] = agents.map((agent, index) => {
      const row = Math.floor(index / nodesPerRow);
      const col = index % nodesPerRow;
      
      return {
        id: `${agent.id}-${Date.now()}-${index}`,
        type: 'agentNode',
        position: { 
          x: col * horizontalSpacing + 50, 
          y: row * verticalSpacing + 50,
        },
        data: {
          type: agent.id,
          label: agent.label,
          color: agent.color,
          description: agent.description,
          systemPrompt: agent.systemPrompt,
          capabilities: agent.capabilities,
        },
      };
    });

    // Create edges connecting each agent in sequence
    const newEdges: Edge[] = [];
    for (let i = 0; i < newNodes.length - 1; i++) {
      newEdges.push({
        id: `edge-${Date.now()}-${i}`,
        source: newNodes[i].id,
        target: newNodes[i + 1].id,
        type: 'default', // 'default' is the bezier curve in React Flow
        animated: true,
        markerEnd: {
          type: 'arrowclosed' as any,
          width: 20,
          height: 20,
        },
        style: { strokeWidth: 2 },
      });
    }

    // Add final edge back to first node (Architect)
    if (newNodes.length > 1) {
      newEdges.push({
        id: `edge-loop-${Date.now()}`,
        source: newNodes[newNodes.length - 1].id,
        target: newNodes[0].id,
        type: 'default', // 'default' is the bezier curve in React Flow
        animated: true,
        markerEnd: {
          type: 'arrowclosed' as any,
          width: 20,
          height: 20,
        },
        style: { strokeWidth: 2 },
      });
    }

    setAgentFlowNodes(newNodes);
    setAgentFlowEdges(newEdges);
    toast.success(`${flowType.charAt(0).toUpperCase() + flowType.slice(1)} flow created`);
  };

  const handleContextConfirm = (context: any) => {
    // Directly use the selection returned by ProjectSelector so counts stay stable
    setSelectedContext(context);
    setShowProjectSelector(false);
    toast.success('Project context selected');
  };

  const validateAgentFlow = () => {
    if (agentFlowNodes.length === 0) {
      toast.error('Please add at least one agent to the flow');
      return false;
    }

    // Only check for edges if there are multiple nodes
    if (agentFlowNodes.length > 1 && agentFlowEdges.length === 0) {
      toast.error('Please connect agents to form a flow');
      return false;
    }

    // Check if flow forms a loop (only for multiple nodes)
    if (agentFlowNodes.length > 1) {
      const hasLoop = checkForLoop(agentFlowNodes, agentFlowEdges);
      if (!hasLoop) {
        toast.warning('Agent flow should form a loop for optimal iteration');
      }
    }

    if (!selectedContext) {
      toast.error('Please select project context for agents to work with');
      return false;
    }

    return true;
  };

  const checkForLoop = (nodes: Node[], edges: Edge[]) => {
    // Simple cycle detection
    const graph = new Map<string, string[]>();
    nodes.forEach(node => graph.set(node.id, []));
    edges.forEach(edge => {
      const targets = graph.get(edge.source) || [];
      targets.push(edge.target);
      graph.set(edge.source, targets);
    });

    // DFS to find cycle
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);

      const neighbors = graph.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) return true;
        } else if (recStack.has(neighbor)) {
          return true;
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const nodeId of nodes.map(n => n.id)) {
      if (!visited.has(nodeId)) {
        if (hasCycle(nodeId)) return true;
      }
    }

    return false;
  };

  const startIteration = async (startFromNodeId?: string) => {
    if (!validateAgentFlow()) return;

    setIsRunning(true);
    setCurrentIteration(0);
    setChangeLogs([]);
    setMetrics([]);
    setBlackboard([]);
    setExecutingAgentId(null);
    
    // Track initial counts to show delta during iteration
    setInitialNodeCount(existingNodes.length);
    setInitialEdgeCount(existingEdges.length);
    setCurrentNodeCount(existingNodes.length);
    setCurrentEdgeCount(existingEdges.length);

    // FIX #2: Create AbortController for stopping
    const controller = new AbortController();
    setAbortController(controller);

    try {
      // Fetch project settings for LLM configuration
      const { data: projectData } = await supabase.rpc("get_project_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orchestrate-agents`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            projectId,
            shareToken,
            agentFlow: {
              nodes: agentFlowNodes,
              edges: agentFlowEdges,
            },
            attachedContext: selectedContext,
            iterations,
            orchestratorEnabled,
            drawEdges,
            startFromNodeId,
            agentPrompts,
            // Pass LLM settings from project
            selectedModel: projectData?.selected_model || 'gemini-2.5-flash',
            maxTokens: projectData?.max_tokens || 32768,
            thinkingEnabled: projectData?.thinking_enabled || false,
            thinkingBudget: projectData?.thinking_budget || -1,
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok || !response.body) {
        throw new Error('Failed to start agent orchestration');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'iteration_start') {
              setCurrentIteration(event.iteration);
            } else if (event.type === 'agent_start') {
              setExecutingAgentId(event.agentId);
            } else if (event.type === 'agent_complete') {
              setExecutingAgentId(null);
              setChangeLogs((prev) => [...prev, event.changeLog]);
              setMetrics((prev) => [...prev, event.metric]);
              // Update current counts to show delta
              if (event.currentCounts) {
                setCurrentNodeCount(event.currentCounts.nodes);
                setCurrentEdgeCount(event.currentCounts.edges);
              }
              // Don't call onArchitectureGenerated - let real-time subscriptions handle canvas updates
            } else if (event.type === 'blackboard_update') {
              setBlackboard(event.blackboard || []);
            } else if (event.type === 'agent_error') {
              const errorMsg = event.error || 'Unknown error';
              if (errorMsg.includes('credits') || errorMsg.includes('Payment') || errorMsg.includes('402')) {
                toast.error(`Agent error: ${errorMsg}`, { duration: 10000 });
                setIsRunning(false);
                setAbortController(null);
              } else {
                toast.error(`Agent error: ${errorMsg}`);
              }
            } else if (event.type === 'complete') {
              toast.success(`Completed ${iterations} iterations!`);
              setIsRunning(false);
              setAbortController(null);
              // Ensure the main canvas reloads with the final state
              onCanvasRefresh?.();
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (parseErr) {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }
    } catch (error) {
      console.error('Iteration error:', error);
      if (error instanceof Error && error.name !== 'AbortError') {
        toast.error(error.message || 'Failed to run iteration');
      }
      setIsRunning(false);
      setAbortController(null);
    }
  };

  const stopIteration = () => {
    // FIX #2: Abort the stream
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setIsRunning(false);
    setExecutingAgentId(null);
    toast.info('Iteration stopped');
  };

  const handleEditAgent = (nodeId: string) => {
    setEditingAgentNodeId(nodeId);
  };

  const handlePlayAgent = (nodeId: string) => {
    startIteration(nodeId);
  };

  const handleDeleteAgent = (nodeId: string) => {
    setAgentFlowNodes((nds) => nds.filter(n => n.id !== nodeId));
    setAgentFlowEdges((eds) => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
  };

  const handleSaveAgentPrompt = (nodeId: string, systemPrompt: string, userPrompt: string) => {
    setAgentPrompts((prev) => ({
      ...prev,
      [nodeId]: { system: systemPrompt, user: userPrompt },
    }));
  };

  const editingNode = agentFlowNodes.find((n) => n.id === editingAgentNodeId);
  const editingAgentPrompt = editingAgentNodeId ? agentPrompts[editingAgentNodeId] : null;

  const handleSaveAsArtifact = async () => {
    try {
      const changeLogContent = changeLogs
        .map((log) => {
          return `## Iteration ${log.iteration} - ${log.agentLabel}\n**Time:** ${new Date(log.timestamp).toLocaleString()}\n\n**Reasoning:**\n${log.reasoning}\n\n**Changes:**\n${log.changes}\n\n---\n`;
        })
        .join('\n');

      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-artifact-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            projectId,
            shareToken,
            content: changeLogContent,
            sourceType: 'iterative_enhancement',
          }),
        }
      );

      toast.success('Change log saved as artifact');
    } catch (error) {
      console.error('Error saving change log:', error);
      toast.error('Failed to save change log');
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-2 md:gap-4 min-h-0 overflow-y-auto md:overflow-hidden md:flex-row">
      {/* Left Sidebar */}
      <div className="w-full md:w-64 flex flex-col md:border-r md:pr-4 shrink-0 md:h-full md:overflow-hidden">
        <ScrollArea className="flex-1 md:h-full">
          <div className="space-y-4 pr-4">
          {/* Context Options */}
          <div className="space-y-2">
            <h3 className="font-medium text-sm">Context Options</h3>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowProjectSelector(true)}
              disabled={isRunning}
              className="w-full justify-start text-xs"
            >
              <Settings2 className="h-3 w-3 mr-2" />
              Select Project Elements
            </Button>
            
            {selectedContext && (
              <div className="text-xs text-muted-foreground space-y-1">
                {selectedContext.projectMetadata && <p>✓ Project metadata</p>}
                {selectedContext.artifacts?.length > 0 && <p>✓ {selectedContext.artifacts.length} artifact{selectedContext.artifacts.length !== 1 ? 's' : ''}</p>}
                {selectedContext.chatSessions?.length > 0 && <p>✓ {selectedContext.chatSessions.length} chat session{selectedContext.chatSessions.length !== 1 ? 's' : ''}</p>}
                {selectedContext.requirements?.length > 0 && <p>✓ {selectedContext.requirements.length} requirement{selectedContext.requirements.length !== 1 ? 's' : ''}</p>}
                {selectedContext.standards?.length > 0 && <p>✓ {selectedContext.standards.length} standard{selectedContext.standards.length !== 1 ? 's' : ''}</p>}
                {selectedContext.techStacks?.length > 0 && <p>✓ {selectedContext.techStacks.length} tech stack{selectedContext.techStacks.length !== 1 ? 's' : ''}</p>}
                {selectedContext.canvasNodes?.length > 0 && <p>✓ {selectedContext.canvasNodes.length} node{selectedContext.canvasNodes.length !== 1 ? 's' : ''}</p>}
                {selectedContext.canvasEdges?.length > 0 && <p>✓ {selectedContext.canvasEdges.length} edge{selectedContext.canvasEdges.length !== 1 ? 's' : ''}</p>}
                {selectedContext.canvasLayers?.length > 0 && <p>✓ {selectedContext.canvasLayers.length} layer{selectedContext.canvasLayers.length !== 1 ? 's' : ''}</p>}
                {selectedContext.files?.length > 0 && <p>✓ {selectedContext.files.length} file{selectedContext.files.length !== 1 ? 's' : ''}</p>}
                {selectedContext.databases?.length > 0 && <p>✓ {selectedContext.databases.length} database item{selectedContext.databases.length !== 1 ? 's' : ''}</p>}
              </div>
            )}
            
            {/* Show iteration delta */}
            {isRunning && metrics.length > 0 && (
              <div className="text-xs text-primary space-y-1 pt-2 border-t mt-2">
                <p className="font-semibold">Added This Iteration:</p>
                <p>+{metrics.reduce((sum, m) => sum + m.nodesAdded, 0)} nodes</p>
                <p>~{metrics.reduce((sum, m) => sum + m.nodesEdited, 0)}</p>
                <p>-{metrics.reduce((sum, m) => sum + m.nodesDeleted, 0)}</p>
                <p>+{metrics.reduce((sum, m) => sum + m.edgesAdded, 0)} edges</p>
                <p>~{metrics.reduce((sum, m) => sum + m.edgesEdited, 0)}</p>
                <p>-{metrics.reduce((sum, m) => sum + m.edgesDeleted, 0)}</p>
              </div>
            )}
          </div>

          {/* Orchestrator Toggle */}
          <div className="space-y-2 pt-4 border-t">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="orchestrator"
                checked={orchestratorEnabled}
                onChange={(e) => setOrchestratorEnabled(e.target.checked)}
                disabled={isRunning}
                className="w-4 h-4"
              />
              <Label htmlFor="orchestrator" className="text-sm cursor-pointer">
                Enable Orchestrator
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="drawEdges"
                checked={drawEdges}
                onChange={(e) => setDrawEdges(e.target.checked)}
                disabled={isRunning}
                className="w-4 h-4"
              />
              <Label htmlFor="drawEdges" className="text-sm cursor-pointer">
                Draw Edges
              </Label>
            </div>
          </div>

          {/* Iterations */}
          <div className="space-y-2 pt-4 border-t">
            <Label htmlFor="iterations" className="text-sm">Number of Iterations</Label>
            <Input
              id="iterations"
              type="number"
              min={1}
              max={1000}
              value={iterations}
              onChange={(e) => setIterations(parseInt(e.target.value) || 1)}
              disabled={isRunning}
              className="text-sm"
            />
          </div>

          {/* Agent Types */}
          <div className="space-y-2 pt-4 border-t">
            <h3 className="font-semibold text-sm mb-3">Agent Types</h3>
            <p className="text-xs text-muted-foreground mb-2">Drag agents onto canvas</p>
            <div className="space-y-2">
              {agentDefinitions.map((agent) => (
                <div
                  key={agent.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, agent)}
                  className="p-3 border rounded-lg cursor-move hover:shadow-md transition-shadow bg-card"
                >
                  <div 
                    className="w-3 h-3 rounded-full inline-block mr-2" 
                    style={{ backgroundColor: agent.color }}
                  />
                  <span className="font-medium text-sm">{agent.label}</span>
                  <p className="text-xs text-muted-foreground mt-1">{agent.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Standard Flows */}
          <div className="space-y-2 pt-4 border-t">
            <h3 className="font-semibold text-sm mb-3">Standard Flows</h3>
            <p className="text-xs text-muted-foreground mb-2">Pre-configured agent sequences</p>
            <div className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full justify-start text-sm h-auto py-2"
                onClick={() => createStandardFlow('simple')}
                disabled={isRunning}
              >
                <div className="text-left w-full">
                  <div className="font-medium">Simple</div>
                  <div className="text-xs text-muted-foreground whitespace-normal break-words">Architect → Developer → Architect</div>
                </div>
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start text-sm h-auto py-2"
                onClick={() => createStandardFlow('standard')}
                disabled={isRunning}
              >
                <div className="text-left w-full">
                  <div className="font-medium">Standard</div>
                  <div className="text-xs text-muted-foreground whitespace-normal break-words">Architect → Developer → DBA → QA → Cyber Security → Architect</div>
                </div>
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start text-sm h-auto py-2"
                onClick={() => createStandardFlow('simplify')}
                disabled={isRunning}
              >
                <div className="text-left w-full">
                  <div className="font-medium">Simplify</div>
                  <div className="text-xs text-muted-foreground whitespace-normal break-words">Simplifier → Integrator → Simplifier</div>
                </div>
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start text-sm h-auto py-2"
                onClick={() => createStandardFlow('full')}
                disabled={isRunning}
              >
                <div className="text-left w-full">
                  <div className="font-medium">Full</div>
                  <div className="text-xs text-muted-foreground whitespace-normal break-words">Architect → Standards → Developer → DBA → Cloud Ops → QA → UAT → Cyber Security → Architect</div>
                </div>
              </Button>
            </div>
          </div>
          </div>
        </ScrollArea>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col gap-4 md:overflow-y-auto min-h-0 shrink-0">
        {/* Agent Flow Canvas */}
        <Card className="flex-shrink-0">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Agent Flow Design</h3>
              {!isRunning ? (
                <Button onClick={() => startIteration()} size="sm">
                  <Play className="w-4 h-4 mr-2" />
                  Start Iteration
                </Button>
              ) : (
                <Button variant="destructive" onClick={stopIteration} size="sm">
                  <Square className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              )}
            </div>
            <div className="h-[400px] md:h-[500px] border rounded-lg overflow-hidden">
              <AgentFlow 
                onFlowChange={handleFlowChange} 
                agentDefinitions={agentDefinitions}
                executingAgentId={executingAgentId}
                onEditAgent={handleEditAgent}
                onPlayAgent={handlePlayAgent}
                onDeleteAgent={handleDeleteAgent}
                initialNodes={agentFlowNodes}
                initialEdges={agentFlowEdges}
              />
            </div>
          </div>
        </Card>

        {/* Visualization - Full Width */}
        <Card className="flex-shrink-0 p-4">
          {/* Visualization mode toggle */}
          <div className="flex justify-end gap-2 mb-4">
            <Button
              size="sm"
              variant={visualizationMode === 'chart' ? 'default' : 'outline'}
              onClick={() => setVisualizationMode('chart')}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Chart
            </Button>
            <Button
              size="sm"
              variant={visualizationMode === 'heatmap' ? 'default' : 'outline'}
              onClick={() => setVisualizationMode('heatmap')}
            >
              <Grid3x3 className="w-4 h-4 mr-2" />
              Heatmap
            </Button>
            <Button
              size="sm"
              variant={visualizationMode === 'blackboard' ? 'default' : 'outline'}
              onClick={() => setVisualizationMode('blackboard')}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Blackboard
            </Button>
          </div>
          
          <div className="min-h-[300px]">
            {visualizationMode === 'chart' ? (
              <IterationVisualizer
                metrics={metrics}
                currentIteration={currentIteration}
                totalIterations={iterations}
                changeLogs={changeLogs}
                onSaveAsArtifact={handleSaveAsArtifact}
              />
            ) : visualizationMode === 'heatmap' ? (
              <ChangeHeatmap
                metrics={metrics}
                currentIteration={currentIteration}
                totalIterations={iterations}
              />
            ) : (
              <BlackboardViewer
                blackboard={blackboard}
                currentIteration={currentIteration}
                totalIterations={iterations}
              />
            )}
          </div>
        </Card>
      </div>

      {/* Project Selector Modal */}
      <ProjectSelector
        projectId={projectId}
        shareToken={shareToken}
        open={showProjectSelector}
        onClose={() => setShowProjectSelector(false)}
        onConfirm={handleContextConfirm}
      />

      {/* Agent Prompt Edit Dialog */}
      {editingAgentNodeId && (() => {
        const editingNode = agentFlowNodes.find((n) => n.id === editingAgentNodeId);
        const editingAgentPrompt = agentPrompts[editingAgentNodeId];
        
        return editingNode ? (
          <AgentPromptEditDialog
            open={true}
            onOpenChange={(open) => !open && setEditingAgentNodeId(null)}
            agentLabel={editingNode.data.label}
            systemPrompt={editingAgentPrompt?.system || editingNode.data.systemPrompt}
            userPrompt={editingAgentPrompt?.user || ""}
            onSave={(system, user) => {
              setAgentPrompts((prev) => ({
                ...prev,
                [editingAgentNodeId]: { system, user },
              }));
              setEditingAgentNodeId(null);
            }}
          />
        ) : null;
      })()}
    </div>
  );
}
