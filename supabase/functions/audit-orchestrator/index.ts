// ==================== AUDIT ORCHESTRATOR v3 ====================
// Multi-tool Claude orchestrator with clean conversation structure
// Architecture: system prompt once, user provides context each iteration, assistant calls tools

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { ORCHESTRATOR_TOOLS, getGrokToolSchema, getClaudeTools, getGeminiFunctionDeclarations } from "./tools.ts";
import { PERSPECTIVE_LENSES, getPerspectiveById } from "./perspectives.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Phase display names for activity stream
const PHASE_DISPLAY_NAMES: Record<string, string> = {
  initialization: "Initialization",
  graph_building: "Building Knowledge Graph",
  gap_analysis: "Analyzing Gaps & Orphans",
  deep_analysis: "Deep Analysis (Tesseract)",
  synthesis: "Synthesizing Venn Diagram",
  completed: "Audit Complete",
};

interface AuditRequest {
  sessionId: string;
  projectId: string;
  shareToken: string;
  resume?: boolean; // Flag to indicate resuming a stale session
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

// Generate a stable UUID-like ID from a file path for use as element ID
// This creates a deterministic ID so the same file always gets the same ID
function generateStableFileId(path: string, index: number): string {
  // Simple hash-based UUID v4-like generation from path
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const str = `file:${path}:${index}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert hash to hex and pad
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const hex2 = Math.abs(hash * 31).toString(16).padStart(12, '0');
  
  return `f${hex.slice(0, 7)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(4, 7)}-${hex2.slice(0, 12)}`;
}

// ==================== CONVERSATION ARCHITECTURE ====================
// 
// Claude requires strict tool_use/tool_result pairing. Our architecture:
//
// SYSTEM PROMPT: Contains the full task description (sent once, not repeated)
//
// MESSAGE 1: user - Initial task with dataset summaries
// MESSAGE 2: assistant - tool_use block with respond_with_actions
// MESSAGE 3: user - tool_result block with execution results + context update
// MESSAGE 4: assistant - tool_use block with respond_with_actions  
// MESSAGE 5: user - tool_result block with execution results + context update
// ... and so on
//
// CRITICAL RULES:
// 1. Every assistant message MUST be a tool_use block (we force tool_choice)
// 2. Every tool_use MUST be immediately followed by a tool_result with the same ID
// 3. User messages include: tool results + current blackboard + graph stats + phase info
// 4. Never include plain text assistant messages

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | any[];
}

// Track each iteration's exchange
interface IterationRecord {
  iteration: number;
  toolUseId: string;
  assistantInput: any; // The parsed input from respond_with_actions
  toolResults: string; // The results from executing tools
}

// ==================== MAIN SYSTEM PROMPT ====================

function getSystemPrompt(problemShape: ProblemShape): string {
  const toolDescriptions = ORCHESTRATOR_TOOLS.map(t => 
    `- **${t.name}**: ${t.description}`
  ).join("\n");

  const perspectiveDescriptions = PERSPECTIVE_LENSES.map(p =>
    `- **${p.id}** (${p.name}): ${p.focus}`
  ).join("\n");

  return `You are the Audit Orchestrator. Your mission is to compare Dataset 1 (source of truth) against Dataset 2 (implementation) and produce a comprehensive Venn diagram showing coverage, gaps, and orphans.

## THE DATASETS

**Dataset 1** (${problemShape.dataset1.type}): ${problemShape.dataset1.count} elements - This is the SOURCE OF TRUTH
**Dataset 2** (${problemShape.dataset2.type}): ${problemShape.dataset2.count} elements - This is the IMPLEMENTATION

## YOUR TOOLS

You have these tools available - call them via the toolCalls array:
${toolDescriptions}

## PERSPECTIVE LENSES

Apply these perspectives during analysis:
${perspectiveDescriptions}

## ANALYSIS PHASES

### Phase 1: GRAPH_BUILDING (iterations 1-30)
- Call write_blackboard with entryType="plan" to document your strategy
- Call read_dataset_item for EVERY element in Dataset 1 (batch 5-10 per iteration)
- Call read_dataset_item for EVERY element in Dataset 2 (batch 5-10 per iteration)
- Call create_concept for major themes/concepts (include sourceElementIds!)
- Call link_concepts to connect related concepts
- Call write_blackboard with entryType="observation" as you find patterns

### Phase 2: GAP_ANALYSIS (iterations 30-50)  
- Call query_knowledge_graph with filter="dataset1_only" to find GAPS
- Call query_knowledge_graph with filter="dataset2_only" to find ORPHANS
- Call query_knowledge_graph with filter="shared" to find ALIGNED items
- Call write_blackboard with entryType="finding" for each discovery

### Phase 3: DEEP_ANALYSIS (iterations 50-80)
- Call record_tesseract_cell for each D1 element with polarity scores
- Assess coverage quality and completeness
- Call write_blackboard with entryType="conclusion" for insights

### Phase 4: SYNTHESIS (final iterations)
- Call read_blackboard to review all findings
- Call finalize_venn with complete arrays for uniqueToD1, aligned, uniqueToD2
- Set continueAnalysis=false

## ANALYSIS STEPS FOR EACH ELEMENT

${problemShape.analysisSteps.map(s => `${s.step}. ${s.label}`).join("\n")}

## CRITICAL RULES

1. **ALWAYS call at least one tool** in every response
2. **BATCH tool calls** - call up to 10 tools at once for efficiency  
3. **write_blackboard EVERY iteration** - it's your working memory AND your resume checkpoint
4. **ALWAYS include sourceElementIds** when creating concept nodes
5. **Set continueAnalysis=false** ONLY after calling finalize_venn

## BLACKBOARD REQUIREMENTS (CRITICAL!)
You MUST call write_blackboard:
- At the START of each iteration with your current plan (entryType="thinking")
- After processing each batch of elements with your findings (entryType="batch_findings")
- When you discover gaps or orphans (entryType="finding")
- Before finalize_venn with your synthesis (entryType="synthesis")

The blackboard is your ONLY persistent memory. If the analysis is interrupted and resumes, we will use the blackboard to restore context. Write frequently!

## RESPONSE FORMAT

You MUST respond using the respond_with_actions tool with:
- thinking: Your internal reasoning about what to do next
- perspective: Which lens you're applying (architect/security/business/developer/user)
- toolCalls: Array of tools to execute (REQUIRED - at least one!)
- continueAnalysis: true to continue, false only after finalize_venn`;
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
      // CRITICAL: Ensure toolCalls is always an array
      let toolCalls = parsed.toolCalls || parsed.tool_calls || [];
      if (!Array.isArray(toolCalls)) {
        console.warn("toolCalls was not an array, converting:", typeof toolCalls);
        toolCalls = [];
      }
      return {
        thinking: parsed.thinking || parsed.reasoning || "",
        perspective: parsed.perspective,
        toolCalls,
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
    
    // Helper to resolve partial IDs, labels, or file paths to full UUIDs
    const resolveElementId = (partialId: string): string | null => {
      // First, try exact match
      const d1Exact = problemShape.dataset1.elements.find(e => e.id === partialId);
      if (d1Exact) return d1Exact.id;
      const d2Exact = problemShape.dataset2.elements.find(e => e.id === partialId);
      if (d2Exact) return d2Exact.id;
      
      // Try partial UUID match (prefix)
      const d1Partial = problemShape.dataset1.elements.find(e => e.id.startsWith(partialId));
      if (d1Partial) return d1Partial.id;
      const d2Partial = problemShape.dataset2.elements.find(e => e.id.startsWith(partialId));
      if (d2Partial) return d2Partial.id;
      
      // Try matching by label (file paths, names, etc.) - for when LLM passes file paths
      const d1Label = problemShape.dataset1.elements.find(e => e.label === partialId);
      if (d1Label) return d1Label.id;
      const d2Label = problemShape.dataset2.elements.find(e => e.label === partialId);
      if (d2Label) return d2Label.id;
      
      // Try matching by originalPath for file elements
      const d1Path = problemShape.dataset1.elements.find((e: any) => e.originalPath === partialId);
      if (d1Path) return d1Path.id;
      const d2Path = problemShape.dataset2.elements.find((e: any) => e.originalPath === partialId);
      if (d2Path) return d2Path.id;
      
      return null;
    };
    
    switch (toolName) {
      case "read_dataset_item": {
        // Tolerant param extraction
        const dataset = params.dataset || params.datasetId || "dataset1";
        const itemId = params.itemId || params.elementId || params.id;
        
        const normalizedDataset = dataset === "1" ? "dataset1" : dataset === "2" ? "dataset2" : dataset;
        const elements = normalizedDataset === "dataset1" 
          ? problemShape.dataset1.elements 
          : problemShape.dataset2.elements;
        
        // Support partial ID matching
        const item = elements.find(e => e.id === itemId || e.id.startsWith(itemId));
        
        if (item) {
          return { success: true, result: item };
        }
        return { success: false, result: null, error: `Item ${itemId} not found in ${normalizedDataset}` };
      }
      
      case "query_knowledge_graph": {
        const filter = params.filter || "all";
        const limit = params.limit || 50;
        
        const { data: nodes } = await supabase.rpc("get_audit_graph_nodes_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
        });
        
        const { data: edges } = await supabase.rpc("get_audit_graph_edges_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
        });
        
        let filteredNodes = nodes || [];
        
        if (filter === "dataset1_only") {
          filteredNodes = filteredNodes.filter((n: any) => n.source_dataset === "dataset1");
        } else if (filter === "dataset2_only") {
          filteredNodes = filteredNodes.filter((n: any) => n.source_dataset === "dataset2");
        } else if (filter === "shared") {
          filteredNodes = filteredNodes.filter((n: any) => n.source_dataset === "both");
        }
        
        return { 
          success: true, 
          result: { 
            nodes: filteredNodes.slice(0, limit).map((n: any) => ({
              id: n.id,
              label: n.label,
              sourceDataset: n.source_dataset,
              sourceElementIds: n.source_element_ids
            })),
            edges: (edges || []).slice(0, limit * 2).map((e: any) => ({
              id: e.id,
              source: e.source_node_id,
              target: e.target_node_id,
              type: e.edge_type
            })),
            totalNodes: filteredNodes.length,
            totalEdges: (edges || []).length
          } 
        };
      }
      
      case "get_concept_links": {
        const nodeId = params.nodeId || params.id;
        
        const { data: edges } = await supabase.rpc("get_audit_graph_edges_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
        });
        
        const relatedEdges = (edges || []).filter((e: any) => 
          e.source_node_id === nodeId || e.target_node_id === nodeId ||
          e.source_node_id.startsWith(nodeId) || e.target_node_id.startsWith(nodeId)
        );
        
        return { success: true, result: { nodeId, edges: relatedEdges } };
      }
      
      case "write_blackboard": {
        const entryType = params.entryType || params.entry_type || "observation";
        const content = params.content || params.entry || params.text || "";
        const confidence = params.confidence ?? 0.8;
        const targetAgent = params.targetAgent || params.target_agent || null;
        
        if (!content) {
          return { success: false, result: null, error: "Content is required for write_blackboard" };
        }
        
        // Note: Parameter order matches existing DB function signature
        await rpc("insert_audit_blackboard_with_token", {
          p_session_id: sessionId,
          p_iteration: 0,
          p_agent_role: "orchestrator",
          p_entry_type: entryType,
          p_content: content,
          p_token: shareToken,
          p_evidence: null,
          p_confidence: confidence,
          p_target_agent: targetAgent,
        });
        
        return { success: true, result: { entryType, contentLength: content.length } };
      }
      
      case "read_blackboard": {
        const entryTypes = params.entryTypes || params.entry_types || null;
        const limit = params.limit || 50;
        
        const { data: entries } = await supabase.rpc("get_audit_blackboard_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
        });
        
        let filtered = entries || [];
        if (entryTypes && Array.isArray(entryTypes) && entryTypes.length > 0) {
          filtered = filtered.filter((e: any) => entryTypes.includes(e.entry_type));
        }
        
        return { 
          success: true, 
          result: filtered.slice(0, limit).map((e: any) => ({
            id: e.id,
            type: e.entry_type,
            content: e.content,
            agent: e.agent_role,
            iteration: e.iteration,
            createdAt: e.created_at
          }))
        };
      }
      
      case "create_concept": {
        const label = params.label || params.name || params.title;
        const description = params.description || params.desc || "";
        const sourceDataset = params.sourceDataset || params.source_dataset || "both";
        let sourceElementIds = params.sourceElementIds || params.source_element_ids || [];
        
        if (!label) {
          return { success: false, result: null, error: "Label is required for create_concept" };
        }
        
        // Resolve partial IDs to full UUIDs
        sourceElementIds = sourceElementIds.map((id: string) => resolveElementId(id) || id);
        
        // Use upsert_audit_graph_node_with_token (not insert)
        const conceptData = await rpc("upsert_audit_graph_node_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_label: label,
          p_description: description,
          p_node_type: "concept",
          p_source_dataset: sourceDataset,
          p_source_element_ids: sourceElementIds,
          p_created_by_agent: "orchestrator",
          p_x_position: 0,
          p_y_position: 0,
          p_color: sourceDataset === "dataset1" ? "#3b82f6" : sourceDataset === "dataset2" ? "#22c55e" : "#a855f7",
          p_size: 30,
          p_metadata: {},
        });
        
        // Auto-create source element nodes and link them to the concept
        // This makes the graph show provenance (concept -> source elements)
        const createdSourceNodeIds: string[] = [];
        for (const elementId of sourceElementIds) {
          // Find the element in the problem shape
          const d1Element = problemShape.dataset1.elements.find(e => e.id === elementId);
          const d2Element = problemShape.dataset2.elements.find(e => e.id === elementId);
          const element = d1Element || d2Element;
          const elementDataset = d1Element ? "dataset1" : d2Element ? "dataset2" : null;
          
          if (element && elementDataset) {
            // Create/upsert a node for the source element itself
            const nodeType = elementDataset === "dataset1" ? "requirement" : "canvas_node";
            const sourceNodeData = await rpc("upsert_audit_graph_node_with_token", {
              p_session_id: sessionId,
              p_token: shareToken,
              p_label: element.label,
              p_description: element.content || "",
              p_node_type: nodeType,
              p_source_dataset: elementDataset,
              p_source_element_ids: [elementId],
              p_created_by_agent: "orchestrator",
              p_x_position: 0,
              p_y_position: 0,
              p_color: elementDataset === "dataset1" ? "#3b82f6" : "#22c55e",
              p_size: 20,
              p_metadata: { originalElementId: elementId },
            });
            
            if (sourceNodeData?.id && conceptData?.id) {
              createdSourceNodeIds.push(sourceNodeData.id);
              // Create edge: concept -> source element (derived_from relationship)
              await rpc("insert_audit_graph_edge_with_token", {
                p_session_id: sessionId,
                p_token: shareToken,
                p_source_node_id: conceptData.id,
                p_target_node_id: sourceNodeData.id,
                p_edge_type: "derived_from",
                p_label: "derived from",
                p_weight: 1.0,
                p_created_by_agent: "orchestrator",
                p_metadata: {},
              });
            }
          }
        }
        
        return { 
          success: true, 
          result: { 
            nodeId: conceptData?.id, 
            label, 
            sourceDataset, 
            sourceElementIds,
            linkedSourceNodes: createdSourceNodeIds.length 
          } 
        };
      }
      
      case "link_concepts": {
        const sourceNodeId = params.sourceNodeId || params.source || params.from;
        const targetNodeId = params.targetNodeId || params.target || params.to;
        const edgeType = params.edgeType || params.type || params.edge_type || "relates_to";
        const label = params.label || null;
        
        if (!sourceNodeId || !targetNodeId) {
          return { success: false, result: null, error: "sourceNodeId and targetNodeId are required" };
        }
        
        // Helper to resolve node IDs - supports graph node IDs, source element IDs, or labels
        const resolveNodeId = async (idOrLabel: string): Promise<string | null> => {
          const { data: nodes } = await supabase.rpc("get_audit_graph_nodes_with_token", {
            p_session_id: sessionId,
            p_token: shareToken,
          });
          
          if (!nodes || nodes.length === 0) return null;
          
          // Try direct match
          const directMatch = nodes.find((n: any) => n.id === idOrLabel);
          if (directMatch) return directMatch.id;
          
          // Try partial ID match (8-char prefix)
          const partialMatch = nodes.find((n: any) => n.id.startsWith(idOrLabel));
          if (partialMatch) return partialMatch.id;
          
          // Try source_element_ids match
          const sourceMatch = nodes.find((n: any) => 
            n.source_element_ids?.some((sid: string) => sid === idOrLabel || sid.startsWith(idOrLabel))
          );
          if (sourceMatch) return sourceMatch.id;
          
          // Try label match
          const labelMatch = nodes.find((n: any) => 
            n.label?.toLowerCase() === idOrLabel?.toLowerCase()
          );
          if (labelMatch) return labelMatch.id;
          
          return null;
        };
        
        const resolvedSource = await resolveNodeId(sourceNodeId);
        const resolvedTarget = await resolveNodeId(targetNodeId);
        
        if (!resolvedSource) {
          return { success: false, result: null, error: `Could not find source node: ${sourceNodeId}` };
        }
        if (!resolvedTarget) {
          return { success: false, result: null, error: `Could not find target node: ${targetNodeId}` };
        }
        
        const data = await rpc("insert_audit_graph_edge_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_source_node_id: resolvedSource,
          p_target_node_id: resolvedTarget,
          p_edge_type: edgeType,
          p_label: label,
          p_weight: 1.0,
          p_created_by_agent: "orchestrator",
          p_metadata: {},
        });
        
        return { success: true, result: { edgeId: data.id, source: resolvedSource, target: resolvedTarget, type: edgeType } };
      }
      
      case "record_tesseract_cell": {
        const elementId = params.elementId || params.element_id || params.id;
        const elementLabel = params.elementLabel || params.element_label || params.label || "";
        const step = params.step || 1;
        const stepLabel = params.stepLabel || params.step_label || problemShape.analysisSteps.find(s => s.step === step)?.label || `Step ${step}`;
        const polarity = params.polarity ?? 0;
        const criticality = params.criticality || "info";
        const evidenceSummary = params.evidenceSummary || params.evidence_summary || params.evidence || "";
        
        // Resolve element ID to full UUID
        const resolvedElementId = resolveElementId(elementId) || elementId;
        
        // Calculate x_index based on element position in dataset1
        // This ensures proper grid layout in the Tesseract visualization
        const xIndex = problemShape.dataset1.elements.findIndex(e => 
          e.id === resolvedElementId || e.id.startsWith(elementId) || resolvedElementId.startsWith(e.id.slice(0, 8))
        );
        const finalXIndex = xIndex >= 0 ? xIndex : 0;
        
        // Get the element label from problemShape if not provided
        const finalLabel = elementLabel || 
          problemShape.dataset1.elements.find(e => e.id === resolvedElementId)?.label || 
          `Element ${finalXIndex}`;
        
        await rpc("upsert_audit_tesseract_cell_with_token", {
          p_session_id: sessionId,
          p_x_element_id: resolvedElementId,
          p_x_element_type: problemShape.dataset1.type,
          p_x_index: finalXIndex,
          p_y_step: step,
          p_z_polarity: polarity,
          p_token: shareToken,
          p_x_element_label: finalLabel,
          p_y_step_label: stepLabel,
          p_z_criticality: criticality,
          p_evidence_summary: evidenceSummary,
          p_evidence_refs: null,
          p_contributing_agents: ["orchestrator"],
        });
        
        return { success: true, result: { elementId: resolvedElementId, xIndex: finalXIndex, step, polarity, criticality } };
      }
      
      case "finalize_venn": {
        const uniqueToD1 = params.uniqueToD1 || params.unique_to_d1 || params.gaps || [];
        const aligned = params.aligned || params.shared || params.coverage || [];
        const uniqueToD2 = params.uniqueToD2 || params.unique_to_d2 || params.orphans || [];
        const summary = params.summary || {};
        
        // Normalize items to ensure they have required fields with snake_case keys for frontend
        const normalizeItem = (item: any, category: string) => ({
          id: item.id || item.elementId || item.element_id || crypto.randomUUID(),
          label: item.label || item.name || item.title || "Unknown",
          category,
          criticality: item.criticality || "info",
          evidence: item.evidence || item.description || item.evidenceSummary || "",
          sourceElement: item.sourceElement || item.elementId || item.id,
          polarity: item.polarity ?? 0,
          description: item.description || item.evidence || "",
        });
        
        // Auto-calculate alignment score from actual aligned items
        // alignment_score = (aligned items / max(D1 count, D2 count)) * 100
        const d1Count = problemShape.dataset1.count;
        const d2Count = problemShape.dataset2.count;
        const alignedCount = aligned.length;
        const calculatedAlignmentScore = (alignedCount / Math.max(d1Count, d2Count, 1)) * 100;
        
        // Use snake_case keys for frontend compatibility
        const vennResult = {
          unique_to_d1: uniqueToD1.map((item: any) => normalizeItem(item, "unique_d1")),
          aligned: aligned.map((item: any) => normalizeItem(item, "aligned")),
          unique_to_d2: uniqueToD2.map((item: any) => normalizeItem(item, "unique_d2")),
          summary: {
            total_d1_coverage: summary.totalD1Coverage || summary.total_d1_coverage || 
              (alignedCount / Math.max(d1Count, 1) * 100),
            total_d2_coverage: summary.totalD2Coverage || summary.total_d2_coverage ||
              (alignedCount / Math.max(d2Count, 1) * 100),
            // Auto-calculate alignment_score instead of defaulting to 0
            alignment_score: summary.alignmentScore || summary.alignment_score || calculatedAlignmentScore,
            gaps: uniqueToD1.length,
            orphans: uniqueToD2.length,
            aligned: alignedCount,
          },
          generatedAt: new Date().toISOString(),
        };
        
        await rpc("update_audit_session_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_venn_result: vennResult,
          p_status: "completed",
          p_phase: "synthesis",
        });
        
        return { success: true, result: vennResult };
      }
      
      default:
        return { success: false, result: null, error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    console.error(`Tool ${toolName} error:`, err);
    return { success: false, result: null, error: String(err) };
  }
}

// ==================== CLAUDE RESPONSE TOOL SCHEMA ====================

function getClaudeResponseTool() {
  const toolParamsSchema = {
    type: "object",
    properties: {
      dataset: { type: "string", enum: ["dataset1", "dataset2"], description: "Which dataset to read from" },
      itemId: { type: "string", description: "The item ID or 8-char prefix to read" },
      filter: { type: "string", enum: ["all", "dataset1_only", "dataset2_only", "shared", "orphans"], description: "Filter nodes by source" },
      nodeType: { type: "string", description: "Filter by node type" },
      limit: { type: "integer", description: "Max results" },
      nodeId: { type: "string", description: "The knowledge graph node ID" },
      entryType: { type: "string", enum: ["plan", "finding", "observation", "question", "conclusion", "tool_result"], description: "Blackboard entry type" },
      content: { type: "string", description: "Content to write" },
      confidence: { type: "number", description: "Confidence 0-1" },
      targetAgent: { type: "string", description: "Target perspective" },
      entryTypes: { type: "array", items: { type: "string" }, description: "Entry types to filter" },
      label: { type: "string", description: "Concept label" },
      description: { type: "string", description: "Concept description" },
      sourceDataset: { type: "string", enum: ["dataset1", "dataset2", "both"], description: "Which dataset this originates from" },
      sourceElementIds: { type: "array", items: { type: "string" }, description: "Source artifact IDs (required for create_concept)" },
      sourceNodeId: { type: "string", description: "Source node (graph node ID, source element ID, or label)" },
      targetNodeId: { type: "string", description: "Target node (graph node ID, source element ID, or label)" },
      edgeType: { type: "string", enum: ["relates_to", "implements", "depends_on", "conflicts_with", "supports", "covers"], description: "Edge type" },
      elementId: { type: "string", description: "Dataset 1 element ID for tesseract" },
      elementLabel: { type: "string", description: "Element label" },
      step: { type: "integer", description: "Analysis step 1-5" },
      stepLabel: { type: "string", description: "Step label" },
      polarity: { type: "number", description: "Alignment score -1 to +1" },
      criticality: { type: "string", enum: ["critical", "major", "minor", "info"], description: "Severity" },
      evidenceSummary: { type: "string", description: "Evidence summary" },
      uniqueToD1: { type: "array", items: { type: "object" }, description: "Elements unique to D1 (gaps)" },
      aligned: { type: "array", items: { type: "object" }, description: "Elements in both datasets" },
      uniqueToD2: { type: "array", items: { type: "object" }, description: "Elements unique to D2 (orphans)" },
      summary: { type: "object", description: "Summary statistics" },
    },
    additionalProperties: false,
  };

  return {
    name: "respond_with_actions",
    description: "Return your reasoning and tool calls. You MUST use this tool to respond.",
    input_schema: {
      type: "object",
      properties: {
        thinking: { type: "string", description: "Your reasoning about what to do next" },
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
                description: "Tool to invoke" 
              },
              params: toolParamsSchema,
              rationale: { type: "string", description: "Why you're calling this tool" },
            },
            required: ["tool", "params"],
            additionalProperties: false,
          },
        },
        continueAnalysis: { type: "boolean", description: "true to continue, false only after finalize_venn" },
      },
      required: ["thinking", "toolCalls", "continueAnalysis"],
      additionalProperties: false,
    },
  };
}

// ==================== BUILD PROBLEM SHAPE ====================

// Helper to extract elements from ProjectSelectionResult content
function extractElementsFromContent(
  content: any
): Array<{ id: string; label: string; content?: string; category: string; originalPath?: string }> {
  const elements: Array<{ id: string; label: string; content?: string; category: string; originalPath?: string }> = [];
  
  if (!content) return elements;
  
  // Requirements
  if (content.requirements && Array.isArray(content.requirements)) {
    content.requirements.forEach((r: any) => {
      elements.push({
        id: r.id,
        label: r.title || r.code || r.text?.slice(0, 50) || "Requirement",
        content: r.description || r.text || "",
        category: "requirements",
      });
    });
  }
  
  // Artifacts
  if (content.artifacts && Array.isArray(content.artifacts)) {
    content.artifacts.forEach((a: any) => {
      elements.push({
        id: a.id,
        label: a.ai_title || a.content?.slice(0, 50) || "Artifact",
        content: a.content?.slice(0, 500) || "",
        category: "artifacts",
      });
    });
  }
  
  // Standards
  if (content.standards && Array.isArray(content.standards)) {
    content.standards.forEach((s: any) => {
      elements.push({
        id: s.id,
        label: s.code ? `${s.code}: ${s.title}` : (s.title || "Standard"),
        content: s.description || "",
        category: "standards",
      });
    });
  }
  
  // Tech Stacks
  if (content.techStacks && Array.isArray(content.techStacks)) {
    content.techStacks.forEach((t: any) => {
      elements.push({
        id: t.id,
        label: t.name || "Tech Stack",
        content: t.description || `Type: ${t.type}`,
        category: "techStacks",
      });
    });
  }
  
  // Canvas Nodes
  if (content.canvasNodes && Array.isArray(content.canvasNodes)) {
    content.canvasNodes.forEach((n: any) => {
      elements.push({
        id: n.id,
        label: n.data?.label || n.type || "Node",
        content: JSON.stringify(n.data || {}),
        category: "canvas",
      });
    });
  }
  
  // Files - IMPORTANT: file.path is NOT a UUID, so we need to generate a stable ID
  // We use the existing f.id if available, otherwise generate a deterministic UUID from the path
  if (content.files && Array.isArray(content.files)) {
    content.files.forEach((f: any, index: number) => {
      // Use real ID if available, otherwise create a stable pseudo-UUID from path hash
      const fileId = f.id || generateStableFileId(f.path, index);
      elements.push({
        id: fileId,
        label: f.path || "File",
        content: f.content?.slice(0, 500) || "",
        category: "files",
        // Store the original path so we can reference it
        originalPath: f.path,
      });
    });
  }
  
  // Databases
  if (content.databases && Array.isArray(content.databases)) {
    content.databases.forEach((d: any) => {
      elements.push({
        id: d.name || d.databaseId,
        label: `${d.schemaName}.${d.name}` || "Database Object",
        content: d.definition || JSON.stringify(d.columns || {}),
        category: "databases",
      });
    });
  }
  
  // Chat Sessions
  if (content.chatSessions && Array.isArray(content.chatSessions)) {
    content.chatSessions.forEach((c: any) => {
      elements.push({
        id: c.id,
        label: c.title || c.ai_title || "Chat Session",
        content: c.ai_summary || "",
        category: "chats",
      });
    });
  }
  
  // Project Metadata
  if (content.projectMetadata) {
    elements.push({
      id: content.projectMetadata.id || "metadata",
      label: content.projectMetadata.name || "Project",
      content: content.projectMetadata.description || "",
      category: "metadata",
    });
  }
  
  return elements;
}

async function buildProblemShape(
  supabase: any,
  session: any,
  projectId: string,
  shareToken: string
): Promise<ProblemShape> {
  let d1Elements: Array<{ id: string; label: string; content?: string; category?: string }> = [];
  let d2Elements: Array<{ id: string; label: string; content?: string; category?: string }> = [];
  let d1Type = session.dataset_1_type || "mixed";
  let d2Type = session.dataset_2_type || "mixed";

  // NEW: Check for JSONB content first (new format with ProjectSelectionResult)
  if (session.dataset_1_content) {
    d1Elements = extractElementsFromContent(session.dataset_1_content);
    d1Type = d1Elements.length > 0 ? "mixed" : session.dataset_1_type;
  }
  
  if (session.dataset_2_content) {
    d2Elements = extractElementsFromContent(session.dataset_2_content);
    d2Type = d2Elements.length > 0 ? "mixed" : session.dataset_2_type;
  }

  // LEGACY FALLBACK: If no content, use the old type+ids approach
  if (d1Elements.length === 0 && session.dataset_1_type) {
    const d1Ids = session.dataset_1_ids || [];
    d1Type = session.dataset_1_type;
    
    if (d1Type === "requirements") {
      const { data } = await supabase.rpc("get_requirements_with_token", { p_project_id: projectId, p_token: shareToken });
      const requirements = data || [];
      d1Elements = (d1Ids.length > 0 ? requirements.filter((r: any) => d1Ids.includes(r.id)) : requirements)
        .map((r: any) => ({ id: r.id, label: r.title, content: r.description, category: "requirements" }));
    } else if (d1Type === "canvas_nodes") {
      const { data } = await supabase.rpc("get_canvas_nodes_with_token", { p_project_id: projectId, p_token: shareToken });
      const nodes = data || [];
      d1Elements = (d1Ids.length > 0 ? nodes.filter((n: any) => d1Ids.includes(n.id)) : nodes)
        .map((n: any) => ({ id: n.id, label: (n.data as any)?.label || n.type, content: JSON.stringify(n.data), category: "canvas" }));
    } else if (d1Type === "artifacts") {
      const { data } = await supabase.rpc("get_artifacts_with_token", { p_project_id: projectId, p_token: shareToken });
      const artifacts = data || [];
      d1Elements = (d1Ids.length > 0 ? artifacts.filter((a: any) => d1Ids.includes(a.id)) : artifacts)
        .map((a: any) => ({ id: a.id, label: a.ai_title || "Artifact", content: a.content?.slice(0, 500), category: "artifacts" }));
    } else if (d1Type === "standards") {
      const { data: allStandards } = await supabase
        .from("standards")
        .select("id, code, title, description")
        .in("id", d1Ids.length > 0 ? d1Ids : []);
      d1Elements = (allStandards || []).map((s: any) => ({
        id: s.id,
        label: s.code ? `${s.code}: ${s.title}` : s.title,
        content: s.description || "",
        category: "standards",
      }));
    } else if (d1Type === "tech_stacks") {
      const { data: allTechStacks } = await supabase
        .from("tech_stacks")
        .select("id, name, description, type")
        .in("id", d1Ids.length > 0 ? d1Ids : []);
      d1Elements = (allTechStacks || []).map((t: any) => ({
        id: t.id,
        label: t.name,
        content: t.description || `Tech stack of type: ${t.type}`,
        category: "techStacks",
      }));
    }
  }

  // LEGACY FALLBACK for Dataset 2
  if (d2Elements.length === 0 && session.dataset_2_type) {
    const d2Ids = session.dataset_2_ids || [];
    d2Type = session.dataset_2_type;
    
    if (d2Type === "requirements") {
      const { data } = await supabase.rpc("get_requirements_with_token", { p_project_id: projectId, p_token: shareToken });
      const requirements = data || [];
      d2Elements = (d2Ids.length > 0 ? requirements.filter((r: any) => d2Ids.includes(r.id)) : requirements)
        .map((r: any) => ({ id: r.id, label: r.title, content: r.description, category: "requirements" }));
    } else if (d2Type === "canvas_nodes") {
      const { data } = await supabase.rpc("get_canvas_nodes_with_token", { p_project_id: projectId, p_token: shareToken });
      const nodes = data || [];
      d2Elements = (d2Ids.length > 0 ? nodes.filter((n: any) => d2Ids.includes(n.id)) : nodes)
        .map((n: any) => ({ id: n.id, label: (n.data as any)?.label || n.type, content: JSON.stringify(n.data), category: "canvas" }));
    } else if (d2Type === "repository") {
      const { data: repos } = await supabase.rpc("get_repos_with_token", { p_project_id: projectId, p_token: shareToken });
      const primeRepo = repos?.find((r: any) => r.is_prime) || repos?.[0];
      if (primeRepo) {
        const { data: files } = await supabase.rpc("get_repo_files_with_token", { p_repo_id: primeRepo.id, p_token: shareToken });
        d2Elements = (files || []).slice(0, 100).map((f: any) => ({ 
          id: f.id, 
          label: f.path, 
          content: f.content?.slice(0, 500),
          category: "files",
        }));
      }
    } else if (d2Type === "artifacts") {
      const { data } = await supabase.rpc("get_artifacts_with_token", { p_project_id: projectId, p_token: shareToken });
      const artifacts = data || [];
      d2Elements = (d2Ids.length > 0 ? artifacts.filter((a: any) => d2Ids.includes(a.id)) : artifacts)
        .map((a: any) => ({ id: a.id, label: a.ai_title || "Artifact", content: a.content?.slice(0, 500), category: "artifacts" }));
    } else if (d2Type === "standards") {
      const { data: allStandards } = await supabase
        .from("standards")
        .select("id, code, title, description")
        .in("id", d2Ids.length > 0 ? d2Ids : []);
      d2Elements = (allStandards || []).map((s: any) => ({
        id: s.id,
        label: s.code ? `${s.code}: ${s.title}` : s.title,
        content: s.description || "",
        category: "standards",
      }));
    } else if (d2Type === "tech_stacks") {
      const { data: allTechStacks } = await supabase
        .from("tech_stacks")
        .select("id, name, description, type")
        .in("id", d2Ids.length > 0 ? d2Ids : []);
      d2Elements = (allTechStacks || []).map((t: any) => ({
        id: t.id,
        label: t.name,
        content: t.description || `Tech stack of type: ${t.type}`,
        category: "techStacks",
      }));
    }
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

// ==================== BUILD CONTEXT SUMMARY ====================

async function buildContextSummary(
  supabase: any,
  sessionId: string,
  shareToken: string,
  iteration: number,
  currentPhase: string
): Promise<string> {
  // Get current blackboard entries (last 10)
  const { data: blackboard } = await supabase.rpc("get_audit_blackboard_with_token", {
    p_session_id: sessionId,
    p_token: shareToken,
  });
  
  // Get graph stats
  const { data: nodes } = await supabase.rpc("get_audit_graph_nodes_with_token", {
    p_session_id: sessionId,
    p_token: shareToken,
  });
  
  const { data: edges } = await supabase.rpc("get_audit_graph_edges_with_token", {
    p_session_id: sessionId,
    p_token: shareToken,
  });
  
  const allBlackboard = blackboard || [];
  const recentBlackboard = allBlackboard.slice(-10);
  const blackboardSummary = recentBlackboard.length > 0
    ? recentBlackboard.map((e: any) => `[${e.entry_type}] ${e.content.slice(0, 200)}`).join("\n")
    : "(empty - use write_blackboard to record your thoughts!)";
  
  const nodeCount = (nodes || []).length;
  const edgeCount = (edges || []).length;
  const d1Nodes = (nodes || []).filter((n: any) => n.source_dataset === "dataset1").length;
  const d2Nodes = (nodes || []).filter((n: any) => n.source_dataset === "dataset2").length;
  const sharedNodes = (nodes || []).filter((n: any) => n.source_dataset === "both").length;
  
  // Blackboard usage warning
  let blackboardWarning = "";
  if (iteration > 3 && allBlackboard.length < Math.floor(iteration / 2)) {
    blackboardWarning = `\n\n⚠️ WARNING: You have only ${allBlackboard.length} blackboard entries after ${iteration} iterations!
You MUST write to the blackboard more frequently. The blackboard is your checkpoint - if the analysis restarts, we lose progress without it.
Call write_blackboard NOW with your current findings before proceeding with other tools!`;
  }
  
  return `## CURRENT STATE (Iteration ${iteration}, Phase: ${currentPhase})

### Knowledge Graph
- Total Nodes: ${nodeCount} (D1: ${d1Nodes}, D2: ${d2Nodes}, Shared: ${sharedNodes})
- Total Edges: ${edgeCount}

### Blackboard Entries: ${allBlackboard.length} total
${blackboardSummary}
${blackboardWarning}

### Your Next Steps
Based on phase ${currentPhase}, you should:
${currentPhase === "graph_building" ? "- Read more dataset items\n- Create concept nodes\n- Link related concepts\n- Write findings to blackboard" : ""}
${currentPhase === "gap_analysis" ? "- Query graph for gaps (dataset1_only)\n- Query graph for orphans (dataset2_only)\n- Record findings to blackboard" : ""}
${currentPhase === "deep_analysis" ? "- Record tesseract cells for D1 elements\n- Assess coverage quality\n- Write conclusions to blackboard" : ""}
${currentPhase === "synthesis" ? "- Review blackboard findings\n- Call finalize_venn with your results\n- Set continueAnalysis=false" : ""}

CALL YOUR TOOLS NOW!`;
}

// ==================== BUILD RESUME CONTEXT ====================

async function buildResumeContext(
  supabase: any,
  sessionId: string,
  shareToken: string,
  session: any,
  problemShape: ProblemShape
): Promise<string> {
  // Get all blackboard entries for context
  const { data: blackboard } = await supabase.rpc("get_audit_blackboard_with_token", {
    p_session_id: sessionId,
    p_token: shareToken,
  });
  
  // Get graph stats
  const { data: nodes } = await supabase.rpc("get_audit_graph_nodes_with_token", {
    p_session_id: sessionId,
    p_token: shareToken,
  });
  
  const { data: edges } = await supabase.rpc("get_audit_graph_edges_with_token", {
    p_session_id: sessionId,
    p_token: shareToken,
  });
  
  const allBlackboard = blackboard || [];
  const nodeCount = (nodes || []).length;
  const edgeCount = (edges || []).length;
  const d1Nodes = (nodes || []).filter((n: any) => n.source_dataset === "dataset1").length;
  const d2Nodes = (nodes || []).filter((n: any) => n.source_dataset === "dataset2").length;
  const sharedNodes = (nodes || []).filter((n: any) => n.source_dataset === "both").length;
  
  // Build summary of blackboard entries by type
  const entryTypes: Record<string, string[]> = {};
  for (const entry of allBlackboard) {
    if (!entryTypes[entry.entry_type]) {
      entryTypes[entry.entry_type] = [];
    }
    entryTypes[entry.entry_type].push(entry.content.slice(0, 200));
  }
  
  const blackboardSummary = Object.entries(entryTypes).map(([type, entries]) => 
    `### ${type} (${entries.length} entries)\n${entries.slice(-3).map(e => `- ${e}`).join("\n")}`
  ).join("\n\n");

  return `## RESUMING ANALYSIS

The previous analysis session was interrupted. You are resuming from where it left off.

### Session State
- **Current Iteration**: ${session.current_iteration || 0}
- **Current Phase**: ${session.phase || "graph_building"}
- **Max Iterations**: ${session.max_iterations}

### Datasets
- **Dataset 1** (${problemShape.dataset1.type}): ${problemShape.dataset1.count} elements
- **Dataset 2** (${problemShape.dataset2.type}): ${problemShape.dataset2.count} elements

### Knowledge Graph Progress
- Total Nodes: ${nodeCount} (D1: ${d1Nodes}, D2: ${d2Nodes}, Shared: ${sharedNodes})
- Total Edges: ${edgeCount}

### Blackboard Memory (${allBlackboard.length} entries)
${blackboardSummary || "(No blackboard entries yet)"}

### Instructions
1. Review the blackboard to understand what work has been completed
2. Continue from where the analysis left off
3. Do NOT repeat work that's already recorded in the blackboard
4. Continue with the ${session.phase || "graph_building"} phase

CALL YOUR TOOLS NOW to continue the analysis!`;
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

    const { sessionId, projectId, shareToken, resume = false }: AuditRequest = await req.json();
    console.log("Starting audit orchestrator v3:", { sessionId, projectId, resume });

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
          p_content: content || null,  // NO TRUNCATION - full content
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

    // If resuming, only update status to running - DO NOT reset phase or problem_shape
    if (resume) {
      await logActivity(null, "resume", "Resuming Analysis", 
        `Continuing from iteration ${session.current_iteration || 0}, phase: ${session.phase || "graph_building"}`,
        { phase: session.phase, iteration: session.current_iteration, resumed: true });

      await rpc("update_audit_session_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_status: "running",
        // Explicitly DO NOT set p_phase - keep existing phase
      });
      await broadcast("resumed", { phase: session.phase, iteration: session.current_iteration });
    } else {
      // New session - initialize from scratch
      await logActivity(null, "phase_change", PHASE_DISPLAY_NAMES["graph_building"], 
        `Starting analysis: ${problemShape.dataset1.count} ${problemShape.dataset1.type} against ${problemShape.dataset2.count} ${problemShape.dataset2.type}`,
        { phase: "graph_building", fromPhase: "initialization" });

      await rpc("update_audit_session_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_status: "running",
        p_phase: "graph_building",
        p_problem_shape: problemShape,
      });
      await broadcast("phase", { phase: "graph_building" });
    }

    // Tool execution context
    const toolContext = { supabase, sessionId, projectId, shareToken, problemShape, logActivity, rpc };

    // ==================== MAIN ORCHESTRATION LOOP ====================
    
    const MAX_ITERATIONS = session.max_iterations || 100;
    let iteration = resume ? (session.current_iteration || 0) : 0;
    let analysisComplete = false;
    let currentPhase = resume ? (session.phase || "graph_building") : "graph_building";
    let previousPhase = "initialization";
    let consecutiveEmptyToolCalls = 0;

    // Build initial user prompt with dataset summaries
    const d1Summary = problemShape.dataset1.elements.slice(0, 50).map(e => `- [${e.id.slice(0,8)}] ${e.label}`).join("\n");
    const d2Summary = problemShape.dataset2.elements.slice(0, 50).map(e => `- [${e.id.slice(0,8)}] ${e.label}`).join("\n");

    // The system prompt (sent to Claude separately)
    const systemPrompt = getSystemPrompt(problemShape);

    // Initial user message with full dataset listing
    const initialUserMessage = `## YOUR TASK

Analyze these two datasets and produce a Venn diagram showing coverage, gaps, and orphans.

## Dataset 1 Elements (${problemShape.dataset1.type}) - THE SOURCE OF TRUTH:
${d1Summary}
${problemShape.dataset1.count > 50 ? `... and ${problemShape.dataset1.count - 50} more` : ""}

## Dataset 2 Elements (${problemShape.dataset2.type}) - THE IMPLEMENTATION:
${d2Summary}
${problemShape.dataset2.count > 50 ? `... and ${problemShape.dataset2.count - 50} more` : ""}

## YOUR FIRST ACTIONS:
1. Call write_blackboard with entryType="plan" to record your analysis strategy
2. Call read_dataset_item for MULTIPLE Dataset 1 elements (batch 5-10 calls)
3. Call create_concept for major themes you identify

START NOW - call your tools!`;

    // Claude conversation state - we maintain proper tool_use/tool_result pairing
    // Format: [user_message, assistant_tool_use, user_tool_result, assistant_tool_use, ...]
    const claudeMessages: ClaudeMessage[] = [];
    let lastToolUseId: string | null = null;

    // If resuming, build resume context instead of initial message
    if (resume) {
      console.log(`Resuming from iteration ${iteration}, phase ${currentPhase}`);
      // Note: we already logged the resume activity above in the setup
      const resumeContext = await buildResumeContext(supabase, sessionId, shareToken, session, problemShape);
      claudeMessages.push({ role: "user", content: resumeContext });
    }

    while (iteration < MAX_ITERATIONS && !analysisComplete) {
      iteration++;
      console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS}, Phase: ${currentPhase} ===`);
      
      await logActivity(null, "thinking", `Iteration ${iteration}`, 
        `Phase: ${PHASE_DISPLAY_NAMES[currentPhase] || currentPhase}`,
        { iteration, phase: currentPhase, phaseDisplayName: PHASE_DISPLAY_NAMES[currentPhase] });
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

      // BUILD THE USER MESSAGE FOR THIS ITERATION
      let userMessageContent: string;
      
      if (claudeMessages.length === 0) {
        // First iteration (new session) or first iteration after resume: send the initial/resume message
        userMessageContent = initialUserMessage;
        claudeMessages.push({ role: "user", content: userMessageContent });
      }
      // For subsequent iterations, the user message (tool_result) was already added at end of previous iteration
      
      // Log what we're sending
      await logActivity("orchestrator", "llm_request", `LLM Request (Iteration ${iteration})`, 
        JSON.stringify({ 
          systemPromptLength: systemPrompt.length,
          messageCount: claudeMessages.length,
          messages: claudeMessages 
        }, null, 2)); // FULL payload, no truncation

      // CALL CLAUDE
      let response: OrchestratorResponse;
      let toolUseId: string | null = null;
      let rawContent: string = "";

      if (selectedModel.startsWith("claude")) {
        const requestPayload = {
          model: selectedModel,
          max_tokens: 32768,
          system: systemPrompt,
          messages: claudeMessages,
          tools: [getClaudeResponseTool()],
          tool_choice: { type: "tool", name: "respond_with_actions" },
        };
        
        console.log("Claude request:", JSON.stringify(requestPayload, null, 2).slice(0, 5000));
        
        const apiResponse = await fetch(apiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "prompt-caching-2024-07-31",
          },
          body: JSON.stringify(requestPayload),
        });
        
        if (!apiResponse.ok) {
          const errText = await apiResponse.text();
          console.error("Claude API error:", errText);
          throw new Error(`Claude API error: ${errText}`);
        }
        
        const data = await apiResponse.json();
        
        // Log full response (NO TRUNCATION)
        await logActivity("orchestrator", "llm_response", `LLM Response (Iteration ${iteration})`, 
          JSON.stringify(data, null, 2));
        
        // Extract the tool_use block
        const toolUseBlock = data.content?.find((c: any) => c.type === "tool_use");
        if (toolUseBlock?.input) {
          rawContent = JSON.stringify(toolUseBlock.input);
          toolUseId = toolUseBlock.id;
          response = {
            thinking: toolUseBlock.input.thinking || "",
            perspective: toolUseBlock.input.perspective,
            toolCalls: toolUseBlock.input.toolCalls || [],
            continueAnalysis: toolUseBlock.input.continueAnalysis ?? true,
          };
        } else {
          const textBlock = data.content?.find((c: any) => c.type === "text");
          console.error("Claude returned text instead of tool_use:", textBlock?.text?.slice(0, 500));
          response = {
            thinking: textBlock?.text || "Claude did not use the tool",
            toolCalls: [],
            continueAnalysis: true,
          };
        }
        
      } else if (selectedModel.startsWith("gemini")) {
        // Gemini: simple text messages
        const geminiContents = claudeMessages.map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }]
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

        const apiResponse = await fetch(`${apiEndpoint}?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        
        if (!apiResponse.ok) {
          const errText = await apiResponse.text();
          throw new Error(`Gemini API error: ${errText}`);
        }
        
        const data = await apiResponse.json();
        rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        
        await logActivity("orchestrator", "llm_response", `LLM Response (Iteration ${iteration})`, rawContent);
        
        response = parseOrchestratorResponse(rawContent);
        
      } else {
        // Grok
        const grokMessages = [
          { role: "system", content: systemPrompt },
          ...claudeMessages.map(m => ({ 
            role: m.role, 
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) 
          }))
        ];
        
        const apiResponse = await fetch(apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: selectedModel,
            messages: grokMessages,
            response_format: getGrokToolSchema(),
            max_tokens: 32768,
            temperature: 0.7,
          }),
        });
        
        if (!apiResponse.ok) {
          const errText = await apiResponse.text();
          throw new Error(`Grok API error: ${errText}`);
        }
        
        const data = await apiResponse.json();
        rawContent = data.choices?.[0]?.message?.content || "{}";
        
        await logActivity("orchestrator", "llm_response", `LLM Response (Iteration ${iteration})`, rawContent);
        
        response = parseOrchestratorResponse(rawContent);
      }

      console.log(`Response: thinking=${response.thinking.length}chars, toolCalls=${response.toolCalls.length}, continue=${response.continueAnalysis}, toolUseId=${toolUseId || 'none'}`);

      // ADD ASSISTANT RESPONSE TO CONVERSATION (for Claude, as tool_use block)
      if (selectedModel.startsWith("claude") && toolUseId) {
        claudeMessages.push({
          role: "assistant",
          content: [{
            type: "tool_use",
            id: toolUseId,
            name: "respond_with_actions",
            input: {
              thinking: response.thinking,
              perspective: response.perspective,
              toolCalls: response.toolCalls,
              continueAnalysis: response.continueAnalysis,
            }
          }]
        });
        lastToolUseId = toolUseId;
      } else if (!selectedModel.startsWith("claude")) {
        // For Gemini/Grok, use simple text
        claudeMessages.push({ role: "assistant", content: rawContent });
      }

      // Log thinking
      if (response.thinking) {
        await logActivity("orchestrator", "thinking", 
          `${response.perspective ? `[${response.perspective.toUpperCase()}] ` : ""}Orchestrator Thinking`, 
          response.thinking, { iteration, phase: currentPhase });
      }

      // EXECUTE TOOL CALLS
      let toolResults = "";
      let successCount = 0;
      let failureCount = 0;
      const failedTools: string[] = [];

      if (response.toolCalls.length === 0) {
        consecutiveEmptyToolCalls++;
        console.log(`Warning: No tool calls in iteration ${iteration} (consecutive: ${consecutiveEmptyToolCalls})`);
        
        toolResults = `## WARNING: You did not call any tools in iteration ${iteration}!
You MUST call at least one tool every iteration. Current phase: ${currentPhase}.

Available tools:
- write_blackboard: Record your findings (USE THIS!)
- read_dataset_item: Read dataset elements
- create_concept: Create knowledge graph nodes
- link_concepts: Connect existing nodes
- query_knowledge_graph: Check current graph state
- record_tesseract_cell: Record coverage analysis
- finalize_venn: Complete the analysis

CALL YOUR TOOLS NOW!`;

        if (consecutiveEmptyToolCalls >= 8) {
          console.log("Too many empty tool calls, forcing completion");
          await logActivity("orchestrator", "warning", "Analysis terminated", 
            `Stopped after ${consecutiveEmptyToolCalls} consecutive empty tool calls`);
          break;
        }
      } else {
        consecutiveEmptyToolCalls = 0;
        
        // Track if write_blackboard was called this iteration
        const blackboardCalls = response.toolCalls.filter(tc => tc.tool === "write_blackboard").length;
        
        // Separate tools into parallel-safe (reads) and sequential (writes/creates)
        const parallelSafeTools = ['read_dataset_item', 'query_knowledge_graph', 'read_blackboard', 'get_concept_links'];
        
        const parallelCalls = response.toolCalls.filter(tc => parallelSafeTools.includes(tc.tool));
        const sequentialCalls = response.toolCalls.filter(tc => !parallelSafeTools.includes(tc.tool));
        
        console.log(`Executing ${parallelCalls.length} tools in parallel, ${sequentialCalls.length} sequentially`);
        
        // Execute parallel-safe tools simultaneously
        const parallelResults = await Promise.all(
          parallelCalls.map(async (toolCall) => {
            await logActivity("orchestrator", "tool_call", `Tool: ${toolCall.tool}`, 
              JSON.stringify(toolCall.params, null, 2), { tool: toolCall.tool, iteration, phase: currentPhase });
            
            const result = await executeTool(toolCall.tool, toolCall.params, toolContext);
            return { toolCall, result };
          })
        );
        
        // Execute sequential tools (writes, creates, links) in order to maintain consistency
        const sequentialResults: Array<{ toolCall: ToolCall; result: { success: boolean; result?: unknown; error?: string } }> = [];
        for (const toolCall of sequentialCalls) {
          await logActivity("orchestrator", "tool_call", `Tool: ${toolCall.tool}`, 
            JSON.stringify(toolCall.params, null, 2), { tool: toolCall.tool, iteration, phase: currentPhase });
          
          const result = await executeTool(toolCall.tool, toolCall.params, toolContext);
          sequentialResults.push({ toolCall, result });
        }
        
        // Combine all results and process them
        const allResults = [...parallelResults, ...sequentialResults];
        
        for (const { toolCall, result } of allResults) {
          const resultSummary = result.success 
            ? (typeof result.result === "object" ? JSON.stringify(result.result) : String(result.result))
            : `Error: ${result.error}`;
          
          await logActivity("orchestrator", result.success ? "success" : "error", 
            `${toolCall.tool}: ${result.success ? "Success" : "Failed"}`, resultSummary, { iteration, phase: currentPhase });
          
          if (result.success) {
            successCount++;
            toolResults += `\n\n✓ ${toolCall.tool}: ${resultSummary}`;
          } else {
            failureCount++;
            failedTools.push(toolCall.tool);
            toolResults += `\n\n✗ ${toolCall.tool} FAILED: ${result.error}`;
          }
          
          // Update phase based on tool calls
          let newPhase = currentPhase;
          if (toolCall.tool === "finalize_venn" && result.success) {
            newPhase = "completed";
            analysisComplete = true;
          } else if (toolCall.tool === "record_tesseract_cell" && currentPhase !== "deep_analysis") {
            newPhase = "deep_analysis";
          } else if (toolCall.tool === "query_knowledge_graph" && 
                     (toolCall.params?.filter === "shared" || toolCall.params?.filter === "dataset1_only" || toolCall.params?.filter === "dataset2_only") &&
                     currentPhase === "graph_building") {
            newPhase = "gap_analysis";
          }
          
          // Log phase change if phase actually changed
          if (newPhase !== currentPhase) {
            await logActivity(null, "phase_change", 
              PHASE_DISPLAY_NAMES[newPhase] || newPhase,
              `Transitioning from ${PHASE_DISPLAY_NAMES[currentPhase]} to ${PHASE_DISPLAY_NAMES[newPhase]}`,
              { fromPhase: currentPhase, toPhase: newPhase, iteration }
            );
            previousPhase = currentPhase;
            currentPhase = newPhase;
          }
        }
        
        // ENFORCE BLACKBOARD USAGE: Add warning if no blackboard calls
        if (blackboardCalls === 0 && iteration > 1) {
          toolResults += `\n\n⚠️ BLACKBOARD WARNING: You did not call write_blackboard this iteration!
The blackboard is your ONLY persistent memory. If the analysis is interrupted, we will lose your progress without blackboard entries.
You MUST call write_blackboard with your findings, observations, or current thinking in the NEXT iteration!`;
        }
      }

      // BUILD USER MESSAGE FOR NEXT ITERATION (tool_result for Claude)
      const contextSummary = await buildContextSummary(supabase, sessionId, shareToken, iteration, currentPhase);
      
      let nextUserMessage = `## Tool Results from Iteration ${iteration}`;
      if (response.toolCalls.length > 0) {
        nextUserMessage += ` (${successCount} succeeded, ${failureCount} failed)`;
      }
      nextUserMessage += `:${toolResults}

${contextSummary}`;

      // Add guidance for failed tools
      if (failureCount > 0) {
        nextUserMessage += `\n\n## Tool Failures - Please Correct:`;
        if (failedTools.includes("link_concepts")) {
          nextUserMessage += `\n- link_concepts: Use graph node IDs from create_concept results, or query_knowledge_graph to find existing nodes.`;
        }
        if (failedTools.includes("create_concept")) {
          nextUserMessage += `\n- create_concept: Ensure sourceElementIds contains valid IDs from the datasets.`;
        }
      }

      nextUserMessage += `\n\nContinue your analysis. What's your next step?`;

      // Add to conversation
      if (selectedModel.startsWith("claude") && lastToolUseId) {
        // For Claude: wrap in tool_result
        claudeMessages.push({
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: lastToolUseId,
            content: nextUserMessage
          }]
        });
      } else {
        // For Gemini/Grok: simple text
        claudeMessages.push({ role: "user", content: nextUserMessage });
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

    await logActivity(null, "phase_change", PHASE_DISPLAY_NAMES["completed"], 
      `Finished after ${iteration} iterations. Status: ${finalStatus}`,
      { phase: "completed", fromPhase: currentPhase, totalIterations: iteration });
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
