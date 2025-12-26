// ==================== AUDIT ORCHESTRATOR v2 ====================
// Single orchestrator with perspective lenses, tool-based operations, streaming responses
// Mandatory source artifact linking, proper Venn diagram analysis

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { ORCHESTRATOR_TOOLS, getGrokToolSchema, getClaudeTools, getGeminiFunctionDeclarations } from "./tools.ts";
import { PERSPECTIVE_LENSES, getPerspectiveById } from "./perspectives.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AuditRequest {
  sessionId: string;
  projectId: string;
  shareToken: string;
}

interface ProblemShape {
  dataset1: { type: string; count: number; elements: Array<{ id: string; label: string; content?: string }> };
  dataset2: { type: string; count: number; elements: Array<{ id: string; label: string; content?: string }> };
  analysisSteps: Array<{ step: number; label: string }>;
}

interface ToolCall {
  tool: string;
  params: Record<string, any>;
  rationale?: string;
}

interface OrchestratorResponse {
  thinking: string;
  perspective?: string;
  toolCalls: ToolCall[];
  continueAnalysis: boolean;
}

// ==================== MAIN SYSTEM PROMPT ====================

function getOrchestratorSystemPrompt(problemShape: ProblemShape, phase: string): string {
  const toolDescriptions = ORCHESTRATOR_TOOLS.map(t => 
    `- **${t.name}**: ${t.description}`
  ).join("\n");

  const perspectiveDescriptions = PERSPECTIVE_LENSES.map(p =>
    `- **${p.id}** (${p.name}): ${p.focus}`
  ).join("\n");

  return `You are the Audit Orchestrator. Your job is to compare Dataset 1 (source of truth) against Dataset 2 (implementation) and produce a Venn diagram showing coverage, gaps, and orphans.

## Datasets
- **Dataset 1** (${problemShape.dataset1.type}): ${problemShape.dataset1.count} elements
- **Dataset 2** (${problemShape.dataset2.type}): ${problemShape.dataset2.count} elements

## MANDATORY: You MUST call tools EVERY iteration!

**CRITICAL RULES:**
1. **ALWAYS use write_blackboard** to track your progress. Write your plan at the start, findings as you discover them, and conclusions at the end.
2. **ALWAYS call at least one tool** in every response. If you have no tools to call, you're done.
3. **Batch tool calls** - you can call MULTIPLE tools in one response. Call up to 10 tools at once for efficiency.
4. **EVERY concept node MUST have sourceElementIds** - these link to the original artifacts.

## Current Phase: ${phase.toUpperCase()}

## Available Tools
${toolDescriptions}

## Perspective Lenses
${perspectiveDescriptions}

## REQUIRED WORKFLOW - Follow these phases in order:

### Phase 1: GRAPH_BUILDING (iterations 1-30)
1. First, call write_blackboard with entryType="plan" describing your analysis strategy
2. Call read_dataset_item for EVERY item in Dataset 1 (batch 5-10 per iteration)
3. Call read_dataset_item for EVERY item in Dataset 2 (batch 5-10 per iteration)  
4. For each meaningful theme, call create_concept with proper sourceElementIds
5. Call link_concepts to connect related concepts
6. Call write_blackboard with entryType="observation" as you find patterns

### Phase 2: GAP_ANALYSIS (iterations 30-50)
1. Call query_knowledge_graph with filter="dataset1_only" to find GAPS
2. Call query_knowledge_graph with filter="dataset2_only" to find ORPHANS
3. Call query_knowledge_graph with filter="shared" to find ALIGNED items
4. Write findings to blackboard with entryType="finding"

### Phase 3: DEEP_ANALYSIS (iterations 50-80)
1. For each D1 element, call record_tesseract_cell with polarity scores
2. Assess coverage quality for aligned items
3. Write conclusions to blackboard

### Phase 4: SYNTHESIS (final iterations)
1. Call read_blackboard to review all findings
2. Call finalize_venn with complete uniqueToD1, aligned, and uniqueToD2 arrays
3. Set continueAnalysis=false

## Analysis Steps for Each Element
${problemShape.analysisSteps.map(s => `${s.step}. ${s.label}`).join("\n")}

## REMEMBER:
- Call write_blackboard frequently - it's your working memory
- Batch multiple read_dataset_item calls together
- Create concept nodes for themes, NOT for every single element
- ALWAYS include sourceElementIds when creating concepts
- Set continueAnalysis=false ONLY after calling finalize_venn`;
}

// ==================== BATTLE-TESTED JSON PARSER ====================

function parseOrchestratorResponse(rawText: string): OrchestratorResponse {
  const defaultResponse: OrchestratorResponse = {
    thinking: "Failed to parse response",
    toolCalls: [],
    continueAnalysis: true,
  };

  const tryParse = (jsonStr: string): OrchestratorResponse | null => {
    try {
      const parsed = JSON.parse(jsonStr);
      return {
        thinking: parsed.thinking || parsed.reasoning || "",
        perspective: parsed.perspective,
        toolCalls: parsed.toolCalls || parsed.tool_calls || [],
        continueAnalysis: parsed.continueAnalysis ?? parsed.continue_analysis ?? true,
      };
    } catch {
      return null;
    }
  };

  // Method 1: Direct parse
  let result = tryParse(rawText.trim());
  if (result) return result;

  // Method 2: Extract from code fence
  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    result = tryParse(fenceMatch[1].trim());
    if (result) return result;
  }

  // Method 3: Brace extraction
  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    result = tryParse(rawText.slice(firstBrace, lastBrace + 1));
    if (result) return result;
  }

  console.error("Failed to parse orchestrator response:", rawText.slice(0, 500));
  return { ...defaultResponse, thinking: rawText.slice(0, 500) };
}

// ==================== TOOL EXECUTION ====================

async function executeTool(
  toolName: string,
  params: Record<string, any>,
  context: {
    supabase: any;
    sessionId: string;
    projectId: string;
    shareToken: string;
    problemShape: ProblemShape;
    logActivity: (agentRole: string | null, activityType: string, title: string, content?: string, metadata?: Record<string, any>) => Promise<void>;
    rpc: (name: string, params: Record<string, any>) => Promise<any>;
  }
): Promise<{ success: boolean; result: any; error?: string }> {
  const { supabase, sessionId, shareToken, problemShape, logActivity, rpc } = context;

  try {
    console.log(`[Tool: ${toolName}]`, JSON.stringify(params));
    
    // Helper to resolve partial IDs to full UUIDs
    const resolveElementId = (partialId: string): string | null => {
      const d1Match = problemShape.dataset1.elements.find(e => e.id === partialId || e.id.startsWith(partialId));
      if (d1Match) return d1Match.id;
      const d2Match = problemShape.dataset2.elements.find(e => e.id === partialId || e.id.startsWith(partialId));
      if (d2Match) return d2Match.id;
      return null;
    };
    
    switch (toolName) {
      case "read_dataset_item": {
        // Schema enforces: dataset, itemId
        const { dataset, itemId } = params;
        
        const elements = dataset === "dataset1" 
          ? problemShape.dataset1.elements 
          : problemShape.dataset2.elements;
        
        // Support partial ID matching (8-char prefix like "a203ec4d")
        const item = elements.find(e => e.id === itemId || e.id.startsWith(itemId));
        
        if (item) {
          console.log(`[read_dataset_item] Found:`, item.id);
          return { success: true, result: item };
        }
        console.log(`[read_dataset_item] Not found: ${itemId} in ${dataset}`);
        return { success: true, result: { error: `Item ${itemId} not found in ${dataset}` } };
      }

      case "query_knowledge_graph": {
        const { filter, nodeType, limit = 50 } = params;
        const nodes = await rpc("get_audit_graph_nodes_with_token", { p_session_id: sessionId, p_token: shareToken });
        const edges = await rpc("get_audit_graph_edges_with_token", { p_session_id: sessionId, p_token: shareToken });
        
        // Build connectivity info
        const connectedToD1 = new Set<string>();
        const connectedToD2 = new Set<string>();
        const d1Ids = new Set(problemShape.dataset1.elements.map(e => e.id));
        const d2Ids = new Set(problemShape.dataset2.elements.map(e => e.id));
        
        for (const node of nodes || []) {
          const sourceIds = node.source_element_ids || [];
          if (sourceIds.some((id: string) => d1Ids.has(id))) connectedToD1.add(node.id);
          if (sourceIds.some((id: string) => d2Ids.has(id))) connectedToD2.add(node.id);
        }
        
        let filtered = nodes || [];
        if (filter === "dataset1_only") filtered = filtered.filter((n: any) => connectedToD1.has(n.id) && !connectedToD2.has(n.id));
        else if (filter === "dataset2_only") filtered = filtered.filter((n: any) => connectedToD2.has(n.id) && !connectedToD1.has(n.id));
        else if (filter === "shared") filtered = filtered.filter((n: any) => connectedToD1.has(n.id) && connectedToD2.has(n.id));
        else if (filter === "orphans") {
          const connected = new Set<string>();
          (edges || []).forEach((e: any) => { connected.add(e.source_node_id); connected.add(e.target_node_id); });
          filtered = filtered.filter((n: any) => !connected.has(n.id));
        }
        
        if (nodeType) filtered = filtered.filter((n: any) => n.node_type === nodeType);
        
        return { success: true, result: { nodes: filtered.slice(0, limit), totalCount: filtered.length } };
      }

      case "get_concept_links": {
        const nodeId = params.nodeId || params.id;
        const nodes = await rpc("get_audit_graph_nodes_with_token", { p_session_id: sessionId, p_token: shareToken });
        const node = nodes?.find((n: any) => n.id === nodeId || n.id.startsWith(nodeId));
        if (!node) return { success: false, error: "Node not found", result: null };
        
        const d1Elements = problemShape.dataset1.elements.filter(e => (node.source_element_ids || []).includes(e.id));
        const d2Elements = problemShape.dataset2.elements.filter(e => (node.source_element_ids || []).includes(e.id));
        
        return { success: true, result: { node, linkedD1: d1Elements, linkedD2: d2Elements } };
      }

      case "write_blackboard": {
        // Schema enforces: entryType, content, confidence?, targetAgent?
        const { entryType, content, confidence = 0.7, targetAgent = null } = params;
        
        console.log(`[write_blackboard] entryType=${entryType}, content length=${content?.length || 0}`);
        
        await rpc("insert_audit_blackboard_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_agent_role: "orchestrator",
          p_entry_type: entryType,
          p_content: content,
          p_iteration: 0,
          p_confidence: confidence,
          p_target_agent: targetAgent,
          p_evidence: null,
        });
        await logActivity("orchestrator", "blackboard_write", `Blackboard: ${entryType}`, content?.slice(0, 200));
        return { success: true, result: { written: true } };
      }

      case "read_blackboard": {
        const { entryTypes, limit = 20 } = params;
        let entries = await rpc("get_audit_blackboard_with_token", { p_session_id: sessionId, p_token: shareToken });
        if (entryTypes?.length) entries = entries?.filter((e: any) => entryTypes.includes(e.entry_type));
        return { success: true, result: (entries || []).slice(0, limit) };
      }

      case "create_concept": {
        // Schema enforces: label, description, nodeType, sourceDataset, sourceElementIds
        const { label, description, nodeType = "dataset1_concept", sourceDataset = "dataset1", sourceElementIds } = params;
        
        if (!sourceElementIds || sourceElementIds.length === 0) {
          return { success: false, error: "sourceElementIds is REQUIRED - concepts must link to source artifacts", result: null };
        }
        
        // Resolve partial IDs to full UUIDs
        const resolvedIds: string[] = [];
        for (const partialId of sourceElementIds) {
          const resolved = resolveElementId(partialId) || partialId;
          resolvedIds.push(resolved);
        }
        
        console.log(`[create_concept] label=${label}, resolvedIds=`, resolvedIds);
        
        await rpc("upsert_audit_graph_node_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_label: label,
          p_description: description,
          p_node_type: nodeType,
          p_source_dataset: sourceDataset,
          p_source_element_ids: resolvedIds,
          p_created_by_agent: "orchestrator",
        });
        await logActivity("orchestrator", "node_insert", `Created concept: ${label}`, description?.slice(0, 200));
        return { success: true, result: { created: label } };
      }

      case "link_concepts": {
        // Schema enforces: sourceNodeId, targetNodeId, edgeType, label?
        const { sourceNodeId, targetNodeId, edgeType, label } = params;
        
        const nodes = await rpc("get_audit_graph_nodes_with_token", { p_session_id: sessionId, p_token: shareToken });
        
        // Enhanced resolver: check graph node ID first, then source_element_ids
        const resolveNodeId = (idOrPrefix: string): string | null => {
          if (!idOrPrefix) return null;
          
          // 1. Direct match on graph node ID (exact or prefix)
          const directMatch = nodes?.find((n: any) => n.id === idOrPrefix || n.id.startsWith(idOrPrefix));
          if (directMatch) return directMatch.id;
          
          // 2. Check if it's a source_element_id in any node
          const bySourceElement = nodes?.find((n: any) => 
            n.source_element_ids?.some((sid: string) => sid === idOrPrefix || sid.startsWith(idOrPrefix))
          );
          if (bySourceElement) return bySourceElement.id;
          
          // 3. Try matching by label (case-insensitive partial match)
          const byLabel = nodes?.find((n: any) => 
            n.label?.toLowerCase().includes(idOrPrefix.toLowerCase())
          );
          if (byLabel) return byLabel.id;
          
          return null;
        };
        
        const srcId = resolveNodeId(sourceNodeId);
        const tgtId = resolveNodeId(targetNodeId);
        
        if (!srcId || !tgtId) {
          // Provide helpful error with available nodes
          const availableNodes = (nodes || []).slice(0, 20).map((n: any) => 
            `${n.id.slice(0,8)}: "${n.label}" (sources: ${(n.source_element_ids || []).slice(0,2).map((s: string) => s.slice(0,8)).join(',')})`
          ).join('; ');
          return { 
            success: false, 
            error: `Could not resolve node IDs. src=${sourceNodeId}${srcId ? '✓' : '✗'}, tgt=${targetNodeId}${tgtId ? '✓' : '✗'}. Available nodes: ${availableNodes}`, 
            result: null 
          };
        }
        
        await rpc("insert_audit_graph_edge_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_source_node_id: srcId,
          p_target_node_id: tgtId,
          p_edge_type: edgeType,
          p_label: label || null,
          p_created_by_agent: "orchestrator",
        });
        await logActivity("orchestrator", "edge_insert", `Linked: ${sourceNodeId} -> ${targetNodeId}`, `Type: ${edgeType}`);
        return { success: true, result: { linked: true, sourceResolved: srcId, targetResolved: tgtId } };
      }

      case "record_tesseract_cell": {
        // Schema enforces: elementId, elementLabel?, step, stepLabel?, polarity, criticality?, evidenceSummary
        const { elementId, elementLabel, step, stepLabel, polarity, criticality, evidenceSummary } = params;
        
        // Resolve partial element ID
        const resolvedElementId = resolveElementId(elementId) || elementId;
        const elementIndex = problemShape.dataset1.elements.findIndex(e => e.id === resolvedElementId);
        
        console.log(`[record_tesseract_cell] elementId=${resolvedElementId}, step=${step}, polarity=${polarity}`);
        
        await rpc("upsert_audit_tesseract_cell_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_x_index: elementIndex >= 0 ? elementIndex : 0,
          p_x_element_id: resolvedElementId,
          p_x_element_type: problemShape.dataset1.type,
          p_x_element_label: elementLabel || null,
          p_y_step: step,
          p_y_step_label: stepLabel || null,
          p_z_polarity: polarity,
          p_z_criticality: criticality || null,
          p_evidence_summary: evidenceSummary,
          p_contributing_agents: ["orchestrator"],
        });
        await logActivity("orchestrator", "tesseract_cell", `Tesseract: ${elementLabel || resolvedElementId}`, `Step ${step}, Polarity: ${polarity}`);
        return { success: true, result: { recorded: true } };
      }

      case "finalize_venn": {
        const { uniqueToD1, aligned, uniqueToD2, summary } = params;
        
        const vennResult = {
          unique_to_d1: (uniqueToD1 || []).map((item: any) => ({
            id: item.id,
            label: item.label,
            category: "unique_d1",
            criticality: item.criticality || "major",
            evidence: item.evidence,
          })),
          aligned: (aligned || []).map((item: any) => ({
            id: item.id,
            label: item.label,
            category: "aligned",
            criticality: item.criticality || "info",
            evidence: item.evidence,
            sourceElement: item.sourceElement,
            targetElement: item.targetElement,
          })),
          unique_to_d2: (uniqueToD2 || []).map((item: any) => ({
            id: item.id,
            label: item.label,
            category: "unique_d2",
            criticality: item.criticality || "minor",
            evidence: item.evidence,
          })),
          summary: {
            total_d1_coverage: summary?.totalD1Coverage || 0,
            total_d2_coverage: summary?.totalD2Coverage || 0,
            alignment_score: summary?.alignmentScore || 0,
          },
        };
        
        await rpc("update_audit_session_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_venn_result: vennResult,
        });
        
        await logActivity("orchestrator", "success", "Venn Diagram Finalized", 
          `D1 Coverage: ${vennResult.summary.total_d1_coverage}%, Alignment: ${vennResult.summary.alignment_score}%`);
        
        return { success: true, result: vennResult };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}`, result: null };
    }
  } catch (err) {
    console.error(`Tool execution error [${toolName}]:`, err);
    return { success: false, error: String(err), result: null };
  }
}

// ==================== CLAUDE RESPONSE TOOL FOR STRUCTURED OUTPUT ====================
// Explicit parameter schemas to enforce exact parameter names - Claude cannot invent names

function getClaudeResponseTool() {
  // Define explicit params schema matching ORCHESTRATOR_TOOLS exactly
  const toolParamsSchema = {
    type: "object",
    properties: {
      // read_dataset_item params
      dataset: { type: "string", enum: ["dataset1", "dataset2"], description: "Which dataset to read from" },
      itemId: { type: "string", description: "The item ID or 8-char prefix to read" },
      
      // query_knowledge_graph params
      filter: { type: "string", enum: ["all", "dataset1_only", "dataset2_only", "shared", "orphans"], description: "Filter nodes by source dataset" },
      nodeType: { type: "string", description: "Filter by node type" },
      limit: { type: "integer", description: "Max results to return" },
      
      // get_concept_links params
      nodeId: { type: "string", description: "The knowledge graph node ID" },
      
      // write_blackboard params
      entryType: { type: "string", enum: ["plan", "finding", "observation", "question", "conclusion", "tool_result"], description: "Type of blackboard entry" },
      content: { type: "string", description: "The content to write" },
      confidence: { type: "number", description: "Confidence level 0.0-1.0" },
      targetAgent: { type: "string", description: "Optional target perspective" },
      
      // read_blackboard params
      entryTypes: { type: "array", items: { type: "string" }, description: "Filter to specific entry types" },
      
      // create_concept params
      label: { type: "string", description: "Short label for the concept" },
      description: { type: "string", description: "Detailed description of the concept" },
      sourceDataset: { type: "string", enum: ["dataset1", "dataset2", "both"], description: "Which dataset this concept originates from" },
      sourceElementIds: { type: "array", items: { type: "string" }, description: "REQUIRED: UUIDs or 8-char prefixes of source artifacts" },
      
      // link_concepts params
      sourceNodeId: { type: "string", description: "Source node ID" },
      targetNodeId: { type: "string", description: "Target node ID" },
      edgeType: { type: "string", enum: ["relates_to", "implements", "depends_on", "conflicts_with", "supports", "covers"], description: "Relationship type" },
      
      // record_tesseract_cell params
      elementId: { type: "string", description: "Dataset 1 element ID" },
      elementLabel: { type: "string", description: "Human-readable label" },
      step: { type: "integer", description: "Analysis step 1-5" },
      stepLabel: { type: "string", description: "Label for this step" },
      polarity: { type: "number", description: "Alignment score -1 to +1" },
      criticality: { type: "string", enum: ["critical", "major", "minor", "info"], description: "Severity level" },
      evidenceSummary: { type: "string", description: "Summary of evidence" },
      
      // finalize_venn params
      uniqueToD1: { 
        type: "array", 
        items: { 
          type: "object", 
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            criticality: { type: "string" },
            evidence: { type: "string" }
          }
        },
        description: "Elements unique to Dataset 1 (gaps)" 
      },
      aligned: { 
        type: "array", 
        items: { 
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            criticality: { type: "string" },
            evidence: { type: "string" },
            sourceElement: { type: "string" },
            targetElement: { type: "string" }
          }
        },
        description: "Elements present in both datasets" 
      },
      uniqueToD2: { 
        type: "array", 
        items: { 
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            criticality: { type: "string" },
            evidence: { type: "string" }
          }
        },
        description: "Elements unique to Dataset 2 (orphans)" 
      },
      summary: { 
        type: "object",
        properties: {
          totalD1Coverage: { type: "number" },
          totalD2Coverage: { type: "number" },
          alignmentScore: { type: "number" }
        },
        description: "Summary statistics" 
      },
    },
    additionalProperties: false,
  };

  return {
    name: "respond_with_actions",
    description: "Return your reasoning, tool calls, and continuation flag. You MUST use this tool to respond.",
    input_schema: {
      type: "object",
      properties: {
        thinking: { type: "string", description: "Your internal reasoning about what to do next" },
        perspective: { 
          type: "string",
          enum: ["architect", "security", "business", "developer", "user"],
          description: "Which perspective lens you are applying" 
        },
        toolCalls: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tool: { 
                type: "string", 
                enum: ["read_dataset_item", "query_knowledge_graph", "get_concept_links", 
                       "write_blackboard", "read_blackboard", "create_concept", 
                       "link_concepts", "record_tesseract_cell", "finalize_venn"],
                description: "Name of the tool to invoke" 
              },
              params: toolParamsSchema,
              rationale: { type: "string", description: "Why you are calling this tool" },
            },
            required: ["tool", "params"],
            additionalProperties: false,
          },
        },
        continueAnalysis: { type: "boolean", description: "Set to true if more iterations needed, false if done" },
      },
      required: ["thinking", "toolCalls", "continueAnalysis"],
      additionalProperties: false,
    },
  };
}

// ==================== LLM CALL WITH STRUCTURED OUTPUT ====================

// For Claude, we need to track tool_use IDs to send proper tool_result responses
interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  toolUseId?: string; // For Claude: the tool_use ID from assistant responses
}

async function callLLMWithConversation(
  apiEndpoint: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  turns: ConversationTurn[],
  logActivity: (agentRole: string | null, activityType: string, title: string, content?: string, metadata?: Record<string, any>) => Promise<void>,
  broadcast: (event: string, payload: any) => Promise<void>
): Promise<{ response: OrchestratorResponse; rawContent: string; toolUseId?: string }> {
  
  await logActivity("orchestrator", "llm_call", "Calling LLM...", `Model: ${model}, Turns: ${turns.length}`);
  
  let rawText = "";
  let returnedToolUseId: string | undefined;
  
  if (model.startsWith("gemini")) {
    // Convert turns to Gemini format (simple text messages)
    const geminiContents = turns.map(t => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.content }]
    }));
    
    const requestBody = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: geminiContents,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: getGeminiFunctionDeclarations(),
        maxOutputTokens: 32768,
        temperature: 0.7,
      },
    };

    const response = await fetch(`${apiEndpoint}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${errText}`);
    }
    
    const data = await response.json();
    rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    
  } else if (model.startsWith("claude")) {
    // Convert turns to Claude format with proper tool_use/tool_result structure
    const claudeMessages: any[] = [];
    
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      
      if (turn.role === "user") {
        // Check if previous turn was an assistant with a tool_use
        const prevTurn = i > 0 ? turns[i - 1] : null;
        if (prevTurn?.role === "assistant" && prevTurn.toolUseId) {
          // This user message is a tool_result for the previous tool_use
          claudeMessages.push({
            role: "user",
            content: [{
              type: "tool_result",
              tool_use_id: prevTurn.toolUseId,
              content: turn.content
            }]
          });
        } else {
          // Regular user message
          claudeMessages.push({
            role: "user",
            content: turn.content
          });
        }
      } else {
        // Assistant message - format as tool_use ONLY if we have a toolUseId
        if (turn.toolUseId) {
          try {
            const parsed = JSON.parse(turn.content);
            claudeMessages.push({
              role: "assistant",
              content: [{
                type: "tool_use",
                id: turn.toolUseId,
                name: "respond_with_actions",
                input: parsed
              }]
            });
          } catch {
            // If not valid JSON, skip this turn entirely
            console.log("Skipping assistant turn with invalid JSON");
          }
        } else {
          // No toolUseId - this was a text response, skip it in Claude conversation
          // Claude requires tool_use/tool_result pairs, so we can't include plain text assistant messages
          console.log("Skipping assistant turn without toolUseId");
        }
      }
    }
    
    // Log the full request payload for debugging
    const requestPayload = {
      model,
      max_tokens: 32768,
      system: systemPrompt,
      messages: claudeMessages,
      tools: [getClaudeResponseTool()],
      tool_choice: { type: "tool", name: "respond_with_actions" },
    };
    
    console.log("Claude request payload:", JSON.stringify(requestPayload, null, 2).slice(0, 5000));
    await logActivity("orchestrator", "llm_request", "Full LLM Request Payload", 
      JSON.stringify({ messageCount: claudeMessages.length, messages: claudeMessages }, null, 2));
    
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify(requestPayload),
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error("Claude API error response:", errText);
      throw new Error(`Claude API error: ${errText}`);
    }
    
    const data = await response.json();
    
    // Log the full response for debugging
    console.log("Claude full response:", JSON.stringify(data, null, 2).slice(0, 3000));
    await logActivity("orchestrator", "llm_response_full", "Full LLM Response", 
      JSON.stringify(data, null, 2).slice(0, 5000));
    
    // Extract from tool_use content block
    const toolUseBlock = data.content?.find((c: any) => c.type === "tool_use");
    if (toolUseBlock?.input) {
      rawText = JSON.stringify(toolUseBlock.input);
      returnedToolUseId = toolUseBlock.id; // Save the tool_use ID for the next turn
    } else {
      const textBlock = data.content?.find((c: any) => c.type === "text");
      rawText = textBlock?.text || "{}";
      console.log("Warning: No tool_use block found in Claude response, got text:", rawText.slice(0, 500));
    }
    
  } else {
    // Grok - convert to OpenAI-style messages
    const grokMessages = [
      { role: "system", content: systemPrompt },
      ...turns.map(t => ({ role: t.role, content: t.content }))
    ];
    
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: grokMessages,
        response_format: getGrokToolSchema(),
        max_tokens: 32768,
        temperature: 0.7,
      }),
    });
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Grok API error: ${errText}`);
    }
    
    const data = await response.json();
    rawText = data.choices?.[0]?.message?.content || "{}";
  }
  
  await logActivity("orchestrator", "response", "LLM Response", rawText.slice(0, 500), { rawLength: rawText.length });
  await broadcast("llm_response", { length: rawText.length });
  
  return { response: parseOrchestratorResponse(rawText), rawContent: rawText, toolUseId: returnedToolUseId };
}

// ==================== BUILD PROBLEM SHAPE ====================

async function buildProblemShape(
  supabase: any,
  session: any,
  projectId: string,
  shareToken: string
): Promise<ProblemShape> {
  const d1Type = session.dataset_1_type;
  const d2Type = session.dataset_2_type;
  const d1Ids = session.dataset_1_ids || [];
  const d2Ids = session.dataset_2_ids || [];

  let d1Elements: Array<{ id: string; label: string; content?: string }> = [];
  let d2Elements: Array<{ id: string; label: string; content?: string }> = [];

  // Fetch Dataset 1
  if (d1Type === "requirements") {
    const { data } = await supabase.rpc("get_requirements_with_token", { p_project_id: projectId, p_token: shareToken });
    const requirements = data || [];
    d1Elements = (d1Ids.length > 0 ? requirements.filter((r: any) => d1Ids.includes(r.id)) : requirements)
      .map((r: any) => ({ id: r.id, label: r.title, content: r.description }));
  } else if (d1Type === "canvas_nodes") {
    const { data } = await supabase.rpc("get_canvas_nodes_with_token", { p_project_id: projectId, p_token: shareToken });
    const nodes = data || [];
    d1Elements = (d1Ids.length > 0 ? nodes.filter((n: any) => d1Ids.includes(n.id)) : nodes)
      .map((n: any) => ({ id: n.id, label: (n.data as any)?.label || n.type, content: JSON.stringify(n.data) }));
  } else if (d1Type === "artifacts") {
    const { data } = await supabase.rpc("get_artifacts_with_token", { p_project_id: projectId, p_token: shareToken });
    const artifacts = data || [];
    d1Elements = (d1Ids.length > 0 ? artifacts.filter((a: any) => d1Ids.includes(a.id)) : artifacts)
      .map((a: any) => ({ id: a.id, label: a.ai_title || "Artifact", content: a.content?.slice(0, 500) }));
  }

  // Fetch Dataset 2
  if (d2Type === "requirements") {
    const { data } = await supabase.rpc("get_requirements_with_token", { p_project_id: projectId, p_token: shareToken });
    const requirements = data || [];
    d2Elements = (d2Ids.length > 0 ? requirements.filter((r: any) => d2Ids.includes(r.id)) : requirements)
      .map((r: any) => ({ id: r.id, label: r.title, content: r.description }));
  } else if (d2Type === "canvas_nodes") {
    const { data } = await supabase.rpc("get_canvas_nodes_with_token", { p_project_id: projectId, p_token: shareToken });
    const nodes = data || [];
    d2Elements = (d2Ids.length > 0 ? nodes.filter((n: any) => d2Ids.includes(n.id)) : nodes)
      .map((n: any) => ({ id: n.id, label: (n.data as any)?.label || n.type, content: JSON.stringify(n.data) }));
  } else if (d2Type === "repository") {
    const { data: repos } = await supabase.rpc("get_repos_with_token", { p_project_id: projectId, p_token: shareToken });
    const primeRepo = repos?.find((r: any) => r.is_prime) || repos?.[0];
    if (primeRepo) {
      const { data: files } = await supabase.rpc("get_repo_files_with_token", { p_repo_id: primeRepo.id, p_token: shareToken });
      d2Elements = (files || []).slice(0, 100).map((f: any) => ({ 
        id: f.id, 
        label: f.path, 
        content: f.content?.slice(0, 500) 
      }));
    }
  } else if (d2Type === "artifacts") {
    const { data } = await supabase.rpc("get_artifacts_with_token", { p_project_id: projectId, p_token: shareToken });
    const artifacts = data || [];
    d2Elements = (d2Ids.length > 0 ? artifacts.filter((a: any) => d2Ids.includes(a.id)) : artifacts)
      .map((a: any) => ({ id: a.id, label: a.ai_title || "Artifact", content: a.content?.slice(0, 500) }));
  }

  return {
    dataset1: { type: d1Type, count: d1Elements.length, elements: d1Elements },
    dataset2: { type: d2Type, count: d2Elements.length, elements: d2Elements },
    analysisSteps: [
      { step: 1, label: "Identify: Does D2 contain elements that correspond to this D1 element?" },
      { step: 2, label: "Complete: Is the implementation/coverage complete?" },
      { step: 3, label: "Correct: Is the implementation/coverage correct and accurate?" },
      { step: 4, label: "Quality: Is the quality of coverage acceptable?" },
      { step: 5, label: "Integrate: Does it integrate properly with related elements?" },
    ],
  };
}

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
    console.log("Starting audit orchestrator v2:", { sessionId, projectId });

    await supabase.rpc("set_share_token", { token: shareToken });

    // Get session and project
    const { data: sessions } = await supabase.rpc("get_audit_sessions_with_token", {
      p_project_id: projectId,
      p_token: shareToken,
    });
    const session = sessions?.find((s: any) => s.id === sessionId);
    if (!session) throw new Error("Session not found");

    const { data: project } = await supabase.rpc("get_project_with_token", {
      p_project_id: projectId,
      p_token: shareToken,
    });

    const selectedModel = project?.selected_model || "gemini-2.5-flash";
    let apiKey: string;
    let apiEndpoint: string;

    if (selectedModel.startsWith("gemini")) {
      apiKey = Deno.env.get("GEMINI_API_KEY")!;
      apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;
    } else if (selectedModel.startsWith("claude")) {
      apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
      apiEndpoint = "https://api.anthropic.com/v1/messages";
    } else {
      apiKey = Deno.env.get("XAI_API_KEY")!;
      apiEndpoint = "https://api.x.ai/v1/chat/completions";
    }

    if (!apiKey) throw new Error(`API key not configured for: ${selectedModel}`);

    // Setup real-time channel
    const channel = supabase.channel(`audit-${sessionId}`);
    await new Promise<void>((resolve) => {
      channel.subscribe((status: string) => {
        if (status === "SUBSCRIBED") resolve();
      });
      setTimeout(resolve, 2000);
    });

    const broadcast = async (event: string, payload: Record<string, any> = {}) => {
      await channel.send({ type: "broadcast", event: "audit_refresh", payload: { event, sessionId, ...payload } });
    };

    const rpc = async (name: string, params: Record<string, any>): Promise<any> => {
      const { data, error } = await supabase.rpc(name, params);
      if (error) throw new Error(`RPC ${name} failed: ${error.message}`);
      return data;
    };

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
        await broadcast("activity", { type: activityType, title });
      } catch (err) {
        console.error("Failed to log activity:", err);
      }
    };

    // Build problem shape
    const problemShape = await buildProblemShape(supabase, session, projectId, shareToken);
    console.log("Problem shape:", { d1: problemShape.dataset1.count, d2: problemShape.dataset2.count });

    await logActivity(null, "phase_change", "Audit Started", 
      `Analyzing ${problemShape.dataset1.count} ${problemShape.dataset1.type} against ${problemShape.dataset2.count} ${problemShape.dataset2.type}`);

    await rpc("update_audit_session_with_token", {
      p_session_id: sessionId,
      p_token: shareToken,
      p_status: "running",
      p_phase: "graph_building",
      p_problem_shape: problemShape,
    });
    await broadcast("phase", { phase: "graph_building" });

    // Tool execution context
    const toolContext = { supabase, sessionId, projectId, shareToken, problemShape, logActivity, rpc };

    // ==================== MAIN ORCHESTRATION LOOP ====================
    
    const MAX_ITERATIONS = session.max_iterations || 100;
    let iteration = 0;
    let analysisComplete = false;
    let currentPhase = "graph_building";
    let consecutiveEmptyToolCalls = 0;

    // Build initial user prompt with dataset summaries
    const d1Summary = problemShape.dataset1.elements.slice(0, 50).map(e => `- [${e.id.slice(0,8)}] ${e.label}`).join("\n");
    const d2Summary = problemShape.dataset2.elements.slice(0, 50).map(e => `- [${e.id.slice(0,8)}] ${e.label}`).join("\n");

    const initialPrompt = `## Dataset 1 Elements (${problemShape.dataset1.type}) - THE SOURCE OF TRUTH:
${d1Summary}
${problemShape.dataset1.count > 50 ? `... and ${problemShape.dataset1.count - 50} more` : ""}

## Dataset 2 Elements (${problemShape.dataset2.type}) - THE IMPLEMENTATION:
${d2Summary}
${problemShape.dataset2.count > 50 ? `... and ${problemShape.dataset2.count - 50} more` : ""}

## YOUR FIRST ACTION:
1. Call write_blackboard with entryType="plan" to record your analysis strategy
2. Then call read_dataset_item for MULTIPLE Dataset 1 elements (batch 5-10 calls)
3. Call create_concept for major themes you identify

START NOW - call your tools!`;

    // Proper multi-turn conversation array with tool_use ID tracking
    const conversationTurns: ConversationTurn[] = [
      { role: "user", content: initialPrompt }
    ];
    let lastToolUseId: string | undefined;

    while (iteration < MAX_ITERATIONS && !analysisComplete) {
      iteration++;
      console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS}, Phase: ${currentPhase} ===`);
      
      await logActivity(null, "thinking", `Iteration ${iteration}`, `Phase: ${currentPhase}`);
      await rpc("update_audit_session_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_current_iteration: iteration,
        p_phase: currentPhase,
      });
      await broadcast("iteration", { iteration, phase: currentPhase });

      // Check for abort
      const { data: currentSessions } = await supabase.rpc("get_audit_sessions_with_token", {
        p_project_id: projectId,
        p_token: shareToken,
      });
      const sessionState = currentSessions?.find((s: any) => s.id === sessionId);
      if (sessionState?.status === "stopped" || sessionState?.status === "paused") {
        console.log("Session stopped/paused, exiting loop");
        break;
      }

      // Call LLM with multi-turn conversation
      const systemPrompt = getOrchestratorSystemPrompt(problemShape, currentPhase);
      const { response, rawContent, toolUseId } = await callLLMWithConversation(
        apiEndpoint, apiKey, selectedModel,
        systemPrompt, conversationTurns,
        logActivity, broadcast
      );

      console.log(`Response: thinking=${response.thinking.length}chars, toolCalls=${response.toolCalls.length}, continue=${response.continueAnalysis}, toolUseId=${toolUseId || 'none'}`);

      // Only add assistant response to conversation history if we got a valid tool_use response
      // This is critical for Claude - we can't have assistant messages without tool_use IDs
      if (toolUseId) {
        conversationTurns.push({ role: "assistant", content: rawContent, toolUseId });
        lastToolUseId = toolUseId;
      } else {
        console.log("Skipping conversation turn - no toolUseId returned (Claude returned text instead of tool_use)");
      }

      // Log thinking
      if (response.thinking) {
        await logActivity("orchestrator", "thinking", 
          `${response.perspective ? `[${response.perspective.toUpperCase()}] ` : ""}Orchestrator Thinking`, 
          response.thinking);
      }

      // Handle empty tool calls - prompt LLM to actually use tools
      if (response.toolCalls.length === 0) {
        consecutiveEmptyToolCalls++;
        console.log(`Warning: No tool calls in iteration ${iteration} (consecutive: ${consecutiveEmptyToolCalls})`);
        
        // CRITICAL: If we added an assistant turn with toolUseId, we MUST add a tool_result
        // Claude requires tool_result immediately after every tool_use
        if (toolUseId) {
          let nudgeMessage = `## Tool Result: You returned an empty toolCalls array in iteration ${iteration}.
You MUST include actual tool calls in the toolCalls array. Current phase: ${currentPhase}.`;
          
          if (consecutiveEmptyToolCalls >= 3) {
            nudgeMessage += `

## WARNING: ${consecutiveEmptyToolCalls} consecutive empty responses!
Available tools you MUST use:
- write_blackboard: Record your findings (USE THIS!)
- read_dataset_item: Read more dataset elements  
- create_concept: Create knowledge graph nodes
- link_concepts: Connect existing nodes
- query_knowledge_graph: Check current graph state
- record_tesseract_cell: Record coverage analysis
- finalize_venn: Complete the analysis

CALL YOUR TOOLS NOW!`;
          }
          
          if (consecutiveEmptyToolCalls >= 5) {
            nudgeMessage += `

## FINAL WARNING: Analysis will terminate if you don't call tools!
If you're done, call finalize_venn. Otherwise, use the tools above.`;
          }
          
          conversationTurns.push({ role: "user", content: nudgeMessage });
        }
        
        if (consecutiveEmptyToolCalls >= 8) {
          console.log("Too many iterations without tool calls (8), forcing completion");
          await logActivity("orchestrator", "warning", "Analysis terminated", 
            `Stopped after ${consecutiveEmptyToolCalls} consecutive empty tool calls`);
          break;
        }
        continue;
      }
      
      consecutiveEmptyToolCalls = 0; // Reset on successful tool calls

      // Execute tool calls
      let toolResults = "";
      let successCount = 0;
      let failureCount = 0;
      const failedTools: string[] = [];
      
      for (const toolCall of response.toolCalls) {
        await logActivity("orchestrator", "tool_call", `Tool: ${toolCall.tool}`, 
          JSON.stringify(toolCall.params, null, 2), { tool: toolCall.tool });
        
        const result = await executeTool(toolCall.tool, toolCall.params, toolContext);
        
        const resultSummary = result.success 
          ? (typeof result.result === "object" ? JSON.stringify(result.result).slice(0, 300) : String(result.result))
          : `Error: ${result.error}`;
        
        await logActivity("orchestrator", result.success ? "success" : "error", 
          `${toolCall.tool}: ${result.success ? "Success" : "Failed"}`, resultSummary);
        
        if (result.success) {
          successCount++;
          toolResults += `\n\n✓ Tool: ${toolCall.tool}\nResult: ${resultSummary}`;
        } else {
          failureCount++;
          failedTools.push(toolCall.tool);
          toolResults += `\n\n✗ Tool: ${toolCall.tool} FAILED\nError: ${result.error}`;
        }
        
        // Update phase based on tool calls
        if (toolCall.tool === "finalize_venn" && result.success) {
          currentPhase = "completed";
          analysisComplete = true;
        } else if (toolCall.tool === "record_tesseract_cell") {
          currentPhase = "deep_analysis";
        } else if (toolCall.tool === "query_knowledge_graph" && toolCall.params?.filter === "shared") {
          currentPhase = "gap_analysis";
        }
      }

      // Update conversation with tool results and feedback as a new user message
      if (toolResults) {
        let feedback = `## Tool Results from Iteration ${iteration} (${successCount} succeeded, ${failureCount} failed):${toolResults}`;
        
        // Add guidance for failed tools
        if (failureCount > 0) {
          feedback += `\n\n## Tool Failures - Please Correct:`;
          if (failedTools.includes("link_concepts")) {
            feedback += `\n- link_concepts failed: Make sure you use graph node IDs (from create_concept results), not source element IDs directly. Check query_knowledge_graph to see available nodes.`;
          }
          if (failedTools.includes("create_concept")) {
            feedback += `\n- create_concept failed: Ensure sourceElementIds contains valid element IDs from the datasets.`;
          }
        }
        
        feedback += `\n\nContinue your analysis. Current phase: ${currentPhase}. What's your next step?`;
        conversationTurns.push({ role: "user", content: feedback });
      }

      // Check if LLM says we're done
      if (!response.continueAnalysis) {
        console.log("LLM indicated analysis complete");
        analysisComplete = true;
      }

      await broadcast("iteration_complete", { iteration, toolCallCount: response.toolCalls.length });
    }

    // Finalize session
    const finalStatus = analysisComplete ? "completed" : "completed_max_iterations";
    await rpc("update_audit_session_with_token", {
      p_session_id: sessionId,
      p_token: shareToken,
      p_status: finalStatus,
      p_phase: "synthesis",
      p_consensus_reached: analysisComplete,
    });

    await logActivity(null, "phase_change", "Audit Complete", 
      `Finished after ${iteration} iterations. Status: ${finalStatus}`);
    await broadcast("complete", { status: finalStatus, iterations: iteration });

    return new Response(JSON.stringify({ success: true, iterations: iteration, status: finalStatus }), {
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
