import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AgentNode {
  id: string;
  data: {
    type: string;
    label: string;
    systemPrompt: string;
    capabilities: string[];
  };
}

interface ChangeMetric {
  iteration: number;
  agentId: string;
  agentLabel: string;
  nodesAdded: number;
  nodesEdited: number;
  nodesDeleted: number;
  edgesAdded: number;
  edgesEdited: number;
  edgesDeleted: number;
  timestamp: string;
}

interface ChangeLogEntry {
  iteration: number;
  agentId: string;
  agentLabel: string;
  timestamp: string;
  changes: string;
  reasoning: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      projectId,
      shareToken,
      agentFlow,
      attachedContext,
      iterations,
      orchestratorEnabled = true,
      drawEdges = true,
      startFromNodeId,
      agentPrompts = {},
      selectedModel = 'gemini-2.5-flash',
      maxTokens = 32768,
      thinkingEnabled = false,
      thinkingBudget = -1,
    } = await req.json();

    if (!projectId || !shareToken) {
      throw new Error('projectId and shareToken are required');
    }

    if (!agentFlow?.nodes || agentFlow.nodes.length === 0) {
      throw new Error('Agent flow must have at least one agent');
    }

    // Determine which API key to use based on model
    let apiKey: string;
    let apiProvider: 'gemini' | 'anthropic' | 'xai';
    
    if (selectedModel.startsWith('gemini-')) {
      apiKey = Deno.env.get('GEMINI_API_KEY') || '';
      apiProvider = 'gemini';
      if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
    } else if (selectedModel.startsWith('claude-')) {
      apiKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
      apiProvider = 'anthropic';
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
    } else if (selectedModel.startsWith('grok-')) {
      apiKey = Deno.env.get('XAI_API_KEY') || '';
      apiProvider = 'xai';
      if (!apiKey) throw new Error('XAI_API_KEY not configured');
    } else {
      throw new Error(`Unsupported model: ${selectedModel}`);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          // Validate project access
          const { data: project, error: projectError } = await supabase.rpc('get_project_with_token', {
            p_project_id: projectId,
            p_token: shareToken,
          });

          if (projectError) throw projectError;

          // Get execution order from agent flow edges
          let executionOrder = buildExecutionOrder(agentFlow.nodes, agentFlow.edges);
          
          // If startFromNodeId is specified, start execution from that node
          if (startFromNodeId) {
            const startIndex = executionOrder.findIndex((n) => n.id === startFromNodeId);
            if (startIndex > 0) {
              executionOrder = executionOrder.slice(startIndex);
            }
          }
          
          const changeLogs: ChangeLogEntry[] = [];
          const metrics: ChangeMetric[] = [];
          const blackboard: string[] = []; // Shared memory for all agents

          // Initialize delta with user's ProjectSelector canvas selection (if any)
          // Delta tracks cumulative changes: what was selected + all agent modifications
          const deltaNodes = attachedContext?.canvasNodes ? [...attachedContext.canvasNodes] : [];
          const deltaEdges = attachedContext?.canvasEdges ? [...attachedContext.canvasEdges] : [];
          
          // Track IDs for quick lookup
          const deltaNodeIds = new Set(deltaNodes.map((n: any) => n.id));
          const deltaEdgeIds = new Set(deltaEdges.map((e: any) => e.id));

          // Run iterations
          for (let iteration = 1; iteration <= iterations; iteration++) {
            send({ 
              type: 'iteration_start', 
              iteration,
              totalIterations: iterations 
            });

            // Execute each agent in order - pass cumulative delta to each agent
            for (const agentNode of executionOrder) {
              send({
                type: 'agent_start',
                iteration,
                agentId: agentNode.data.type,
                agentLabel: agentNode.data.label,
              });

              try {
                // Validate agent is connected
                const isConnected = agentFlow.edges.some(
                  (e: any) => e.source === agentNode.id || e.target === agentNode.id
                );
                if (!isConnected && agentFlow.nodes.length > 1) {
                  throw new Error(`Agent ${agentNode.data.label} is not connected to the flow`);
                }

                // CONTEXT PASSED TO EACH AGENT:
                // 1. ProjectSelector content (artifacts, chat, requirements, standards, tech stacks)
                // 2. Blackboard shared memory (orchestrator guidance from all previous agents)
                // 3. CUMULATIVE DELTA of canvas nodes/edges:
                //    - Starts with whatever user selected in ProjectSelector (could be nothing)
                //    - Accumulates all additions/edits/deletions from previous agents in this iteration
                const result = await executeAgent(
                  agentNode,
                  {
                    projectId,
                    shareToken,
                    currentNodes: deltaNodes,
                    currentEdges: deltaEdges,
                    attachedContext,
                    iteration,
                    capabilities: agentNode.data.capabilities,
                    blackboard,
                    customPrompt: agentPrompts[agentNode.id],
                    selectedModel,
                    maxTokens,
                    thinkingEnabled,
                    thinkingBudget,
                    drawEdges,
                  },
                  supabase,
                  apiKey,
                  apiProvider
                );

                // Apply agent's changes to the cumulative delta
                // Fetch updated canvas state once to sync delta with DB reality
                const { data: allCurrentNodes } = await supabase.rpc('get_canvas_nodes_with_token', {
                  p_project_id: projectId,
                  p_token: shareToken,
                });
                const { data: allCurrentEdges } = await supabase.rpc('get_canvas_edges_with_token', {
                  p_project_id: projectId,
                  p_token: shareToken,
                });
                
                // Nodes added: find newly created nodes and add to delta
                if (result.newNodeIds && result.newNodeIds.length > 0) {
                  for (const newId of result.newNodeIds) {
                    const fetchedNode = (allCurrentNodes || []).find((n: any) => n.id === newId);
                    if (fetchedNode && !deltaNodeIds.has(fetchedNode.id)) {
                      deltaNodes.push(fetchedNode);
                      deltaNodeIds.add(fetchedNode.id);
                    }
                  }
                }

                // Nodes edited: update in delta with fresh DB data
                if (result.nodesToEdit && result.nodesToEdit.length > 0) {
                  for (const editedNode of result.nodesToEdit) {
                    const idx = deltaNodes.findIndex((n: any) => n.id === editedNode.id);
                    if (idx !== -1) {
                      const fetchedNode = (allCurrentNodes || []).find((n: any) => n.id === editedNode.id);
                      if (fetchedNode) {
                        deltaNodes[idx] = fetchedNode;
                      }
                    }
                  }
                }

                // Nodes deleted: remove from delta
                if (result.nodesToDelete && result.nodesToDelete.length > 0) {
                  for (const deleteId of result.nodesToDelete) {
                    const idx = deltaNodes.findIndex((n: any) => n.id === deleteId);
                    if (idx !== -1) {
                      deltaNodes.splice(idx, 1);
                      deltaNodeIds.delete(deleteId);
                    }
                  }
                }

                // Edges added: find newly created edges and add to delta
                if (result.edgesToAdd && result.edgesToAdd.length > 0) {
                  for (const edgeSpec of result.edgesToAdd) {
                    // Find the edge that was just created (matching source/target)
                    const fetchedEdge = (allCurrentEdges || []).find((e: any) => 
                      e.source_id === edgeSpec.source && e.target_id === edgeSpec.target && !deltaEdgeIds.has(e.id)
                    );
                    if (fetchedEdge) {
                      deltaEdges.push(fetchedEdge);
                      deltaEdgeIds.add(fetchedEdge.id);
                    }
                  }
                }

                // Edges edited: update in delta with fresh DB data
                if (result.edgesToEdit && result.edgesToEdit.length > 0) {
                  for (const editedEdge of result.edgesToEdit) {
                    const idx = deltaEdges.findIndex((e: any) => e.id === editedEdge.id);
                    if (idx !== -1) {
                      const fetchedEdge = (allCurrentEdges || []).find((e: any) => e.id === editedEdge.id);
                      if (fetchedEdge) {
                        deltaEdges[idx] = fetchedEdge;
                      }
                    }
                  }
                }

                // Edges deleted: remove from delta
                if (result.edgesToDelete && result.edgesToDelete.length > 0) {
                  for (const deleteId of result.edgesToDelete) {
                    const idx = deltaEdges.findIndex((e: any) => e.id === deleteId);
                    if (idx !== -1) {
                      deltaEdges.splice(idx, 1);
                      deltaEdgeIds.delete(deleteId);
                    }
                  }
                }

                // Record changes
                const changeLog: ChangeLogEntry = {
                  iteration,
                  agentId: agentNode.data.type,
                  agentLabel: agentNode.data.label,
                  timestamp: new Date().toISOString(),
                  changes: result.changes,
                  reasoning: result.reasoning,
                };
                changeLogs.push(changeLog);

                const metric: ChangeMetric = {
                  iteration,
                  agentId: agentNode.data.type,
                  agentLabel: agentNode.data.label,
                  nodesAdded: result.metrics.nodesAdded,
                  nodesEdited: result.metrics.nodesEdited,
                  nodesDeleted: result.metrics.nodesDeleted,
                  edgesAdded: result.metrics.edgesAdded,
                  edgesEdited: result.metrics.edgesEdited,
                  edgesDeleted: result.metrics.edgesDeleted,
                  timestamp: new Date().toISOString(),
                };
                metrics.push(metric);

                send({
                  type: 'agent_complete',
                  iteration,
                  agentId: agentNode.data.type,
                  changeLog,
                  metric,
                  currentCounts: {
                    nodes: deltaNodes.length,
                    edges: deltaEdges.length,
                  },
                });

                // Call orchestrator after each agent execution
                if (orchestratorEnabled) {
                  try {
                    const orchestratorGuidance = await executeOrchestrator(
                      {
                        agentLabel: agentNode.data.label,
                        changes: result.changes,
                        reasoning: result.reasoning,
                        currentNodes: deltaNodes,
                        currentEdges: deltaEdges,
                        attachedContext,
                        blackboard,
                        iteration,
                        selectedModel,
                        maxTokens,
                        thinkingEnabled,
                        thinkingBudget,
                      },
                      apiKey,
                      apiProvider
                    );

                    // Add to blackboard
                    const blackboardEntry = `[Iteration ${iteration} - After ${agentNode.data.label}]: ${orchestratorGuidance}`;
                    blackboard.push(blackboardEntry);

                    send({
                      type: 'blackboard_update',
                      iteration,
                      entry: blackboardEntry,
                      blackboard: [...blackboard],
                    });
                  } catch (orchError) {
                    console.error('Orchestrator error:', orchError);
                    // Continue execution even if orchestrator fails
                  }
                }
              } catch (agentError) {
                console.error(`Agent ${agentNode.data.label} error:`, agentError);
                
                // Check for API payment/rate limit errors
                const errorMsg = agentError instanceof Error ? agentError.message : 'Unknown error';
                if (errorMsg.includes('402') || errorMsg.includes('Payment Required')) {
                  send({
                    type: 'agent_error',
                    iteration,
                    agentId: agentNode.data.type,
                    error: `API credits exhausted. Please add funds to your ${apiProvider.toUpperCase()} account.`,
                  });
                  throw agentError; // Stop iteration on payment errors
                }
                
                // FIX #6: Error recovery with retry logic
                let retrySuccess = false;
                for (let retryAttempt = 1; retryAttempt <= 2; retryAttempt++) {
                  try {
                    send({
                      type: 'agent_retry',
                      iteration,
                      agentId: agentNode.data.type,
                      attempt: retryAttempt,
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryAttempt));
                    
                    const result = await executeAgent(
                      agentNode,
                      {
                        projectId,
                        shareToken,
                        currentNodes: deltaNodes,
                        currentEdges: deltaEdges,
                        attachedContext,
                        iteration,
                        capabilities: agentNode.data.capabilities,
                        blackboard,
                        selectedModel,
                        maxTokens,
                        thinkingEnabled,
                        thinkingBudget,
                        drawEdges,
                      },
                      supabase,
                      apiKey,
                      apiProvider
                    );
                    
                    // Record successful retry
                    const changeLog: ChangeLogEntry = {
                      iteration,
                      agentId: agentNode.data.type,
                      agentLabel: agentNode.data.label,
                      timestamp: new Date().toISOString(),
                      changes: result.changes,
                      reasoning: `[RETRY ${retryAttempt}] ${result.reasoning}`,
                    };
                    changeLogs.push(changeLog);

                    const metric: ChangeMetric = {
                      iteration,
                      agentId: agentNode.data.type,
                      agentLabel: agentNode.data.label,
                      nodesAdded: result.metrics.nodesAdded,
                      nodesEdited: result.metrics.nodesEdited,
                      nodesDeleted: result.metrics.nodesDeleted,
                      edgesAdded: result.metrics.edgesAdded,
                      edgesEdited: result.metrics.edgesEdited,
                      edgesDeleted: result.metrics.edgesDeleted,
                      timestamp: new Date().toISOString(),
                    };
                    metrics.push(metric);

                    send({
                      type: 'agent_complete',
                      iteration,
                      agentId: agentNode.data.type,
                      changeLog,
                      metric,
                    });
                    
                    retrySuccess = true;
                    break;
                  } catch (retryError) {
                    if (retryAttempt === 2) {
                      send({
                        type: 'agent_error',
                        iteration,
                        agentId: agentNode.data.type,
                        error: agentError instanceof Error ? agentError.message : 'Unknown error',
                      });
                    }
                  }
                }
              }
            }

            send({ type: 'iteration_complete', iteration });

            // FIX #5: Removed manual broadcast - rely on RLS-enforced postgres_changes events
          }

          send({
            type: 'complete',
            changeLogs,
            metrics,
          });

          controller.close();
        } catch (error) {
          console.error('Orchestration error:', error);
          send({
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function buildExecutionOrder(nodes: AgentNode[], edges: any[]): AgentNode[] {
  // Build adjacency list
  const graph = new Map<string, string[]>();
  nodes.forEach(node => graph.set(node.id, []));
  edges.forEach(edge => {
    const targets = graph.get(edge.source) || [];
    targets.push(edge.target);
    graph.set(edge.source, targets);
  });

  // Find starting node (node with no incoming edges)
  const incomingCount = new Map<string, number>();
  nodes.forEach(node => incomingCount.set(node.id, 0));
  edges.forEach(edge => {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);
  });

  let startNode = nodes.find(node => (incomingCount.get(node.id) || 0) === 0);
  if (!startNode) startNode = nodes[0]; // Fallback to first node

  // Traverse graph to build execution order
  const order: AgentNode[] = [];
  const visited = new Set<string>();
  
  const traverse = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      order.push(node);
      const neighbors = graph.get(nodeId) || [];
      neighbors.forEach(neighbor => traverse(neighbor));
    }
  };

  traverse(startNode.id);

  // Add any unvisited nodes
  nodes.forEach(node => {
    if (!visited.has(node.id)) {
      order.push(node);
    }
  });

  return order;
}

async function executeAgent(
  agentNode: AgentNode,
  context: any,
  supabase: any,
  apiKey: string,
  apiProvider: 'gemini' | 'anthropic' | 'xai'
) {
  const systemPrompt = context.customPrompt?.system || agentNode.data.systemPrompt;
  const userAddition = context.customPrompt?.user || '';
  const capabilities = context.capabilities || [];
  const selectedModel = context.selectedModel || 'gemini-2.5-flash';
  const maxTokens = context.maxTokens || 32768;
  const thinkingEnabled = context.thinkingEnabled || false;
  const thinkingBudget = context.thinkingBudget || -1;
  const drawEdges = context.drawEdges !== undefined ? context.drawEdges : true;
  
  // Allowed node types in main canvas enum
  const allowedNodeTypes = [
    'PROJECT',
    'PAGE',
    'COMPONENT',
    'API',
    'DATABASE',
    'SERVICE',
    'WEBHOOK',
    'FIREWALL',
    'SECURITY',
    'REQUIREMENT',
    'STANDARD',
    'TECH_STACK',
  ];
  
  // Build context prompt
  let contextPrompt = `Current Canvas Delta (Cumulative Changes):\n`;
  contextPrompt += `This represents the starting selection from ProjectSelector plus all modifications made by previous agents in this iteration.\n`;
  contextPrompt += `- Nodes in delta: ${context.currentNodes.length}\n`;
  contextPrompt += `- Edges in delta: ${context.currentEdges.length}\n\n`;

  // Add Blackboard memory if available
  if (context.blackboard && context.blackboard.length > 0) {
    contextPrompt += `\n=== SHARED BLACKBOARD MEMORY ===\n`;
    contextPrompt += `The following guidance has been provided by the Orchestrator for all agents:\n\n`;
    contextPrompt += context.blackboard.join('\n\n');
    contextPrompt += `\n=== END BLACKBOARD ===\n\n`;
  }

  // FIX: Include ALL ProjectSelector context
  if (context.attachedContext) {
    // Project Metadata
    if (context.attachedContext.projectMetadata) {
      contextPrompt += `=== PROJECT METADATA ===\n`;
      const meta = context.attachedContext.projectMetadata;
      contextPrompt += `Name: ${meta.name}\n`;
      if (meta.description) contextPrompt += `Description: ${meta.description}\n`;
      if (meta.organization) contextPrompt += `Organization: ${meta.organization}\n`;
      if (meta.scope) contextPrompt += `Scope: ${meta.scope}\n`;
      if (meta.budget) contextPrompt += `Budget: ${meta.budget}\n`;
      contextPrompt += '\n';
    }

    // Artifacts
    if (context.attachedContext.artifacts?.length > 0) {
      contextPrompt += `=== ARTIFACTS (${context.attachedContext.artifacts.length}) ===\n`;
      context.attachedContext.artifacts.forEach((artifact: any) => {
        contextPrompt += `- [${artifact.ai_title || 'Untitled'}]\n`;
        if (artifact.ai_summary) contextPrompt += `  Summary: ${artifact.ai_summary}\n`;
        if (artifact.content) contextPrompt += `  Content: ${artifact.content.substring(0, 200)}${artifact.content.length > 200 ? '...' : ''}\n`;
      });
      contextPrompt += '\n';
    }

    // Chat Sessions
    if (context.attachedContext.chatSessions?.length > 0) {
      contextPrompt += `=== CHAT SESSIONS (${context.attachedContext.chatSessions.length}) ===\n`;
      context.attachedContext.chatSessions.forEach((session: any) => {
        contextPrompt += `- [${session.ai_title || session.title || 'Untitled Chat'}]\n`;
        if (session.ai_summary) contextPrompt += `  Summary: ${session.ai_summary}\n`;
      });
      contextPrompt += '\n';
    }

    // Requirements
    if (context.attachedContext.requirements?.length > 0) {
      contextPrompt += `=== REQUIREMENTS (${context.attachedContext.requirements.length}) ===\n`;
      context.attachedContext.requirements.forEach((req: any) => {
        contextPrompt += `- ${req.code || ''} ${req.title}: ${req.content || 'No description'}\n`;
      });
      contextPrompt += '\n';
    }

    // Standards
    if (context.attachedContext.standards?.length > 0) {
      contextPrompt += `=== STANDARDS (${context.attachedContext.standards.length}) ===\n`;
      context.attachedContext.standards.forEach((std: any) => {
        contextPrompt += `- ${std.code || ''} ${std.title}: ${std.description || 'No description'}\n`;
      });
      contextPrompt += '\n';
    }

    // Tech Stacks
    if (context.attachedContext.techStacks?.length > 0) {
      contextPrompt += `=== TECH STACKS (${context.attachedContext.techStacks.length}) ===\n`;
      context.attachedContext.techStacks.forEach((ts: any) => {
        contextPrompt += `- ${ts.name}: ${ts.description || 'No description'}\n`;
      });
      contextPrompt += '\n';
    }

    // Canvas Context (nodes/edges/layers from ProjectSelector)
    if (context.attachedContext.canvasNodes?.length > 0) {
      contextPrompt += `=== SELECTED CANVAS NODES (${context.attachedContext.canvasNodes.length}) ===\n`;
      context.attachedContext.canvasNodes.forEach((node: any) => {
        contextPrompt += `- ${node.data?.label || 'Unnamed'} (${node.type})\n`;
        if (node.data?.description) contextPrompt += `  Description: ${node.data.description}\n`;
      });
      contextPrompt += '\n';
    }

    if (context.attachedContext.canvasEdges?.length > 0) {
      contextPrompt += `=== SELECTED CANVAS EDGES (${context.attachedContext.canvasEdges.length}) ===\n`;
      context.attachedContext.canvasEdges.forEach((edge: any) => {
        contextPrompt += `- ${edge.source_id} -> ${edge.target_id}${edge.label ? ` (${edge.label})` : ''}\n`;
      });
      contextPrompt += '\n';
    }

    if (context.attachedContext.canvasLayers?.length > 0) {
      contextPrompt += `=== SELECTED CANVAS LAYERS (${context.attachedContext.canvasLayers.length}) ===\n`;
      context.attachedContext.canvasLayers.forEach((layer: any) => {
        contextPrompt += `- ${layer.name} (${layer.node_ids?.length || 0} nodes)\n`;
      });
      contextPrompt += '\n';
    }

    if (context.attachedContext.files?.length > 0) {
      contextPrompt += `=== REPOSITORY FILES (${context.attachedContext.files.length}) ===\n`;
      context.attachedContext.files.forEach((file: any) => {
        contextPrompt += `--- File: ${file.path} ---\n`;
        contextPrompt += `${file.content?.substring(0, 500)}${file.content?.length > 500 ? '...[truncated]' : ''}\n\n`;
      });
      contextPrompt += '\n';
    }
  }

  // Explain allowed node types and ID usage
  contextPrompt += `=== NODE TYPE & ID RULES ===\n`;
  contextPrompt += `- Node types must be one of: ${allowedNodeTypes.join(', ')}\n`;
  contextPrompt += `- For edgesToAdd, source and target MUST be node IDs from the list below (not labels).\n`;
  contextPrompt += `- If you create new nodes, you may optionally include an "id" field using a UUID string; otherwise only connect edges between existing node IDs.\n\n`;

  contextPrompt += `Current Nodes in Delta:\n`;
  contextPrompt += `This list represents what the user originally selected plus all nodes added/edited by previous agents in this iteration.\n`;
  context.currentNodes.forEach((node: any) => {
    contextPrompt += `- ${node.id}: ${node.data?.label || 'Unnamed'} (Type: ${node.type || node.data?.type})\n`;
  });
  contextPrompt += `\n`;

  contextPrompt += `Current Edges in Delta:\n`;
  contextPrompt += `This list represents what the user originally selected plus all edges added/edited by previous agents in this iteration.\n`;
  if (context.currentEdges && context.currentEdges.length > 0) {
    context.currentEdges.forEach((edge: any) => {
      contextPrompt += `- ${edge.id}: ${edge.source_id || edge.source} -> ${edge.target_id || edge.target}${edge.label ? ` (Label: ${edge.label})` : ''}\n`;
    });
  } else {
    contextPrompt += `(No edges in delta yet)\n`;
  }
  contextPrompt += `\nIMPORTANT: The nodes and edges listed above are the WORKING DELTA that accumulates all changes across agents in this iteration:\n`;
  contextPrompt += `- Original items from user's ProjectSelector selection (if any)\n`;
  contextPrompt += `- All nodes/edges added by previous agents in this iteration\n`;
  contextPrompt += `- All modifications made by previous agents\n`;
  contextPrompt += `Do NOT recreate existing items. Only add NEW elements that don't already exist in the delta.\n`;

  contextPrompt += `\nYour Task: Analyze the above and determine what changes are needed. Return a JSON object with:\n`;
  contextPrompt += `{\n`;
  contextPrompt += `  "reasoning": "Your analysis and reasoning",\n`;
  contextPrompt += `  "nodesToAdd": [{ "type": "COMPONENT", "label": "Name", "description": "..." }],\n`;
  contextPrompt += `  "nodesToEdit": [{ "id": "node-uuid", "updates": { "label": "New name" } }],\n`;
  contextPrompt += `  "nodesToDelete": ["node-uuid-1", "node-uuid-2"],\n`;
  contextPrompt += `  "edgesToAdd": [{ "source": "node-uuid-1", "target": "node-uuid-2", "label": "Connection" }],\n`;
  contextPrompt += `  "edgesToDelete": ["edge-uuid-1"]\n`;
  contextPrompt += `}\n`;
  
  if (userAddition) {
    contextPrompt += `\n=== ADDITIONAL INSTRUCTIONS ===\n${userAddition}\n=== END ADDITIONAL INSTRUCTIONS ===\n`;
  }

  // Call AI based on provider
  let response: Response;
  
  if (apiProvider === 'gemini') {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${contextPrompt}` }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: maxTokens,
            ...(selectedModel !== 'gemini-2.5-pro' && {
              thinkingConfig: { thinkingBudget: thinkingEnabled ? thinkingBudget : 0 }
            })
          }
        })
      }
    );
  } else if (apiProvider === 'anthropic') {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: contextPrompt }]
      })
    });
  } else if (apiProvider === 'xai') {
    // xAI/Grok doesn't respect system prompts, must prepend to user message
    const combinedPrompt = `${systemPrompt}\n\n${contextPrompt}`;
    response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [{ role: 'user', content: combinedPrompt }],
        response_format: { type: 'json_object' },
      })
    });
  } else {
    throw new Error(`Unsupported API provider: ${apiProvider}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API Error: ${response.status} ${errorText}`);
  }

  const aiData = await response.json();
  
  // Robust JSON extraction - handles different API response formats
  let aiResponse;
  try {
    let content: string;
    
    if (apiProvider === 'gemini') {
      content = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (apiProvider === 'anthropic') {
      content = aiData.content?.[0]?.text || '';
    } else {
      content = aiData.choices?.[0]?.message?.content || '';
    }
    console.log('Raw AI response:', content);
    
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      aiResponse = JSON.parse(jsonMatch[1]);
      console.log('Extracted JSON from markdown:', aiResponse);
    } else {
      // Try direct JSON parse
      aiResponse = JSON.parse(content);
      console.log('Parsed JSON directly:', aiResponse);
    }
  } catch (parseError) {
    console.error('Failed to parse AI response:', parseError);
    console.error('Raw content:', aiData.choices[0].message.content);
    throw new Error(`Failed to parse AI response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
  }

  // Apply changes via RPC
  let nodesAdded = 0, nodesEdited = 0, nodesDeleted = 0;
  let edgesAdded = 0, edgesEdited = 0, edgesDeleted = 0;

  // Track any newly created node IDs so edges can safely target them if needed
  const newNodeIds: string[] = [];

  // FIX #3: Validate capabilities before applying changes
  const canAddNodes = capabilities.length === 0 || capabilities.includes('add_nodes');
  const canEditNodes = capabilities.length === 0 || capabilities.includes('edit_nodes');
  const canDeleteNodes = capabilities.length === 0 || capabilities.includes('delete_nodes');
  const canAddEdges = capabilities.length === 0 || capabilities.includes('add_edges');
  const canDeleteEdges = capabilities.length === 0 || capabilities.includes('delete_edges');

  // Add nodes
  if (aiResponse.nodesToAdd && canAddNodes) {
    console.log(`Adding ${aiResponse.nodesToAdd.length} nodes...`);
    for (const nodeData of aiResponse.nodesToAdd) {
      try {
        const newNodeId = crypto.randomUUID();
        console.log(`Creating node ${newNodeId}:`, nodeData);

        // Map arbitrary LLM node types into allowed enum values
        const rawType = typeof nodeData.type === 'string' ? nodeData.type.toUpperCase() : '';
        let nodeType: string = 'COMPONENT';
        if (allowedNodeTypes.includes(rawType)) {
          nodeType = rawType;
        } else if (rawType.includes('DATA')) {
          nodeType = 'DATABASE';
        } else if (rawType.includes('PROTOCOL') || rawType.includes('API')) {
          nodeType = 'API';
        }

        const { data, error } = await supabase.rpc('upsert_canvas_node_with_token', {
          p_id: newNodeId,
          p_project_id: context.projectId,
          p_token: context.shareToken,
          p_type: nodeType,
          p_position: { x: Math.random() * 500, y: Math.random() * 500 },
          p_data: { label: nodeData.label, description: nodeData.description, type: nodeType },
        });
        
        if (error) {
          console.error('Error adding node:', error);
          throw error;
        }
        console.log('Node added successfully:', data);
        newNodeIds.push(newNodeId);
        nodesAdded++;
      } catch (err) {
        console.error('Error adding node:', err);
      }
    }
  } else if (aiResponse.nodesToAdd && !canAddNodes) {
    console.warn(`Agent lacks 'add_nodes' capability, skipping ${aiResponse.nodesToAdd.length} node additions`);
  }

  // Edit nodes
  if (aiResponse.nodesToEdit && canEditNodes) {
    console.log(`Editing ${aiResponse.nodesToEdit.length} nodes...`);
    for (const edit of aiResponse.nodesToEdit) {
      try {
        const existingNode = context.currentNodes.find((n: any) => n.id === edit.id);
        if (existingNode) {
          console.log(`Updating node ${edit.id}:`, edit.updates);
          
          const { data, error } = await supabase.rpc('upsert_canvas_node_with_token', {
            p_id: edit.id,
            p_project_id: context.projectId,
            p_token: context.shareToken,
            p_type: existingNode.type,
            p_position: existingNode.position,
            p_data: { ...existingNode.data, ...edit.updates, type: existingNode.type },
          });
          
          if (error) {
            console.error('Error editing node:', error);
            throw error;
          }
          console.log('Node edited successfully:', data);
          nodesEdited++;
        } else {
          console.warn(`Node ${edit.id} not found in current nodes`);
        }
      } catch (err) {
        console.error('Error editing node:', err);
      }
    }
  } else if (aiResponse.nodesToEdit && !canEditNodes) {
    console.warn(`Agent lacks 'edit_nodes' capability, skipping ${aiResponse.nodesToEdit.length} node edits`);
  }

  // Delete nodes
  if (aiResponse.nodesToDelete && canDeleteNodes) {
    console.log(`Deleting ${aiResponse.nodesToDelete.length} nodes...`);
    for (const nodeId of aiResponse.nodesToDelete) {
      try {
        console.log(`Deleting node ${nodeId}...`);
        
        const { error } = await supabase.rpc('delete_canvas_node_with_token', {
          p_id: nodeId,
          p_token: context.shareToken,
        });
        
        if (error) {
          console.error('Error deleting node:', error);
          throw error;
        }
        console.log('Node deleted successfully');
        nodesDeleted++;
      } catch (err) {
        console.error('Error deleting node:', err);
      }
    }
  } else if (aiResponse.nodesToDelete && !canDeleteNodes) {
    console.warn(`Agent lacks 'delete_nodes' capability, skipping ${aiResponse.nodesToDelete.length} node deletions`);
  }

  // Add edges (only if drawEdges is enabled)
  if (drawEdges && aiResponse.edgesToAdd && canAddEdges) {
    console.log(`Adding ${aiResponse.edgesToAdd.length} edges...`);

    // Only allow edges between known node IDs to avoid invalid UUID errors
    const validNodeIds = new Set<string>([
      ...context.currentNodes.map((n: any) => n.id),
      ...newNodeIds,
    ]);

    for (const edgeData of aiResponse.edgesToAdd) {
      try {
        if (!validNodeIds.has(edgeData.source) || !validNodeIds.has(edgeData.target)) {
          console.warn('Skipping edge with unknown source/target IDs:', edgeData);
          continue;
        }

        const newEdgeId = crypto.randomUUID();
        console.log(`Creating edge ${newEdgeId}:`, edgeData);
        
        const { data, error } = await supabase.rpc('upsert_canvas_edge_with_token', {
          p_id: newEdgeId,
          p_project_id: context.projectId,
          p_token: context.shareToken,
          p_source_id: edgeData.source,
          p_target_id: edgeData.target,
          p_label: edgeData.label || '',
          p_edge_type: 'default',
          p_style: {
            stroke: 'hsl(var(--primary))',
            strokeWidth: 2,
          },
        });
        
        if (error) {
          console.error('Error adding edge:', error);
          throw error;
        }
        console.log('Edge added successfully:', data);
        edgesAdded++;
      } catch (err) {
        console.error('Error adding edge:', err);
      }
    }
  } else if (aiResponse.edgesToAdd && !canAddEdges) {
    console.warn(`Agent lacks 'add_edges' capability, skipping ${aiResponse.edgesToAdd.length} edge additions`);
  } else if (!drawEdges && aiResponse.edgesToAdd) {
    console.warn(`Draw Edges disabled, skipping ${aiResponse.edgesToAdd.length} edge additions`);
  }

  // Delete edges (only if drawEdges is enabled)
  if (drawEdges && aiResponse.edgesToDelete && canDeleteEdges) {
    console.log(`Deleting ${aiResponse.edgesToDelete.length} edges...`);
    for (const edgeId of aiResponse.edgesToDelete) {
      try {
        console.log(`Deleting edge ${edgeId}...`);
        
        const { error } = await supabase.rpc('delete_canvas_edge_with_token', {
          p_id: edgeId,
          p_token: context.shareToken,
        });
        
        if (error) {
          console.error('Error deleting edge:', error);
          throw error;
        }
        console.log('Edge deleted successfully');
        edgesDeleted++;
      } catch (err) {
        console.error('Error deleting edge:', err);
      }
    }
  } else if (aiResponse.edgesToDelete && !canDeleteEdges) {
    console.warn(`Agent lacks 'delete_edges' capability, skipping ${aiResponse.edgesToDelete.length} edge deletions`);
  } else if (!drawEdges && aiResponse.edgesToDelete) {
    console.warn(`Draw Edges disabled, skipping ${aiResponse.edgesToDelete.length} edge deletions`);
  }

  return {
    reasoning: aiResponse.reasoning || 'No reasoning provided',
    changes: JSON.stringify({
      nodesToAdd: aiResponse.nodesToAdd || [],
      nodesToEdit: aiResponse.nodesToEdit || [],
      nodesToDelete: aiResponse.nodesToDelete || [],
      edgesToAdd: drawEdges ? (aiResponse.edgesToAdd || []) : [],
      edgesToDelete: drawEdges ? (aiResponse.edgesToDelete || []) : [],
    }, null, 2),
    metrics: {
      nodesAdded,
      nodesEdited,
      nodesDeleted,
      edgesAdded,
      edgesEdited,
      edgesDeleted,
    },
    // Return actual arrays for delta tracking - filter edges if drawEdges is false
    nodesToAdd: aiResponse.nodesToAdd || [],
    nodesToEdit: aiResponse.nodesToEdit || [],
    nodesToDelete: aiResponse.nodesToDelete || [],
    edgesToAdd: drawEdges ? (aiResponse.edgesToAdd || []) : [],
    edgesToEdit: drawEdges ? (aiResponse.edgesToEdit || []) : [],
    edgesToDelete: drawEdges ? (aiResponse.edgesToDelete || []) : [],
    newNodeIds,  // IDs of nodes created in this execution
  };
}

async function executeOrchestrator(
  context: {
    agentLabel: string;
    changes: string;
    reasoning: string;
    currentNodes: any[];
    currentEdges: any[];
    attachedContext: any;
    blackboard: string[];
    iteration: number;
    selectedModel?: string;
    maxTokens?: number;
    thinkingEnabled?: boolean;
    thinkingBudget?: number;
  },
  apiKey: string,
  apiProvider: 'gemini' | 'anthropic' | 'xai'
): Promise<string> {
  const selectedModel = context.selectedModel || 'gemini-2.5-flash';
  const maxTokens = context.maxTokens || 8192;
  const thinkingEnabled = context.thinkingEnabled || false;
  const thinkingBudget = context.thinkingBudget || -1;
  
  const orchestratorPrompt = `You are the Orchestrator supervising all agents working on this architecture.

**Agent That Just Completed**: ${context.agentLabel}
**Iteration**: ${context.iteration}

**Their Changes**:
${context.changes}

**Their Reasoning**:
${context.reasoning}

**Current Architecture State**:
- Total Nodes: ${context.currentNodes.length}
- Total Edges: ${context.currentEdges.length}

**Shared Blackboard Memory** (Previous guidance from earlier in this iteration):
${context.blackboard.length > 0 ? context.blackboard.join('\n') : 'No previous guidance yet this iteration.'}

${context.attachedContext?.requirements?.length > 0 ? `\n**Requirements to Fulfill**: ${context.attachedContext.requirements.length} requirements` : ''}
${context.attachedContext?.standards?.length > 0 ? `\n**Standards to Meet**: ${context.attachedContext.standards.length} standards` : ''}

**Your Task**: Provide brief guidance (2-3 sentences) for all agents to consider. Focus on:
- Architectural coherence and consistency
- Missing critical elements
- Potential conflicts or issues
- Next priorities

Keep it concise and actionable. This will be added to the Blackboard that all subsequent agents can reference.`;

  let response: Response;
  
  if (apiProvider === 'gemini') {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: orchestratorPrompt }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: maxTokens,
            ...(selectedModel !== 'gemini-2.5-pro' && {
              thinkingConfig: { thinkingBudget: thinkingEnabled ? thinkingBudget : 0 }
            })
          }
        })
      }
    );
  } else if (apiProvider === 'anthropic') {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: orchestratorPrompt }]
      })
    });
  } else {
    response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [{ role: 'user', content: orchestratorPrompt }]
      })
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Orchestrator AI API Error: ${response.status} ${errorText}`);
  }

  const aiData = await response.json();
  
  let guidance: string;
  if (apiProvider === 'gemini') {
    guidance = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } else if (apiProvider === 'anthropic') {
    guidance = aiData.content?.[0]?.text || '';
  } else {
    guidance = aiData.choices?.[0]?.message?.content || '';
  }
  
  return guidance.trim();
}
