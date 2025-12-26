import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AuditRequest {
  sessionId: string;
  projectId: string;
  shareToken: string;
}

interface AgentPersona {
  role: string;
  name: string;
  systemPrompt: string;
  assignedNodeIds?: string[];
}

interface ProblemShape {
  dataset1: { type: string; count: number; elements: Array<{ id: string; label: string; index: number }> };
  dataset2: { type: string; count: number; summary: string };
  steps: Array<{ step: number; label: string }>;
}

interface GraphNode {
  id?: string;
  label: string;
  description: string;
  nodeType: string;
  sourceDataset: string;
  sourceElementIds: string[];
  color?: string;
}

interface GraphEdge {
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: string;
  label?: string;
  weight?: number;
}

// ==================== PHASE PROMPTS ====================

function getConferencePrompt(problemShape: ProblemShape, persona: AgentPersona): string {
  return `You are ${persona.name}, an expert ${persona.role}.

## Phase: CONFERENCE
This is an initial conference where all agents discuss the audit scope and identify key concepts.

## Your Perspective
${persona.systemPrompt}

## Dataset 1: ${problemShape.dataset1.type} (${problemShape.dataset1.count} elements)
${problemShape.dataset1.elements.map(e => `- ${e.label} (ID: ${e.id})`).join("\n")}

## Dataset 2: ${problemShape.dataset2.type}
${problemShape.dataset2.summary}

## Your Task
1. Analyze both datasets from your perspective
2. Identify KEY CONCEPTS that should be nodes in our knowledge graph
3. These concepts should represent themes, categories, or groupings that emerge from the data
4. Focus on concepts relevant to your expertise as a ${persona.role}

Respond with concepts you believe should be graph nodes.`;
}

function getGraphBuildingPrompt(problemShape: ProblemShape, persona: AgentPersona, existingNodes: any[], existingEdges: any[], iteration: number): string {
  // Use shortened 8-char IDs for readability
  const shortId = (id: string) => id.slice(0, 8);
  
  // Build a clear list of VALID node IDs that can be used for edges
  const validNodeIds = existingNodes.map(n => shortId(n.id));
  const nodesList = existingNodes.map(n => `  ${shortId(n.id)} = "${n.label}"`).join("\n") || "(no nodes yet)";
  
  // Build ID lookup for edge display
  const idToLabel = new Map(existingNodes.map((n: any) => [n.id, n.label]));
  const edgesList = existingEdges.map(e => {
    const srcLabel = idToLabel.get(e.source_node_id) || shortId(e.source_node_id);
    const tgtLabel = idToLabel.get(e.target_node_id) || shortId(e.target_node_id);
    return `  ${shortId(e.source_node_id)} -> ${shortId(e.target_node_id)} (${e.edge_type})`;
  }).join("\n") || "(no edges yet)";

  return `You are ${persona.name}, an expert ${persona.role}.

## Phase: KNOWLEDGE GRAPH BUILDING (Iteration ${iteration})

## Your Perspective
${persona.systemPrompt}

## Dataset 1: ${problemShape.dataset1.type}
${problemShape.dataset1.elements.map(e => `- ${e.label}`).join("\n")}

## Dataset 2: ${problemShape.dataset2.type}
${problemShape.dataset2.summary}

## EXISTING NODES (use these EXACT 8-char IDs for edges):
${nodesList}

## EXISTING EDGES:
${edgesList}

## VALID NODE IDs FOR EDGES:
${validNodeIds.length > 0 ? validNodeIds.join(", ") : "(none yet)"}

## Your Task
1. Propose NEW nodes that should be added (you create the label/description)
2. Propose NEW edges between EXISTING nodes listed above
3. Vote on whether the graph is COMPLETE

## CRITICAL RULES FOR EDGES:
- sourceNodeId and targetNodeId MUST be one of the VALID NODE IDs listed above
- Do NOT invent new IDs - you can ONLY connect nodes that already exist
- If no nodes exist yet, you cannot propose edges
- Copy the 8-character ID exactly as shown (e.g., "${validNodeIds[0] || 'a1b2c3d4'}")`;
}

function getAssignmentPrompt(persona: AgentPersona, graphNodes: any[]): string {
  const nodesList = graphNodes.map(n => `- [${n.id}] ${n.label}: ${n.description || 'No description'}`).join("\n");

  return `You are ${persona.name}, an expert ${persona.role}.

## Phase: ELEMENT ASSIGNMENT
The knowledge graph is complete. Now each agent will select nodes they are best suited to analyze.

## Your Expertise
${persona.systemPrompt}

## Available Graph Nodes:
${nodesList}

## Your Task
Select the nodes you believe you are best qualified to analyze based on your expertise as a ${persona.role}.
Choose nodes where your specialized perspective will add the most value.
You may select multiple nodes. Other agents will also make selections, so focus on your strengths.`;
}

function getAnalysisPrompt(persona: AgentPersona, problemShape: ProblemShape, assignedNodes: any[], recentBlackboard: string): string {
  const assignedList = assignedNodes.map(n => 
    `- [${n.id}] ${n.label}: ${n.description || 'No description'}
     Source Elements: ${(n.source_element_ids || []).join(", ")}`
  ).join("\n\n");

  return `You are ${persona.name}, an expert ${persona.role}.

## Phase: PARALLEL ANALYSIS
You are now analyzing your assigned knowledge graph nodes in depth.

## Your Expertise
${persona.systemPrompt}

## Your Assigned Nodes:
${assignedList}

## Dataset Context
- Dataset 1 (${problemShape.dataset1.type}): ${problemShape.dataset1.count} elements
- Dataset 2 (${problemShape.dataset2.type}): ${problemShape.dataset2.summary}

## Analysis Steps
${problemShape.steps.map(s => `${s.step}. ${s.label}`).join("\n")}

## Recent Blackboard Entries
${recentBlackboard || "(empty)"}

## Your Task
For each assigned node, analyze the source elements against Dataset 2:
1. Apply each analysis step
2. Record polarity (-1 = gap/violation, 0 = neutral, +1 = compliant)
3. Provide evidence for findings
4. Post observations to the blackboard`;
}

// ==================== LLM RESPONSE SCHEMAS ====================

function getGrokConferenceSchema() {
  return {
    type: "json_schema",
    json_schema: {
      name: "conference_response",
      strict: true,
      schema: {
        type: "object",
        properties: {
          reasoning: { type: "string" },
          proposedNodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                description: { type: "string" },
                nodeType: { type: "string", enum: ["concept", "theme", "category", "risk", "requirement_group"] },
                sourceDataset: { type: "string", enum: ["dataset1", "dataset2", "both"] },
                sourceElementIds: { type: "array", items: { type: "string" } },
              },
              required: ["label", "description", "nodeType", "sourceDataset", "sourceElementIds"],
            },
          },
          blackboardEntry: {
            type: "object",
            properties: {
              content: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["content"],
          },
        },
        required: ["reasoning", "proposedNodes", "blackboardEntry"],
      },
    },
  };
}

function getGrokGraphBuildingSchema() {
  return {
    type: "json_schema",
    json_schema: {
      name: "graph_building_response",
      strict: true,
      schema: {
        type: "object",
        properties: {
          reasoning: { type: "string" },
          proposedNodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                description: { type: "string" },
                nodeType: { type: "string" },
                sourceDataset: { type: "string" },
                sourceElementIds: { type: "array", items: { type: "string" } },
              },
              required: ["label", "description", "nodeType", "sourceDataset", "sourceElementIds"],
            },
          },
          proposedEdges: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sourceNodeId: { type: "string", description: "8-character node ID prefix from the Nodes list" },
                targetNodeId: { type: "string", description: "8-character node ID prefix from the Nodes list" },
                edgeType: { type: "string", enum: ["relates_to", "depends_on", "implements", "conflicts_with", "supports"] },
                label: { type: "string" },
              },
              required: ["sourceNodeId", "targetNodeId", "edgeType"],
            },
          },
          graphCompleteVote: { type: "boolean" },
          blackboardEntry: {
            type: "object",
            properties: {
              content: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["content"],
          },
        },
        required: ["reasoning", "proposedNodes", "proposedEdges", "graphCompleteVote", "blackboardEntry"],
      },
    },
  };
}

function getGrokAssignmentSchema() {
  return {
    type: "json_schema",
    json_schema: {
      name: "assignment_response",
      strict: true,
      schema: {
        type: "object",
        properties: {
          reasoning: { type: "string" },
          selectedNodeIds: { type: "array", items: { type: "string" } },
          blackboardEntry: {
            type: "object",
            properties: {
              content: { type: "string" },
            },
            required: ["content"],
          },
        },
        required: ["reasoning", "selectedNodeIds", "blackboardEntry"],
      },
    },
  };
}

function getGrokAnalysisSchema() {
  return {
    type: "json_schema",
    json_schema: {
      name: "analysis_response",
      strict: true,
      schema: {
        type: "object",
        properties: {
          reasoning: { type: "string" },
          observations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                elementId: { type: "string" },
                elementLabel: { type: "string" },
                step: { type: "integer" },
                polarity: { type: "number" },
                criticality: { type: "string", enum: ["critical", "major", "minor", "info"] },
                evidence: { type: "string" },
              },
              required: ["elementId", "step", "polarity", "evidence"],
            },
          },
          blackboardEntry: {
            type: "object",
            properties: {
              entryType: { type: "string", enum: ["observation", "finding", "question", "thesis"] },
              content: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["entryType", "content"],
          },
          analysisComplete: { type: "boolean" },
          consensusVote: { type: ["boolean", "null"] },
        },
        required: ["reasoning", "observations", "blackboardEntry", "analysisComplete"],
      },
    },
  };
}

// Claude tool equivalents
function getClaudeConferenceTool() {
  return {
    name: "submit_conference_findings",
    description: "Submit your conference findings with proposed knowledge graph nodes.",
    input_schema: {
      type: "object",
      properties: {
        reasoning: { type: "string" },
        proposedNodes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              description: { type: "string" },
              nodeType: { type: "string" },
              sourceDataset: { type: "string" },
              sourceElementIds: { type: "array", items: { type: "string" } },
            },
            required: ["label", "description", "nodeType", "sourceDataset", "sourceElementIds"],
          },
        },
        blackboardEntry: {
          type: "object",
          properties: { content: { type: "string" }, confidence: { type: "number" } },
          required: ["content"],
        },
      },
      required: ["reasoning", "proposedNodes", "blackboardEntry"],
    },
  };
}

function getClaudeGraphBuildingTool() {
  return {
    name: "submit_graph_updates",
    description: "Submit proposed graph nodes, edges (using 8-char node ID prefixes), and vote on graph completeness.",
    input_schema: {
      type: "object",
      properties: {
        reasoning: { type: "string" },
        proposedNodes: { type: "array", items: { type: "object" } },
        proposedEdges: { 
          type: "array", 
          items: { 
            type: "object",
            properties: {
              sourceNodeId: { type: "string", description: "8-character node ID prefix" },
              targetNodeId: { type: "string", description: "8-character node ID prefix" },
              edgeType: { type: "string" },
              label: { type: "string" }
            },
            required: ["sourceNodeId", "targetNodeId", "edgeType"]
          } 
        },
        graphCompleteVote: { type: "boolean" },
        blackboardEntry: { type: "object", properties: { content: { type: "string" } }, required: ["content"] },
      },
      required: ["reasoning", "proposedNodes", "proposedEdges", "graphCompleteVote", "blackboardEntry"],
    },
  };
}

function getClaudeAssignmentTool() {
  return {
    name: "submit_node_selection",
    description: "Submit which knowledge graph nodes you want to analyze.",
    input_schema: {
      type: "object",
      properties: {
        reasoning: { type: "string" },
        selectedNodeIds: { type: "array", items: { type: "string" } },
        blackboardEntry: { type: "object", properties: { content: { type: "string" } }, required: ["content"] },
      },
      required: ["reasoning", "selectedNodeIds", "blackboardEntry"],
    },
  };
}

function getClaudeAnalysisTool() {
  return {
    name: "submit_audit_findings",
    description: "Submit your audit analysis findings.",
    input_schema: {
      type: "object",
      properties: {
        reasoning: { type: "string" },
        observations: { type: "array", items: { type: "object" } },
        blackboardEntry: { type: "object" },
        analysisComplete: { type: "boolean" },
        consensusVote: { type: ["boolean", "null"] },
      },
      required: ["reasoning", "observations", "blackboardEntry", "analysisComplete"],
    },
  };
}

// ==================== BATTLE-TESTED JSON PARSER (from coding-agent-orchestrator) ====================

// Normalize field names from snake_case to camelCase
function normalizeFieldNames(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(normalizeFieldNames);
  }
  
  // Map alternative field names to expected ones
  const fieldAliases: Record<string, string> = {
    // Nodes
    newNodes: 'proposedNodes',
    new_nodes: 'proposedNodes',
    nodes: 'proposedNodes',
    proposed_nodes: 'proposedNodes',
    // Edges
    newEdges: 'proposedEdges',
    new_edges: 'proposedEdges',
    edges: 'proposedEdges',
    proposed_edges: 'proposedEdges',
    // Graph complete vote
    isGraphComplete: 'graphCompleteVote',
    is_graph_complete: 'graphCompleteVote',
    graph_complete_vote: 'graphCompleteVote',
    graphComplete: 'graphCompleteVote',
    // Blackboard entry
    blackboard_entry: 'blackboardEntry',
    // Node fields
    node_type: 'nodeType',
    source_dataset: 'sourceDataset',
    source_element_ids: 'sourceElementIds',
    source_node_id: 'sourceNodeId',
    target_node_id: 'targetNodeId',
    edge_type: 'edgeType',
  };
  
  const normalized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Check for alias first, then convert snake_case to camelCase
    let normalizedKey = fieldAliases[key];
    if (!normalizedKey) {
      normalizedKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    }
    normalized[normalizedKey] = normalizeFieldNames(value);
  }
  return normalized;
}

function parseAgentResponseText(rawText: string, defaultResponse: any = {}): any {
  const originalText = rawText.trim();
  let text = originalText;

  console.log("Parsing agent response, length:", rawText.length);
  console.log("Raw preview:", rawText.slice(0, 300) + (rawText.length > 300 ? "..." : ""));

  // Helper to try parsing safely
  const tryParse = (jsonStr: string, method: string): any | null => {
    try {
      const parsed = JSON.parse(jsonStr);
      console.log(`JSON parsed successfully via ${method}`);
      // Normalize field names (snake_case -> camelCase)
      return normalizeFieldNames(parsed);
    } catch (e) {
      console.log(`JSON.parse failed in ${method}:`, (e as Error).message);
      return null;
    }
  };

  // Method 1: Direct parse (clean JSON)
  let result = tryParse(text, "direct parse");
  if (result) return result;

  // Method 2: Extract from LAST ```json fence
  const lastFenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```[\s\S]*$/i);
  if (lastFenceMatch?.[1]) {
    const extracted = lastFenceMatch[1].trim();
    const cleaned = extracted
      .replace(/^[\s\n]*here.?is.?the.?json.?[:\s]*/i, "")
      .replace(/^[\s\n]*json[:\s]*/i, "")
      .trim();
    result = tryParse(cleaned, "last code fence");
    if (result) return result;
  }

  // Method 3: Find ALL code blocks and try each one (in reverse order)
  const allFences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (let i = allFences.length - 1; i >= 0; i--) {
    const content = allFences[i][1].trim();
    if (content) {
      result = tryParse(content, `code fence #${i + 1} (reverse)`);
      if (result) return result;
    }
  }

  // Method 4: Brace matching on ORIGINAL text (most resilient)
  const firstBrace = originalText.indexOf("{");
  const lastBrace = originalText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = originalText.slice(firstBrace, lastBrace + 1);

    // Try raw first (preserves formatting)
    result = tryParse(candidate, "brace extraction (raw)");
    if (result) return result;

    // Try with whitespace normalization
    const cleaned = candidate
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    result = tryParse(cleaned, "brace extraction (cleaned)");
    if (result) return result;
  }

  // Method 5: Heuristic object match (last resort)
  const heuristicMatch = originalText.match(/(\{(?:[^{}]|"(?:\\.|[^"\\])*")*\})/);
  if (heuristicMatch) {
    result = tryParse(heuristicMatch[1], "heuristic object match");
    if (result) return result;
  }

  // Final fallback - return default with raw output for debugging
  console.error("All JSON parsing methods failed for response:", originalText.slice(0, 1000));
  return {
    ...defaultResponse,
    reasoning: "Failed to parse agent response as JSON. Raw output preserved.",
    rawOutput: originalText.slice(0, 2000),
  };
}

// ==================== LLM CALL HELPER ====================

interface ModelSettings {
  selectedModel: string;
  maxTokens: number;
  thinkingEnabled: boolean;
  thinkingBudget: number;
}

async function callLLM(
  apiEndpoint: string,
  apiKey: string,
  settings: ModelSettings,
  systemPrompt: string,
  userPrompt: string,
  schema: any,
  tool: any
): Promise<any> {
  const { selectedModel, maxTokens, thinkingEnabled, thinkingBudget } = settings;
  
  const defaultResponse = {
    reasoning: "",
    proposedNodes: [],
    proposedEdges: [],
    graphCompleteVote: false,
    blackboardEntry: { content: "" },
    observations: [],
    selectedNodeIds: [],
    analysisComplete: false,
  };

  if (selectedModel.startsWith("grok")) {
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: schema,
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Grok API error: ${JSON.stringify(data)}`);
    const rawText = data.choices?.[0]?.message?.content || "{}";
    return parseAgentResponseText(rawText, defaultResponse);
  } else if (selectedModel.startsWith("claude")) {
    // Build request body with optional thinking support
    const requestBody: any = {
      model: selectedModel,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
    };

    // Add thinking/extended thinking if enabled (Claude 3.5+ supports this)
    if (thinkingEnabled && thinkingBudget > 0) {
      requestBody.thinking = {
        type: "enabled",
        budget_tokens: thinkingBudget,
      };
    }

    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": thinkingEnabled ? "thinking-2025-04-15,structured-outputs-2025-11-13" : "structured-outputs-2025-11-13",
      },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Claude API error: ${JSON.stringify(data)}`);
    const toolUse = data.content?.find((c: any) => c.type === "tool_use");
    return toolUse?.input || defaultResponse;
  } else {
    // Gemini - use responseSchema for structured output
    const requestBody: any = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { 
        responseMimeType: "application/json",
        // Convert the JSON schema to Gemini format
        responseSchema: schema?.json_schema?.schema || undefined,
        maxOutputTokens: maxTokens, 
        temperature: 0.7,
      },
    };

    // Gemini 2.5 Flash/Pro support thinking mode
    if (thinkingEnabled && selectedModel.includes("2.5")) {
      requestBody.generationConfig.thinkingConfig = {
        thinkingBudget: thinkingBudget > 0 ? thinkingBudget : 8192,
      };
    }

    const response = await fetch(`${apiEndpoint}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Gemini API error: ${JSON.stringify(data)}`);
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return parseAgentResponseText(rawText, defaultResponse);
  }
}

// ==================== DEFAULT PERSONAS ====================

const DEFAULT_PERSONAS: AgentPersona[] = [
  {
    role: "security_analyst",
    name: "Security Analyst",
    systemPrompt: "Focus on security vulnerabilities, access control gaps, data exposure risks, authentication weaknesses, and compliance with security standards.",
  },
  {
    role: "business_analyst",
    name: "Business Analyst",
    systemPrompt: "Focus on business requirement fulfillment, user story coverage, acceptance criteria validation, and business logic completeness.",
  },
  {
    role: "developer",
    name: "Developer",
    systemPrompt: "Focus on technical implementation quality, code coverage, API completeness, error handling, and architectural alignment.",
  },
  {
    role: "end_user",
    name: "End User Advocate",
    systemPrompt: "Focus on usability, accessibility, user experience flows, edge cases from user perspective, and intuitive behavior.",
  },
  {
    role: "architect",
    name: "System Architect",
    systemPrompt: "Focus on system design patterns, scalability considerations, integration points, and overall architectural coherence.",
  },
];

// ==================== MAIN HANDLER ====================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const { sessionId, projectId, shareToken }: AuditRequest = await req.json();
    console.log("Starting audit orchestrator:", { sessionId, projectId });

    await supabase.rpc("set_share_token", { token: shareToken });

    // Get session details
    const { data: sessions } = await supabase.rpc("get_audit_sessions_with_token", {
      p_project_id: projectId,
      p_token: shareToken,
    });
    const session = sessions?.find((s: any) => s.id === sessionId);
    if (!session) throw new Error("Session not found");

    // Get project for model selection
    const { data: project } = await supabase.rpc("get_project_with_token", {
      p_project_id: projectId,
      p_token: shareToken,
    });

    // Extract all model settings from project
    const modelSettings: ModelSettings = {
      selectedModel: project?.selected_model || "gemini-2.5-flash",
      maxTokens: project?.max_tokens || 32768,
      thinkingEnabled: project?.thinking_enabled || false,
      thinkingBudget: project?.thinking_budget || -1,
    };

    console.log("Model settings:", modelSettings);

    let apiKey: string;
    let apiEndpoint: string;

    if (modelSettings.selectedModel.startsWith("gemini")) {
      apiKey = Deno.env.get("GEMINI_API_KEY")!;
      apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelSettings.selectedModel}:generateContent`;
    } else if (modelSettings.selectedModel.startsWith("claude")) {
      apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
      apiEndpoint = "https://api.anthropic.com/v1/messages";
    } else {
      apiKey = Deno.env.get("XAI_API_KEY")!;
      apiEndpoint = "https://api.x.ai/v1/chat/completions";
    }

    if (!apiKey) throw new Error(`API key not configured for: ${modelSettings.selectedModel}`);

    // Setup real-time channel with proper subscription
    const channel = supabase.channel(`audit-${sessionId}`);
    await new Promise<void>((resolve) => {
      channel.subscribe((status: string) => {
        console.log(`Channel subscription status: ${status}`);
        if (status === "SUBSCRIBED") resolve();
      });
      // Timeout after 2 seconds if subscription doesn't complete
      setTimeout(resolve, 2000);
    });

    // Helper to broadcast and log
    const broadcast = async (phase: string, extra: Record<string, any> = {}) => {
      const payload = { phase, sessionId, timestamp: new Date().toISOString(), ...extra };
      console.log(`Broadcasting: ${phase}`, extra);
      await channel.send({ type: "broadcast", event: "audit_refresh", payload });
    };

    // Helper to call RPC with error logging
    const rpc = async (name: string, params: Record<string, any>): Promise<any> => {
      console.log(`RPC call: ${name}`, JSON.stringify(params).slice(0, 200));
      const { data, error } = await supabase.rpc(name, params);
      if (error) {
        console.error(`RPC ERROR [${name}]:`, error.message, error.details, error.hint);
        throw new Error(`RPC ${name} failed: ${error.message}`);
      }
      console.log(`RPC success: ${name}`, data ? `(${Array.isArray(data) ? data.length + " rows" : "ok"})` : "(no data)");
      return data;
    };

    // Helper to log activity to the stream for real-time transparency
    const logActivity = async (agentRole: string | null, activityType: string, title: string, content?: string, metadata?: Record<string, any>) => {
      try {
        await rpc("insert_audit_activity_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_agent_role: agentRole,
          p_activity_type: activityType,
          p_title: title,
          p_content: content || null,
          p_metadata: metadata || {},
        });
      } catch (err) {
        console.error("Failed to log activity:", err);
      }
    };

    // Build problem shape
    const problemShape = await buildProblemShape(supabase, session, projectId, shareToken);
    console.log("Problem shape:", { d1Count: problemShape.dataset1.count, d2Type: problemShape.dataset2.type });

    await logActivity(null, "phase_change", "Starting Audit Session", `Analyzing ${problemShape.dataset1.count} ${problemShape.dataset1.type} against ${problemShape.dataset2.type}`);

    await rpc("update_audit_session_with_token", {
      p_session_id: sessionId,
      p_token: shareToken,
      p_status: "running",
      p_phase: "conference",
      p_problem_shape: problemShape,
    });
    await broadcast("conference", { status: "running" });

    // Get enabled agents
    const agentDefs = session.agent_definitions || {};
    const agents: AgentPersona[] = DEFAULT_PERSONAS.filter((p) => {
      const def = agentDefs[p.role];
      return !def || def.enabled !== false;
    }).map((p) => ({
      ...p,
      systemPrompt: agentDefs[p.role]?.customPrompt || p.systemPrompt,
    }));

    // Create agent instances
    for (const agent of agents) {
      await rpc("insert_audit_agent_instance_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: agent.role,
        p_agent_name: agent.name,
        p_system_prompt: agent.systemPrompt,
        p_sector_start: null,
        p_sector_end: null,
      });
    }

    await broadcast("conference", { agentsCreated: agents.length });
    await logActivity(null, "phase_change", "Conference Phase Started", `${agents.length} agents activated: ${agents.map(a => a.name).join(", ")}`);

    // ==================== PHASE 1: CONFERENCE ====================
    console.log("=== PHASE 1: CONFERENCE ===");
    
    const conferencePromises = agents.map(async (agent) => {
      try {
        await logActivity(agent.role, "thinking", `${agent.name} analyzing datasets`, "Identifying key concepts for knowledge graph...");
        
        const systemPrompt = getConferencePrompt(problemShape, agent);
        const response = await callLLM(
          apiEndpoint, apiKey, modelSettings,
          systemPrompt, "Identify key concepts for the knowledge graph.",
          getGrokConferenceSchema(), getClaudeConferenceTool()
        );

        // Log the FULL raw JSON response for transparency
        const nodeCount = response.proposedNodes?.length || 0;
        console.log(`Conference response from ${agent.role}: ${nodeCount} nodes, keys: ${Object.keys(response).join(", ")}`);
        
        // Log full raw response to activity stream
        await logActivity(agent.role, "response", `${agent.name} proposed ${nodeCount} concepts`, 
          JSON.stringify(response, null, 2), { rawResponse: true });

        // Insert proposed nodes - use UPSERT function (not insert)
        let insertedNodes = 0;
        for (const node of response.proposedNodes || []) {
          const label = node.label || node.name || "Unnamed";
          console.log(`Inserting node: "${label}" from ${agent.role}`);
          await rpc("upsert_audit_graph_node_with_token", {
            p_session_id: sessionId,
            p_token: shareToken,
            p_label: label,
            p_description: node.description || "",
            p_node_type: node.nodeType || node.type || "concept",
            p_source_dataset: node.sourceDataset || "dataset1",
            p_source_element_ids: node.sourceElementIds || node.relatedRequirements || [],
            p_created_by_agent: agent.role,
          });
          insertedNodes++;
          await logActivity(agent.role, "node_insert", `Created node: ${label}`, node.description?.slice(0, 200));
        }
        console.log(`${agent.role} inserted ${insertedNodes} nodes`);

        // Blackboard entry
        const bbContent = response.blackboardEntry?.content || response.reasoning;
        if (bbContent) {
          console.log(`${agent.role} writing to blackboard: ${bbContent.slice(0, 100)}...`);
          await rpc("insert_audit_blackboard_with_token", {
            p_session_id: sessionId,
            p_token: shareToken,
            p_agent_role: agent.role,
            p_entry_type: "observation",
            p_content: bbContent,
            p_iteration: 0,
            p_confidence: response.blackboardEntry?.confidence || 0.7,
          });
          await logActivity(agent.role, "blackboard_write", `${agent.name} shared observation`, bbContent.slice(0, 200));
        }

        return { agent: agent.role, success: true, nodes: response.proposedNodes?.length || 0 };
      } catch (err) {
        console.error(`Conference error for ${agent.role}:`, err);
        await logActivity(agent.role, "error", `Error during conference`, String(err));
        return { agent: agent.role, success: false, error: String(err) };
      }
    });

    await Promise.all(conferencePromises);
    await broadcast("conference_complete", { agents: agents.length });
    await logActivity(null, "phase_change", "Conference Complete", "All agents have shared initial observations");

    // ==================== PHASE 2: GRAPH BUILDING ====================
    console.log("=== PHASE 2: GRAPH BUILDING ===");
    await rpc("update_audit_session_with_token", {
      p_session_id: sessionId,
      p_token: shareToken,
      p_phase: "graph_building",
    });
    await broadcast("graph_building", { iteration: 0 });
    await logActivity(null, "phase_change", "Graph Building Phase Started", "Agents collaboratively building knowledge graph");

    // Reduced iterations for faster convergence
    const MAX_GRAPH_ITERATIONS = 3;
    let graphComplete = false;
    let graphIteration = 0;

    while (!graphComplete && graphIteration < MAX_GRAPH_ITERATIONS) {
      graphIteration++;
      console.log(`Graph building iteration ${graphIteration}`);
      await logActivity(null, "thinking", `Graph Building Iteration ${graphIteration}/${MAX_GRAPH_ITERATIONS}`, `Current graph has ${(await rpc("get_audit_graph_nodes_with_token", { p_session_id: sessionId, p_token: shareToken }))?.length || 0} nodes`);

      await rpc("update_audit_session_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_current_iteration: graphIteration,
      });
      await broadcast("graph_building", { iteration: graphIteration });

      // Get current graph state
      const existingNodes = await rpc("get_audit_graph_nodes_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
      });
      const existingEdges = await rpc("get_audit_graph_edges_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
      });

      const graphPromises = agents.map(async (agent) => {
        try {
          await logActivity(agent.role, "thinking", `${agent.name} reviewing graph`, "Looking for missing concepts and relationships...");
          
          const systemPrompt = getGraphBuildingPrompt(problemShape, agent, existingNodes || [], existingEdges || [], graphIteration);
          const response = await callLLM(
            apiEndpoint, apiKey, modelSettings,
            systemPrompt, "Review and propose updates to the knowledge graph.",
            getGrokGraphBuildingSchema(), getClaudeGraphBuildingTool()
          );
          
          // Log full raw response for transparency
          await logActivity(agent.role, "response", `${agent.name} voted: ${response.graphCompleteVote ? "Complete" : "Needs more"}`, 
            JSON.stringify(response, null, 2), { rawResponse: true, proposedNodes: response.proposedNodes?.length || 0, proposedEdges: response.proposedEdges?.length || 0 });

          // Insert new nodes (deduplicate by label) - use UPSERT
          const existingLabels = new Set((existingNodes || []).map((n: any) => n.label.toLowerCase()));
          for (const node of response.proposedNodes || []) {
            if (!existingLabels.has(node.label.toLowerCase())) {
              await rpc("upsert_audit_graph_node_with_token", {
                p_session_id: sessionId,
                p_token: shareToken,
                p_label: node.label,
                p_description: node.description || "",
                p_node_type: node.nodeType || "concept",
                p_source_dataset: node.sourceDataset || "dataset1",
                p_source_element_ids: node.sourceElementIds || [],
                p_created_by_agent: agent.role,
              });
              existingLabels.add(node.label.toLowerCase());
            }
          }

          // Insert edges using short ID prefix matching
          const refreshedNodes = await rpc("get_audit_graph_nodes_with_token", {
            p_session_id: sessionId,
            p_token: shareToken,
          });
          
          // Build prefix-to-full-ID map (8-char prefix -> full UUID)
          const prefixToFullId = new Map<string, string>();
          const prefixToLabel = new Map<string, string>();
          for (const n of (refreshedNodes || [])) {
            const prefix = n.id.slice(0, 8).toLowerCase();
            prefixToFullId.set(prefix, n.id);
            prefixToLabel.set(prefix, n.label);
          }
          
          const validPrefixes = Array.from(prefixToFullId.keys());
          console.log(`Edge resolution: ${validPrefixes.length} valid IDs: ${validPrefixes.join(", ")}`);

          let edgesInserted = 0;
          let edgesFailed = 0;
          const failedEdgeDetails: string[] = [];
          
          for (const edge of response.proposedEdges || []) {
            // Get IDs from the response (support both camelCase and snake_case)
            const sourceIdRaw = edge.sourceNodeId || edge.source_node_id || "";
            const targetIdRaw = edge.targetNodeId || edge.target_node_id || "";
            const sourceIdPrefix = sourceIdRaw.toLowerCase().slice(0, 8);
            const targetIdPrefix = targetIdRaw.toLowerCase().slice(0, 8);
            
            const sourceId = prefixToFullId.get(sourceIdPrefix);
            const targetId = prefixToFullId.get(targetIdPrefix);
            
            if (sourceId && targetId) {
              try {
                await rpc("insert_audit_graph_edge_with_token", {
                  p_session_id: sessionId,
                  p_token: shareToken,
                  p_source_node_id: sourceId,
                  p_target_node_id: targetId,
                  p_edge_type: edge.edgeType || edge.edge_type || "relates_to",
                  p_label: edge.label || null,
                  p_created_by_agent: agent.role,
                });
                edgesInserted++;
                console.log(`Edge inserted: ${sourceIdPrefix} -> ${targetIdPrefix}`);
              } catch (err) {
                console.error(`Edge insertion failed: ${err}`);
                edgesFailed++;
                failedEdgeDetails.push(`${sourceIdRaw}->${targetIdRaw}: DB error`);
              }
            } else {
              console.warn(`Edge skipped: "${sourceIdRaw}" -> "${targetIdRaw}" (valid IDs were: ${validPrefixes.join(", ")})`);
              edgesFailed++;
              failedEdgeDetails.push(`"${sourceIdRaw}"->"${targetIdRaw}"`);
            }
          }
          
          if (response.proposedEdges?.length > 0) {
            const details = edgesFailed > 0 
              ? `Inserted: ${edgesInserted}, Failed: ${edgesFailed}\nLLM used invalid IDs: ${failedEdgeDetails.slice(0, 5).join(", ")}${failedEdgeDetails.length > 5 ? '...' : ''}\nValid IDs were: ${validPrefixes.join(", ")}`
              : `Inserted: ${edgesInserted}`;
            await logActivity(agent.role, "edge_insert", `${agent.name} added ${edgesInserted} edges`, details);
          }

          // Blackboard
          if (response.blackboardEntry?.content) {
            await rpc("insert_audit_blackboard_with_token", {
              p_session_id: sessionId,
              p_token: shareToken,
              p_agent_role: agent.role,
              p_entry_type: "observation",
              p_content: response.blackboardEntry.content,
              p_iteration: graphIteration,
              p_confidence: response.blackboardEntry.confidence || 0.7,
            });
          }

          return { agent: agent.role, graphCompleteVote: response.graphCompleteVote };
        } catch (err) {
          console.error(`Graph building error for ${agent.role}:`, err);
          return { agent: agent.role, graphCompleteVote: false };
        }
      });

      const results = await Promise.all(graphPromises);
      await broadcast("graph_building", { iteration: graphIteration, votes: results.map(r => r.graphCompleteVote) });

      // Check if majority votes graph complete
      const completeVotes = results.filter(r => r.graphCompleteVote === true).length;
      const threshold = Math.ceil(agents.length * 0.6); // 60% threshold
      if (completeVotes >= threshold) {
        graphComplete = true;
        console.log(`Graph complete! ${completeVotes}/${agents.length} votes`);
        await logActivity(null, "success", "Graph Building Complete", `${completeVotes}/${agents.length} agents voted graph is complete`);
      } else {
        await logActivity(null, "thinking", "Continuing graph building", `Only ${completeVotes}/${agents.length} votes for completion (need ${threshold})`);
      }

      // Store votes
      const votes: Record<string, boolean> = {};
      results.forEach(r => { votes[r.agent] = r.graphCompleteVote || false; });
      await rpc("update_audit_session_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_graph_complete_votes: votes,
      });
    }

    // ==================== PHASE 3: ASSIGNMENT ====================
    console.log("=== PHASE 3: ASSIGNMENT ===");
    await logActivity(null, "phase_change", "Assignment Phase Started", "Agents selecting nodes to analyze");
    await rpc("update_audit_session_with_token", {
      p_session_id: sessionId,
      p_token: shareToken,
      p_phase: "assignment",
    });

    const graphNodes = await rpc("get_audit_graph_nodes_with_token", {
      p_session_id: sessionId,
      p_token: shareToken,
    });

    await broadcast("assignment", { graphNodes: graphNodes?.length || 0 });

    const agentSelections: Map<string, string[]> = new Map();

    const assignmentPromises = agents.map(async (agent) => {
      try {
        await logActivity(agent.role, "thinking", `${agent.name} selecting nodes`, "Choosing nodes matching expertise...");
        
        const systemPrompt = getAssignmentPrompt(agent, graphNodes || []);
        const response = await callLLM(
          apiEndpoint, apiKey, modelSettings,
          systemPrompt, "Select the nodes you want to analyze.",
          getGrokAssignmentSchema(), getClaudeAssignmentTool()
        );
        
        await logActivity(agent.role, "response", `${agent.name} selected ${response.selectedNodeIds?.length || 0} nodes`, 
          response.reasoning?.slice(0, 200));

        agentSelections.set(agent.role, response.selectedNodeIds || []);

        if (response.blackboardEntry?.content) {
          await rpc("insert_audit_blackboard_with_token", {
            p_session_id: sessionId,
            p_token: shareToken,
            p_agent_role: agent.role,
            p_entry_type: "observation",
            p_content: response.blackboardEntry.content,
            p_iteration: graphIteration + 1,
            p_confidence: 0.8,
          });
        }

        return { agent: agent.role, selectedNodes: response.selectedNodeIds || [] };
      } catch (err) {
        console.error(`Assignment error for ${agent.role}:`, err);
        return { agent: agent.role, selectedNodes: [] };
      }
    });

    await Promise.all(assignmentPromises);
    await broadcast("assignment_complete", { agents: agents.length });

    // Confirm assignments (mixed approach - orchestrator ensures coverage)
    const nodeAssignments: Map<string, string[]> = new Map();
    for (const node of graphNodes || []) {
      nodeAssignments.set(node.id, []);
    }

    // First pass: honor agent selections
    for (const [agentRole, selectedIds] of agentSelections) {
      for (const nodeId of selectedIds) {
        const current = nodeAssignments.get(nodeId) || [];
        current.push(agentRole);
        nodeAssignments.set(nodeId, current);
      }
    }

    // Second pass: assign unassigned nodes to least-loaded agents
    for (const [nodeId, assignedAgents] of nodeAssignments) {
      if (assignedAgents.length === 0) {
        // Find agent with fewest assignments
        const agentLoads = agents.map(a => ({
          role: a.role,
          load: Array.from(nodeAssignments.values()).filter(arr => arr.includes(a.role)).length,
        }));
        agentLoads.sort((a, b) => a.load - b.load);
        const leastLoadedAgent = agentLoads[0].role;
        nodeAssignments.set(nodeId, [leastLoadedAgent]);
      }
    }

    // Build final agent assignments
    const finalAssignments: Map<string, string[]> = new Map();
    for (const agent of agents) {
      finalAssignments.set(agent.role, []);
    }
    for (const [nodeId, assignedAgents] of nodeAssignments) {
      for (const agentRole of assignedAgents) {
        const current = finalAssignments.get(agentRole) || [];
        current.push(nodeId);
        finalAssignments.set(agentRole, current);
      }
    }

    console.log("Final assignments:", Object.fromEntries(finalAssignments));
    await logActivity(null, "success", "Node Assignments Complete", 
      agents.map(a => `${a.name}: ${finalAssignments.get(a.role)?.length || 0} nodes`).join(", "));

    // ==================== PHASE 4: PARALLEL ANALYSIS ====================
    console.log("=== PHASE 4: PARALLEL ANALYSIS ===");
    await logActivity(null, "phase_change", "Analysis Phase Started", `Agents analyzing assigned nodes (max ${session.max_iterations || 10} iterations)`);
    await rpc("update_audit_session_with_token", {
      p_session_id: sessionId,
      p_token: shareToken,
      p_phase: "analysis",
    });
    await broadcast("analysis", { iteration: 0 });

    const MAX_ANALYSIS_ITERATIONS = session.max_iterations || 10;
    let analysisIteration = 0;
    let consensusReached = false;

    while (analysisIteration < MAX_ANALYSIS_ITERATIONS && !consensusReached) {
      analysisIteration++;
      console.log(`Analysis iteration ${analysisIteration}`);
      await logActivity(null, "thinking", `Analysis Iteration ${analysisIteration}/${MAX_ANALYSIS_ITERATIONS}`, "Agents analyzing assigned elements...");

      await rpc("update_audit_session_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_current_iteration: graphIteration + analysisIteration,
      });
      await broadcast("analysis", { iteration: analysisIteration });

      // Check for abort
      const currentSessions = await rpc("get_audit_sessions_with_token", {
        p_project_id: projectId,
        p_token: shareToken,
      });
      const sessionState = currentSessions?.find((s: any) => s.id === sessionId);
      if (sessionState?.status === "stopped" || sessionState?.status === "paused") {
        console.log("Session stopped/paused");
        break;
      }

      // Get blackboard context
      const recentBlackboard = await rpc("get_audit_blackboard_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
      });
      const blackboardContext = (recentBlackboard || [])
        .slice(-20)
        .map((e: any) => `[${e.agent_role}] ${e.entry_type}: ${e.content}`)
        .join("\n");

      const analysisPromises = agents.map(async (agent) => {
        try {
          const assignedNodeIds = finalAssignments.get(agent.role) || [];
          const assignedNodes = (graphNodes || []).filter((n: any) => assignedNodeIds.includes(n.id));

          if (assignedNodes.length === 0) {
            return { agent: agent.role, consensusVote: true, analysisComplete: true };
          }

          const systemPrompt = getAnalysisPrompt(agent, problemShape, assignedNodes, blackboardContext);
          const response = await callLLM(
            apiEndpoint, apiKey, modelSettings,
            systemPrompt, "Analyze your assigned nodes and report findings.",
            getGrokAnalysisSchema(), getClaudeAnalysisTool()
          );
          
          await logActivity(agent.role, "response", `${agent.name} found ${response.observations?.length || 0} observations`,
            response.reasoning?.slice(0, 200));

          // Record observations to tesseract
          for (const obs of response.observations || []) {
            const elementIndex = problemShape.dataset1.elements.findIndex((e: any) => e.id === obs.elementId);
            await rpc("upsert_audit_tesseract_cell_with_token", {
              p_session_id: sessionId,
              p_token: shareToken,
              p_x_index: elementIndex >= 0 ? elementIndex : 0,
              p_x_element_id: obs.elementId,
              p_x_element_type: problemShape.dataset1.type,
              p_x_element_label: obs.elementLabel || null,
              p_y_step: obs.step || 1,
              p_y_step_label: problemShape.steps.find((s) => s.step === obs.step)?.label || null,
              p_z_polarity: typeof obs.polarity === "number" ? obs.polarity : 0,
              p_z_criticality: obs.criticality || null,
              p_evidence_summary: obs.evidence || null,
              p_contributing_agents: [agent.role],
            });
          }

          // Blackboard
          if (response.blackboardEntry?.content) {
            await rpc("insert_audit_blackboard_with_token", {
              p_session_id: sessionId,
              p_token: shareToken,
              p_agent_role: agent.role,
              p_entry_type: response.blackboardEntry.entryType || "observation",
              p_content: response.blackboardEntry.content,
              p_iteration: graphIteration + analysisIteration,
              p_confidence: response.blackboardEntry.confidence || 0.7,
            });
          }

          return { agent: agent.role, consensusVote: response.consensusVote, analysisComplete: response.analysisComplete };
        } catch (err) {
          console.error(`Analysis error for ${agent.role}:`, err);
          return { agent: agent.role, consensusVote: false, analysisComplete: false };
        }
      });

      const results = await Promise.all(analysisPromises);
      await broadcast("analysis", { iteration: analysisIteration, completed: results.filter(r => r.analysisComplete).length });

      // Check consensus
      const votes = results.filter((r) => r.consensusVote === true);
      if (votes.length === agents.length) {
        consensusReached = true;
        console.log("Consensus reached!");
        await logActivity(null, "success", "Consensus Reached!", "All agents agree on audit findings");
      } else {
        await logActivity(null, "thinking", "Continuing analysis", `${votes.length}/${agents.length} agents ready for consensus`);
      }
    }

    // ==================== FINALIZE ====================
    console.log("=== FINALIZING ===");
    await logActivity(null, "phase_change", "Finalizing Audit", "Generating Venn diagram and final results...");
    const vennResult = await generateVennResult(supabase, sessionId, shareToken, problemShape);

    await rpc("update_audit_session_with_token", {
      p_session_id: sessionId,
      p_token: shareToken,
      p_status: consensusReached ? "completed" : "completed_max_iterations",
      p_phase: "completed",
      p_venn_result: vennResult,
      p_consensus_reached: consensusReached,
    });

    await broadcast("completed", { consensusReached, vennResult: !!vennResult });
    await logActivity(null, "success", "Audit Complete", 
      `${consensusReached ? "Consensus reached" : "Max iterations reached"}. Found ${vennResult.aligned?.length || 0} aligned, ${vennResult.unique_to_d1?.length || 0} gaps`);

    return new Response(JSON.stringify({ 
      success: true, 
      sessionId, 
      graphIterations: graphIteration, 
      analysisIterations: analysisIteration, 
      consensusReached 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Audit orchestrator error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ==================== HELPER FUNCTIONS ====================

async function buildProblemShape(supabase: any, session: any, projectId: string, shareToken: string): Promise<ProblemShape> {
  const d1Type = session.dataset_1_type;
  const d2Type = session.dataset_2_type;

  let d1Elements: Array<{ id: string; label: string; index: number }> = [];

  if (d1Type === "requirements") {
    const { data } = await supabase.rpc("get_requirements_with_token", { p_project_id: projectId, p_token: shareToken });
    d1Elements = (data || []).map((r: any, i: number) => ({ id: r.id, label: r.title || r.text?.slice(0, 50), index: i }));
  } else if (d1Type === "canvas_nodes") {
    const { data } = await supabase.rpc("get_canvas_nodes_with_token", { p_project_id: projectId, p_token: shareToken });
    d1Elements = (data || []).map((n: any, i: number) => ({ id: n.id, label: n.data?.label || n.type, index: i }));
  } else if (d1Type === "standards") {
    const { data } = await supabase.rpc("get_project_standards_with_token", { p_project_id: projectId, p_token: shareToken });
    d1Elements = (data || []).map((s: any, i: number) => ({ id: s.standard_id || s.id, label: s.name || s.title, index: i }));
  } else if (d1Type === "artifacts") {
    const { data } = await supabase.rpc("get_artifacts_with_token", { p_project_id: projectId, p_token: shareToken });
    d1Elements = (data || []).map((a: any, i: number) => ({ id: a.id, label: a.ai_title || a.content?.slice(0, 50), index: i }));
  }

  let d2Summary = "";
  let d2Count = 0;

  if (d2Type === "repository_files") {
    const { data: repos } = await supabase.rpc("get_project_repos_with_token", { p_project_id: projectId, p_token: shareToken });
    if (repos?.[0]) {
      const { data: files } = await supabase.rpc("get_repo_files_with_token", { p_repo_id: repos[0].id, p_token: shareToken });
      d2Count = files?.length || 0;
      d2Summary = `${d2Count} files in repository`;
    }
  } else if (d2Type === "requirements") {
    const { data } = await supabase.rpc("get_requirements_with_token", { p_project_id: projectId, p_token: shareToken });
    d2Count = data?.length || 0;
    d2Summary = `${d2Count} requirements`;
  } else if (d2Type === "canvas_nodes") {
    const { data } = await supabase.rpc("get_canvas_nodes_with_token", { p_project_id: projectId, p_token: shareToken });
    d2Count = data?.length || 0;
    d2Summary = `${d2Count} canvas nodes`;
  }

  return {
    dataset1: { type: d1Type, count: d1Elements.length, elements: d1Elements },
    dataset2: { type: d2Type, count: d2Count, summary: d2Summary },
    steps: [
      { step: 1, label: "Identification - Does D1 element appear in D2?" },
      { step: 2, label: "Completeness - Is implementation complete?" },
      { step: 3, label: "Correctness - Is implementation correct?" },
      { step: 4, label: "Quality - Does implementation meet quality standards?" },
      { step: 5, label: "Integration - Is element properly integrated?" },
    ],
  };
}

async function generateVennResult(supabase: any, sessionId: string, shareToken: string, problemShape: ProblemShape): Promise<any> {
  const { data: cells } = await supabase.rpc("get_audit_tesseract_cells_with_token", {
    p_session_id: sessionId,
    p_token: shareToken,
  });

  if (!cells || cells.length === 0) {
    return { unique_to_d1: [], aligned: [], unique_to_d2: [], summary: { total_d1_coverage: 0, total_d2_coverage: 0, alignment_score: 0 } };
  }

  const elementScores = new Map<string, { totalPolarity: number; count: number; label: string; evidence: string[] }>();

  for (const cell of cells) {
    const existing = elementScores.get(cell.x_element_id) || { totalPolarity: 0, count: 0, label: cell.x_element_label || "", evidence: [] as string[] };
    existing.totalPolarity += cell.z_polarity;
    existing.count++;
    if (cell.evidence_summary) (existing.evidence as string[]).push(cell.evidence_summary);
    elementScores.set(cell.x_element_id, existing);
  }

  const uniqueToD1: any[] = [];
  const aligned: any[] = [];
  const uniqueToD2: any[] = [];

  for (const [id, score] of elementScores.entries()) {
    const avgPolarity = score.totalPolarity / score.count;
    const item = {
      id,
      label: score.label,
      category: avgPolarity < -0.3 ? "unique_d1" : avgPolarity > 0.3 ? "aligned" : "unique_d2",
      criticality: avgPolarity < -0.7 ? "critical" : avgPolarity < -0.3 ? "major" : avgPolarity < 0.3 ? "minor" : "info",
      evidence: score.evidence.slice(0, 3).join("; "),
    };

    if (avgPolarity < -0.3) uniqueToD1.push(item);
    else if (avgPolarity > 0.3) aligned.push(item);
    else uniqueToD2.push(item);
  }

  return {
    unique_to_d1: uniqueToD1,
    aligned,
    unique_to_d2: uniqueToD2,
    summary: {
      total_d1_coverage: problemShape.dataset1.count > 0 ? Math.round((aligned.length / problemShape.dataset1.count) * 100) : 0,
      total_d2_coverage: 75,
      alignment_score: problemShape.dataset1.count > 0 ? Math.round((aligned.length / problemShape.dataset1.count) * 100) : 0,
    },
  };
}
