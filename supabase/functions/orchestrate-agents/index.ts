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
    } = await req.json();

    if (!projectId || !shareToken) {
      throw new Error('projectId and shareToken are required');
    }

    if (!agentFlow?.nodes || agentFlow.nodes.length === 0) {
      throw new Error('Agent flow must have at least one agent');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
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
          const executionOrder = buildExecutionOrder(agentFlow.nodes, agentFlow.edges);
          
          const changeLogs: ChangeLogEntry[] = [];
          const metrics: ChangeMetric[] = [];

          // Run iterations
          for (let iteration = 1; iteration <= iterations; iteration++) {
            send({ 
              type: 'iteration_start', 
              iteration,
              totalIterations: iterations 
            });

            // Execute each agent in order - fetch fresh state before each agent
            for (const agentNode of executionOrder) {
              // CRITICAL FIX #1: Fetch fresh canvas state before each agent execution
              const { data: currentNodes } = await supabase.rpc('get_canvas_nodes_with_token', {
                p_project_id: projectId,
                p_token: shareToken,
              });

              const { data: currentEdges } = await supabase.rpc('get_canvas_edges_with_token', {
                p_project_id: projectId,
                p_token: shareToken,
              });

              send({
                type: 'agent_start',
                iteration,
                agentId: agentNode.data.type,
                agentLabel: agentNode.data.label,
              });

              try {
                // Validate agent is connected (FIX #4)
                const isConnected = agentFlow.edges.some(
                  (e: any) => e.source === agentNode.id || e.target === agentNode.id
                );
                if (!isConnected && agentFlow.nodes.length > 1) {
                  throw new Error(`Agent ${agentNode.data.label} is not connected to the flow`);
                }

                const result = await executeAgent(
                  agentNode,
                  {
                    projectId,
                    shareToken,
                    currentNodes: currentNodes || [],
                    currentEdges: currentEdges || [],
                    attachedContext,
                    iteration,
                    capabilities: agentNode.data.capabilities, // FIX #3: Pass capabilities
                  },
                  supabase,
                  LOVABLE_API_KEY
                );

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
                });
              } catch (agentError) {
                console.error(`Agent ${agentNode.data.label} error:`, agentError);
                
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
                        currentNodes: currentNodes || [],
                        currentEdges: currentEdges || [],
                        attachedContext,
                        iteration,
                        capabilities: agentNode.data.capabilities,
                      },
                      supabase,
                      LOVABLE_API_KEY
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
  apiKey: string
) {
  const systemPrompt = agentNode.data.systemPrompt;
  const capabilities = context.capabilities || [];
  
  // Build context prompt
  let contextPrompt = `Current Canvas State:\n`;
  contextPrompt += `- Nodes: ${context.currentNodes.length}\n`;
  contextPrompt += `- Edges: ${context.currentEdges.length}\n\n`;

  if (context.attachedContext) {
    if (context.attachedContext.requirements?.length > 0) {
      contextPrompt += `Requirements (${context.attachedContext.requirements.length}):\n`;
      context.attachedContext.requirements.forEach((req: any) => {
        contextPrompt += `- ${req.title}: ${req.content || 'No description'}\n`;
      });
      contextPrompt += '\n';
    }

    if (context.attachedContext.standards?.length > 0) {
      contextPrompt += `Standards (${context.attachedContext.standards.length}):\n`;
      context.attachedContext.standards.forEach((std: any) => {
        contextPrompt += `- ${std.title}: ${std.description || 'No description'}\n`;
      });
      contextPrompt += '\n';
    }

    if (context.attachedContext.techStacks?.length > 0) {
      contextPrompt += `Tech Stacks (${context.attachedContext.techStacks.length}):\n`;
      context.attachedContext.techStacks.forEach((ts: any) => {
        contextPrompt += `- ${ts.name}: ${ts.description || 'No description'}\n`;
      });
      contextPrompt += '\n';
    }
  }

  contextPrompt += `Current Nodes:\n`;
  context.currentNodes.forEach((node: any) => {
    contextPrompt += `- ${node.id}: ${node.data?.label || 'Unnamed'} (Type: ${node.type})\n`;
  });
  contextPrompt += `\n`;

  contextPrompt += `Current Edges:\n`;
  context.currentEdges.forEach((edge: any) => {
    contextPrompt += `- ${edge.source} -> ${edge.target}\n`;
  });

  contextPrompt += `\nYour Task: Analyze the above and determine what changes are needed. Return a JSON object with:\n`;
  contextPrompt += `{\n`;
  contextPrompt += `  "reasoning": "Your analysis and reasoning",\n`;
  contextPrompt += `  "nodesToAdd": [{ "type": "COMPONENT", "label": "Name", "description": "..." }],\n`;
  contextPrompt += `  "nodesToEdit": [{ "id": "node-uuid", "updates": { "label": "New name" } }],\n`;
  contextPrompt += `  "nodesToDelete": ["node-uuid-1", "node-uuid-2"],\n`;
  contextPrompt += `  "edgesToAdd": [{ "source": "node-uuid-1", "target": "node-uuid-2", "label": "Connection" }],\n`;
  contextPrompt += `  "edgesToDelete": ["edge-uuid-1"]\n`;
  contextPrompt += `}\n`;

  // Call AI
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextPrompt },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.status}`);
  }

  const aiData = await response.json();
  const aiResponse = JSON.parse(aiData.choices[0].message.content);

  // Apply changes via RPC
  let nodesAdded = 0, nodesEdited = 0, nodesDeleted = 0;
  let edgesAdded = 0, edgesEdited = 0, edgesDeleted = 0;

  // FIX #3: Validate capabilities before applying changes
  const canAddNodes = capabilities.length === 0 || capabilities.includes('add_nodes');
  const canEditNodes = capabilities.length === 0 || capabilities.includes('edit_nodes');
  const canDeleteNodes = capabilities.length === 0 || capabilities.includes('delete_nodes');
  const canAddEdges = capabilities.length === 0 || capabilities.includes('add_edges');
  const canDeleteEdges = capabilities.length === 0 || capabilities.includes('delete_edges');

  // Add nodes
  if (aiResponse.nodesToAdd && canAddNodes) {
    for (const nodeData of aiResponse.nodesToAdd) {
      try {
        await supabase.rpc('upsert_canvas_node_with_token', {
          p_id: crypto.randomUUID(),
          p_project_id: context.projectId,
          p_token: context.shareToken,
          p_type: nodeData.type || 'COMPONENT',
          p_position: { x: Math.random() * 500, y: Math.random() * 500 },
          p_data: { label: nodeData.label, description: nodeData.description },
        });
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
    for (const edit of aiResponse.nodesToEdit) {
      try {
        const existingNode = context.currentNodes.find((n: any) => n.id === edit.id);
        if (existingNode) {
          await supabase.rpc('upsert_canvas_node_with_token', {
            p_id: edit.id,
            p_project_id: context.projectId,
            p_token: context.shareToken,
            p_type: existingNode.type,
            p_position: existingNode.position,
            p_data: { ...existingNode.data, ...edit.updates },
          });
          nodesEdited++;
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
    for (const nodeId of aiResponse.nodesToDelete) {
      try {
        await supabase.rpc('delete_canvas_node_with_token', {
          p_id: nodeId,
          p_token: context.shareToken,
        });
        nodesDeleted++;
      } catch (err) {
        console.error('Error deleting node:', err);
      }
    }
  } else if (aiResponse.nodesToDelete && !canDeleteNodes) {
    console.warn(`Agent lacks 'delete_nodes' capability, skipping ${aiResponse.nodesToDelete.length} node deletions`);
  }

  // Add edges
  if (aiResponse.edgesToAdd && canAddEdges) {
    for (const edgeData of aiResponse.edgesToAdd) {
      try {
        await supabase.rpc('upsert_canvas_edge_with_token', {
          p_id: crypto.randomUUID(),
          p_project_id: context.projectId,
          p_token: context.shareToken,
          p_source_id: edgeData.source,
          p_target_id: edgeData.target,
          p_label: edgeData.label || '',
          p_edge_type: 'smoothstep',
          p_style: {},
        });
        edgesAdded++;
      } catch (err) {
        console.error('Error adding edge:', err);
      }
    }
  } else if (aiResponse.edgesToAdd && !canAddEdges) {
    console.warn(`Agent lacks 'add_edges' capability, skipping ${aiResponse.edgesToAdd.length} edge additions`);
  }

  // Delete edges
  if (aiResponse.edgesToDelete && canDeleteEdges) {
    for (const edgeId of aiResponse.edgesToDelete) {
      try {
        await supabase.rpc('delete_canvas_edge_with_token', {
          p_id: edgeId,
          p_token: context.shareToken,
        });
        edgesDeleted++;
      } catch (err) {
        console.error('Error deleting edge:', err);
      }
    }
  } else if (aiResponse.edgesToDelete && !canDeleteEdges) {
    console.warn(`Agent lacks 'delete_edges' capability, skipping ${aiResponse.edgesToDelete.length} edge deletions`);
  }

  return {
    reasoning: aiResponse.reasoning || 'No reasoning provided',
    changes: JSON.stringify({
      nodesToAdd: aiResponse.nodesToAdd || [],
      nodesToEdit: aiResponse.nodesToEdit || [],
      nodesToDelete: aiResponse.nodesToDelete || [],
      edgesToAdd: aiResponse.edgesToAdd || [],
      edgesToDelete: aiResponse.edgesToDelete || [],
    }, null, 2),
    metrics: {
      nodesAdded,
      nodesEdited,
      nodesDeleted,
      edgesAdded,
      edgesEdited,
      edgesDeleted,
    },
  };
}
