import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Play, Square, Settings2, BarChart3, Grid3x3 } from 'lucide-react';
import { AgentFlow } from './AgentFlow';
import { ChangeLogViewer } from './ChangeLogViewer';
import { IterationVisualizer } from './IterationVisualizer';
import { ChangeHeatmap } from './ChangeHeatmap';
import { ProjectSelector } from '@/components/project/ProjectSelector';
import { Node, Edge } from 'reactflow';
import { toast } from 'sonner';

interface IterativeEnhancementProps {
  projectId: string;
  shareToken: string | null;
  existingNodes: any[];
  existingEdges: any[];
  onArchitectureGenerated: (nodes: any[], edges: any[]) => void;
}

export function IterativeEnhancement({
  projectId,
  shareToken,
  existingNodes,
  existingEdges,
  onArchitectureGenerated,
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
  const [visualizationMode, setVisualizationMode] = useState<'chart' | 'heatmap'>('chart'); // FIX #7

  const handleFlowChange = (nodes: Node[], edges: Edge[]) => {
    setAgentFlowNodes(nodes);
    setAgentFlowEdges(edges);
  };

  const handleContextConfirm = (context: any) => {
    setSelectedContext(context);
    setShowProjectSelector(false);
    toast.success('Project context selected');
  };

  const validateAgentFlow = () => {
    if (agentFlowNodes.length === 0) {
      toast.error('Please add at least one agent to the flow');
      return false;
    }

    if (agentFlowEdges.length === 0) {
      toast.error('Please connect agents to form a flow');
      return false;
    }

    // Check if flow forms a loop
    const hasLoop = checkForLoop(agentFlowNodes, agentFlowEdges);
    if (!hasLoop) {
      toast.warning('Agent flow should form a loop for optimal iteration');
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

  const startIteration = async () => {
    if (!validateAgentFlow()) return;

    setIsRunning(true);
    setCurrentIteration(0);
    setChangeLogs([]);
    setMetrics([]);

    try {
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
          }),
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
            } else if (event.type === 'agent_complete') {
              setChangeLogs((prev) => [...prev, event.changeLog]);
              setMetrics((prev) => [...prev, event.metric]);
              onArchitectureGenerated([], []); // Trigger refresh
            } else if (event.type === 'agent_error') {
              toast.error(`Agent error: ${event.error}`);
            } else if (event.type === 'complete') {
              toast.success(`Completed ${iterations} iterations!`);
              setIsRunning(false);
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
      toast.error(error instanceof Error ? error.message : 'Failed to run iteration');
      setIsRunning(false);
    }
  };

  const stopIteration = () => {
    setIsRunning(false);
    toast.info('Iteration stopped');
  };

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
    <div className="space-y-4">
      {/* Configuration Controls */}
      <Card className="p-4">
        <div className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label htmlFor="iterations">Number of Iterations</Label>
              <Input
                id="iterations"
                type="number"
                min={1}
                max={1000}
                value={iterations}
                onChange={(e) => setIterations(parseInt(e.target.value) || 1)}
                disabled={isRunning}
              />
            </div>

            <Button
              variant="outline"
              onClick={() => setShowProjectSelector(true)}
              disabled={isRunning}
            >
              <Settings2 className="w-4 h-4 mr-2" />
              Select Context
              {selectedContext && (
                <span className="ml-2 text-xs text-muted-foreground">
                  (Selected)
                </span>
              )}
            </Button>

            {!isRunning ? (
              <Button onClick={startIteration}>
                <Play className="w-4 h-4 mr-2" />
                Start Iteration
              </Button>
            ) : (
              <Button variant="destructive" onClick={stopIteration}>
                <Square className="w-4 h-4 mr-2" />
                Stop
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Agent Flow Canvas */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">Agent Flow Design</h3>
        <div className="h-[400px]">
          <AgentFlow onFlowChange={handleFlowChange} />
        </div>
      </Card>

      {/* Visualization and Change Log */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          {/* FIX #7: Visualization mode toggle */}
          <div className="flex justify-end gap-2 mb-2">
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
          </div>
          
          {visualizationMode === 'chart' ? (
            <IterationVisualizer
              metrics={metrics}
              currentIteration={currentIteration}
              totalIterations={iterations}
            />
          ) : (
            <ChangeHeatmap
              metrics={metrics}
              currentIteration={currentIteration}
              totalIterations={iterations}
            />
          )}
        </div>
        <ChangeLogViewer
          logs={changeLogs}
          onSaveAsArtifact={handleSaveAsArtifact}
        />
      </div>

      {/* Project Selector Modal */}
      <ProjectSelector
        projectId={projectId}
        shareToken={shareToken}
        open={showProjectSelector}
        onClose={() => setShowProjectSelector(false)}
        onConfirm={handleContextConfirm}
      />
    </div>
  );
}
