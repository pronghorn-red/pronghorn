// Hook for orchestrating the new audit pipeline
// Streams SSE events and tracks progress for each phase

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PipelinePhase = 
  | "idle" 
  | "creating_nodes"
  | "extracting_d1" 
  | "extracting_d2" 
  | "merging_concepts" 
  | "building_graph"
  | "building_tesseract" 
  | "generating_venn" 
  | "completed" 
  | "error";

export interface PipelineProgress {
  phase: PipelinePhase;
  message: string;
  progress: number;
  d1ConceptCount?: number;
  d2ConceptCount?: number;
  mergedCount?: number;
}

export interface PipelineStep {
  id: string;
  phase: PipelinePhase;
  title: string;
  status: "pending" | "running" | "completed" | "error";
  message: string;
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  details?: string[];
}

interface Concept {
  label: string;
  description: string;
  elementIds: string[];
}

interface MergedConcept {
  mergedLabel: string;
  mergedDescription: string;
  d1ConceptLabels: string[];
  d2ConceptLabels: string[];
  d1Ids: string[];
  d2Ids: string[];
}

interface Element {
  id: string;
  label: string;
  content: string;
  category?: string;
}

interface PipelineInput {
  sessionId: string;
  projectId: string;
  shareToken: string;
  d1Elements: Element[];
  d2Elements: Element[];
}

const BASE_URL = "https://obkzdksfayygnrzdqoam.supabase.co/functions/v1";

// Parse SSE stream and call callbacks for each event
async function streamSSE(
  response: Response,
  onProgress: (data: any) => void,
  onConcept: (data: any) => void,
  onResult: (data: any) => void,
  onError: (error: string) => void
): Promise<any> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let result: any = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      // Process complete events (separated by double newline)
      const events = buffer.split("\n\n");
      // Keep incomplete last part in buffer
      buffer = events.pop() || "";
      
      for (const eventBlock of events) {
        if (!eventBlock.trim()) continue;
        
        const lines = eventBlock.split("\n");
        let eventType = "";
        let dataStr = "";
        
        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataStr = line.slice(5).trim();
          }
        }
        
        if (!eventType || !dataStr) continue;
        
        try {
          const data = JSON.parse(dataStr);
          switch (eventType) {
            case "progress":
              onProgress(data);
              break;
            case "concept":
              onConcept(data);
              break;
            case "result":
              result = data;
              onResult(data);
              break;
            case "done":
              // Stream complete - ignore
              break;
            case "error":
              onError(data.message || String(data));
              break;
          }
        } catch {
          // Skip unparseable data
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return result;
}

export function useAuditPipeline() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress>({ phase: "idle", message: "", progress: 0 });
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const updateStep = useCallback((id: string, updates: Partial<PipelineStep>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const addStepDetail = useCallback((id: string, detail: string) => {
    setSteps(prev => prev.map(s => {
      if (s.id !== id) return s;
      return { ...s, details: [...(s.details || []), detail] };
    }));
  }, []);

  const runPipeline = useCallback(async (input: PipelineInput) => {
    setIsRunning(true);
    setError(null);
    abortRef.current = false;

    const { sessionId, projectId, shareToken, d1Elements, d2Elements } = input;

    // Initialize steps
    const initialSteps: PipelineStep[] = [
      { id: "nodes", phase: "creating_nodes", title: "Create Graph Nodes", status: "pending", message: "Waiting...", progress: 0 },
      { id: "d1", phase: "extracting_d1", title: `Extract D1 Concepts (${d1Elements.length} items)`, status: "pending", message: "Waiting...", progress: 0 },
      { id: "d2", phase: "extracting_d2", title: `Extract D2 Concepts (${d2Elements.length} items)`, status: "pending", message: "Waiting...", progress: 0 },
      { id: "merge", phase: "merging_concepts", title: "Merge Concepts", status: "pending", message: "Waiting...", progress: 0 },
      { id: "graph", phase: "building_graph", title: "Build Graph Edges", status: "pending", message: "Waiting...", progress: 0 },
      { id: "tesseract", phase: "building_tesseract", title: "Build Tesseract", status: "pending", message: "Waiting...", progress: 0 },
      { id: "venn", phase: "generating_venn", title: "Generate Venn Analysis", status: "pending", message: "Waiting...", progress: 0 },
    ];
    setSteps(initialSteps);

    let d1Concepts: Concept[] = [];
    let d2Concepts: Concept[] = [];
    let mergedConcepts: MergedConcept[] = [];
    let unmergedD1Concepts: Concept[] = [];
    let unmergedD2Concepts: Concept[] = [];

    try {
      // ========================================
      // PHASE 0: Create D1 and D2 nodes immediately
      // ========================================
      setProgress({ phase: "creating_nodes", message: `Creating ${d1Elements.length + d2Elements.length} nodes...`, progress: 5 });
      updateStep("nodes", { status: "running", message: "Creating nodes...", startedAt: new Date() });

      // Create all D1 nodes - log EVERY node, no truncation
      for (let i = 0; i < d1Elements.length; i++) {
        const element = d1Elements[i];
        const { error } = await supabase.rpc("upsert_audit_graph_node_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_label: element.label,
          p_description: (element.content || "").slice(0, 2000),
          p_node_type: "d1_element",
          p_source_dataset: "dataset1",
          p_source_element_ids: [element.id],
          p_created_by_agent: "pipeline",
          p_color: "#3b82f6",
          p_size: 15,
          p_metadata: { category: element.category || "unknown" },
        });
        // Log EVERY node created, no skipping
        addStepDetail("nodes", `Created D1 node: ${element.label.slice(0, 60)}${error ? ` (ERROR: ${error.message})` : ""}`);
      }

      // Create all D2 nodes - log EVERY node, no truncation
      for (let i = 0; i < d2Elements.length; i++) {
        const element = d2Elements[i];
        const { error } = await supabase.rpc("upsert_audit_graph_node_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_label: element.label,
          p_description: (element.content || "").slice(0, 2000),
          p_node_type: "d2_element",
          p_source_dataset: "dataset2",
          p_source_element_ids: [element.id],
          p_created_by_agent: "pipeline",
          p_color: "#22c55e",
          p_size: 15,
          p_metadata: { category: element.category || "unknown" },
        });
        // Log EVERY node created, no skipping
        addStepDetail("nodes", `Created D2 node: ${element.label.slice(0, 60)}${error ? ` (ERROR: ${error.message})` : ""}`);
      }

      updateStep("nodes", { status: "completed", message: `Created ${d1Elements.length + d2Elements.length} nodes`, progress: 100, completedAt: new Date() });

      // Update session status
      await supabase.rpc("update_audit_session_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_status: "running",
        p_phase: "extracting_concepts",
      });

      if (abortRef.current) throw new Error("Aborted");

      // ========================================
      // PHASE 1: Extract D1 and D2 concepts in parallel
      // If content is > 50k chars, batch the extraction calls
      // ========================================
      
      // Calculate character counts upfront
      const d1TotalChars = d1Elements.reduce((sum, e) => sum + (e.content?.length || 0), 0);
      const d2TotalChars = d2Elements.reduce((sum, e) => sum + (e.content?.length || 0), 0);
      const d1EstTokens = Math.ceil(d1TotalChars / 4);
      const d2EstTokens = Math.ceil(d2TotalChars / 4);
      
      const BATCH_CHAR_LIMIT = 50000; // 50k chars per batch
      
      // Helper to batch elements by character count - only if total exceeds limit
      const batchByCharLimit = (elements: Element[], limit: number, totalChars: number): Element[][] => {
        // If total chars fits in one batch, send all at once
        if (totalChars <= limit) {
          return [elements];
        }
        
        // Otherwise split by character count
        const batches: Element[][] = [];
        let currentBatch: Element[] = [];
        let currentChars = 0;
        
        for (const el of elements) {
          const elChars = el.content?.length || 0;
          if (currentChars + elChars > limit && currentBatch.length > 0) {
            batches.push(currentBatch);
            currentBatch = [];
            currentChars = 0;
          }
          currentBatch.push(el);
          currentChars += elChars;
        }
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
        }
        return batches;
      };
      
      // Create batches - D1 likely stays as 1 batch, D2 gets split
      const d1Batches = batchByCharLimit(d1Elements, BATCH_CHAR_LIMIT, d1TotalChars);
      const d2Batches = batchByCharLimit(d2Elements, BATCH_CHAR_LIMIT, d2TotalChars);
      
      setProgress({ phase: "extracting_d1", message: "Extracting concepts...", progress: 15 });
      updateStep("d1", { 
        status: "running", 
        message: `${d1TotalChars.toLocaleString()} chars (~${d1EstTokens.toLocaleString()} tokens) in ${d1Batches.length} batch(es)`, 
        startedAt: new Date() 
      });
      addStepDetail("d1", `Total content: ${d1TotalChars.toLocaleString()} chars (~${d1EstTokens.toLocaleString()} tokens) → ${d1Batches.length} batch(es)`);
      
      updateStep("d2", { 
        status: "running", 
        message: `${d2TotalChars.toLocaleString()} chars (~${d2EstTokens.toLocaleString()} tokens) in ${d2Batches.length} batch(es)`, 
        startedAt: new Date() 
      });
      addStepDetail("d2", `Total content: ${d2TotalChars.toLocaleString()} chars (~${d2EstTokens.toLocaleString()} tokens) → ${d2Batches.length} batch(es)`);

      // Helper to extract concepts from a batch
      const extractBatch = async (
        dataset: "d1" | "d2",
        batchElements: Element[],
        batchIndex: number,
        totalBatches: number,
        stepId: string
      ): Promise<Concept[]> => {
        const batchChars = batchElements.reduce((sum, e) => sum + (e.content?.length || 0), 0);
        addStepDetail(stepId, `Batch ${batchIndex + 1}/${totalBatches}: ${batchElements.length} elements, ${batchChars.toLocaleString()} chars`);
        
        const response = await fetch(`${BASE_URL}/audit-extract-concepts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, projectId, shareToken, dataset, elements: batchElements }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[${stepId}] Batch ${batchIndex + 1} HTTP error:`, response.status, errorText);
          addStepDetail(stepId, `Batch ${batchIndex + 1} ERROR: ${errorText.slice(0, 100)}`);
          return [];
        }
        
        const concepts: Concept[] = [];
        await streamSSE(
          response,
          (data) => {
            updateStep(stepId, { 
              message: `Batch ${batchIndex + 1}/${totalBatches}: ${data.message}`, 
              progress: Math.round((batchIndex / totalBatches) * 100 + (data.progress / totalBatches))
            });
          },
          (data) => addStepDetail(stepId, `Batch ${batchIndex + 1}: ${data.label} (${data.elementCount} elements)`),
          (data) => {
            concepts.push(...(data.concepts || []));
            addStepDetail(stepId, `Batch ${batchIndex + 1} complete: ${data.concepts?.length || 0} concepts`);
          },
          (err) => {
            console.error(`[${stepId}] Batch ${batchIndex + 1} stream error:`, err);
            addStepDetail(stepId, `Batch ${batchIndex + 1} stream error: ${err}`);
          }
        );
        return concepts;
      };

      // Process all batches for D1 and D2 in parallel
      const processAllBatches = async (
        dataset: "d1" | "d2",
        batches: Element[][],
        stepId: string
      ): Promise<Concept[]> => {
        const allConcepts: Concept[] = [];
        for (let i = 0; i < batches.length; i++) {
          if (abortRef.current) throw new Error("Aborted");
          const batchConcepts = await extractBatch(dataset, batches[i], i, batches.length, stepId);
          allConcepts.push(...batchConcepts);
        }
        return allConcepts;
      };

      // Run D1 and D2 extraction in parallel
      const [d1Result, d2Result] = await Promise.allSettled([
        processAllBatches("d1", d1Batches, "d1"),
        processAllBatches("d2", d2Batches, "d2"),
      ]);

      // Get results from parallel execution
      if (d1Result.status === "fulfilled") {
        d1Concepts = d1Result.value;
        updateStep("d1", { 
          status: "completed", 
          message: `${d1Concepts.length} concepts extracted`, 
          progress: 100, 
          completedAt: new Date() 
        });
      } else {
        console.error("[d1] Extraction failed:", d1Result.reason);
        updateStep("d1", { status: "error", message: String(d1Result.reason) });
      }

      if (d2Result.status === "fulfilled") {
        d2Concepts = d2Result.value;
        updateStep("d2", { 
          status: "completed", 
          message: `${d2Concepts.length} concepts extracted`, 
          progress: 100, 
          completedAt: new Date() 
        });
      } else {
        console.error("[d2] Extraction failed:", d2Result.reason);
        updateStep("d2", { status: "error", message: String(d2Result.reason) });
      }

      setProgress({ 
        phase: "merging_concepts", 
        message: `Merging ${d1Concepts.length} D1 and ${d2Concepts.length} D2 concepts...`, 
        progress: 35,
        d1ConceptCount: d1Concepts.length,
        d2ConceptCount: d2Concepts.length
      });

      if (abortRef.current) throw new Error("Aborted");

      // ========================================
      // PHASE 2: Merge concepts
      // ========================================
      updateStep("merge", { status: "running", message: "Calling merge LLM...", startedAt: new Date() });

      const d1ForMerge = d1Concepts.map(c => ({ label: c.label, description: c.description, d1Ids: c.elementIds }));
      const d2ForMerge = d2Concepts.map(c => ({ label: c.label, description: c.description, d2Ids: c.elementIds }));

      const mergeResponse = await fetch(`${BASE_URL}/audit-merge-concepts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, projectId, shareToken, d1Concepts: d1ForMerge, d2Concepts: d2ForMerge }),
      });

      if (!mergeResponse.ok) {
        const errorText = await mergeResponse.text();
        throw new Error(`Merge failed: ${mergeResponse.status} - ${errorText.slice(0, 100)}`);
      }

      // Parse SSE stream from merge endpoint
      await streamSSE(
        mergeResponse,
        (data) => {
          updateStep("merge", { message: data.message || "Merging...", progress: data.progress || 50 });
        },
        () => {}, // no individual concepts streamed
        (data) => {
          // Result event contains the merged data
          mergedConcepts = data.mergedConcepts || [];
          unmergedD1Concepts = (data.unmergedD1Concepts || []).map((c: any) => ({
            label: c.label,
            description: c.description,
            elementIds: c.d1Ids || [],
          }));
          unmergedD2Concepts = (data.unmergedD2Concepts || []).map((c: any) => ({
            label: c.label,
            description: c.description,
            elementIds: c.d2Ids || [],
          }));
        },
        (err) => {
          throw new Error(`Merge stream error: ${err}`);
        }
      );

      updateStep("merge", { 
        status: "completed", 
        message: `${mergedConcepts.length} merged, ${unmergedD1Concepts.length} gaps, ${unmergedD2Concepts.length} orphans`, 
        progress: 100, 
        completedAt: new Date() 
      });

      setProgress({ 
        phase: "building_graph", 
        message: `Creating concept nodes and edges...`, 
        progress: 50,
        mergedCount: mergedConcepts.length
      });

      if (abortRef.current) throw new Error("Aborted");

      // ========================================
      // PHASE 2.5: Build graph edges
      // ========================================
      updateStep("graph", { status: "running", message: "Fetching nodes...", startedAt: new Date() });

      const { data: allNodes } = await supabase.rpc("get_audit_graph_nodes_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
      });

      // Create merged concept nodes and edges
      for (const concept of mergedConcepts) {
        const { data: conceptNode } = await supabase.rpc("upsert_audit_graph_node_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_label: concept.mergedLabel,
          p_description: concept.mergedDescription,
          p_node_type: "concept",
          p_source_dataset: "both",
          p_source_element_ids: [...concept.d1Ids, ...concept.d2Ids],
          p_created_by_agent: "pipeline",
          p_color: "#a855f7",
          p_size: 25,
          p_metadata: { merged: true },
        });

        if (conceptNode?.id) {
          for (const d1Id of concept.d1Ids) {
            const d1Node = allNodes?.find((n: any) => n.source_element_ids?.includes(d1Id));
            if (d1Node) {
              await supabase.rpc("insert_audit_graph_edge_with_token", {
                p_session_id: sessionId,
                p_token: shareToken,
                p_source_node_id: d1Node.id,
                p_target_node_id: conceptNode.id,
                p_edge_type: "defines",
                p_label: "defines",
                p_weight: 1.0,
                p_created_by_agent: "pipeline",
                p_metadata: {},
              });
            }
          }
          for (const d2Id of concept.d2Ids) {
            const d2Node = allNodes?.find((n: any) => n.source_element_ids?.includes(d2Id));
            if (d2Node) {
              await supabase.rpc("insert_audit_graph_edge_with_token", {
                p_session_id: sessionId,
                p_token: shareToken,
                p_source_node_id: d2Node.id,
                p_target_node_id: conceptNode.id,
                p_edge_type: "implements",
                p_label: "implements",
                p_weight: 1.0,
                p_created_by_agent: "pipeline",
                p_metadata: {},
              });
            }
          }
        }
        addStepDetail("graph", `Created merged concept: ${concept.mergedLabel}`);
      }

      // Create gap concept nodes
      for (const concept of unmergedD1Concepts) {
        const { data: gapNode } = await supabase.rpc("upsert_audit_graph_node_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_label: concept.label,
          p_description: concept.description,
          p_node_type: "concept",
          p_source_dataset: "dataset1",
          p_source_element_ids: concept.elementIds,
          p_created_by_agent: "pipeline",
          p_color: "#ef4444",
          p_size: 22,
          p_metadata: { gap: true },
        });
        if (gapNode?.id) {
          for (const d1Id of concept.elementIds) {
            const d1Node = allNodes?.find((n: any) => n.source_element_ids?.includes(d1Id));
            if (d1Node) {
              await supabase.rpc("insert_audit_graph_edge_with_token", {
                p_session_id: sessionId,
                p_token: shareToken,
                p_source_node_id: d1Node.id,
                p_target_node_id: gapNode.id,
                p_edge_type: "defines",
                p_label: "defines",
                p_weight: 1.0,
                p_created_by_agent: "pipeline",
                p_metadata: {},
              });
            }
          }
        }
        addStepDetail("graph", `Created gap concept: ${concept.label}`);
      }

      // Create orphan concept nodes
      for (const concept of unmergedD2Concepts) {
        const { data: orphanNode } = await supabase.rpc("upsert_audit_graph_node_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_label: concept.label,
          p_description: concept.description,
          p_node_type: "concept",
          p_source_dataset: "dataset2",
          p_source_element_ids: concept.elementIds,
          p_created_by_agent: "pipeline",
          p_color: "#f59e0b",
          p_size: 22,
          p_metadata: { orphan: true },
        });
        if (orphanNode?.id) {
          for (const d2Id of concept.elementIds) {
            const d2Node = allNodes?.find((n: any) => n.source_element_ids?.includes(d2Id));
            if (d2Node) {
              await supabase.rpc("insert_audit_graph_edge_with_token", {
                p_session_id: sessionId,
                p_token: shareToken,
                p_source_node_id: d2Node.id,
                p_target_node_id: orphanNode.id,
                p_edge_type: "implements",
                p_label: "implements",
                p_weight: 1.0,
                p_created_by_agent: "pipeline",
                p_metadata: {},
              });
            }
          }
        }
        addStepDetail("graph", `Created orphan concept: ${concept.label}`);
      }

      updateStep("graph", { status: "completed", message: "Graph built", progress: 100, completedAt: new Date() });

      setProgress({ phase: "building_tesseract", message: "Analyzing alignment...", progress: 65 });

      if (abortRef.current) throw new Error("Aborted");

      // ========================================
      // PHASE 3: Build tesseract
      // ========================================
      updateStep("tesseract", { status: "running", message: "Analyzing concepts...", startedAt: new Date() });

      const tesseractResponse = await fetch(`${BASE_URL}/audit-build-tesseract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, projectId, shareToken, mergedConcepts, d1Elements, d2Elements }),
      });

      let tesseractCells: any[] = [];
      if (tesseractResponse.ok) {
        const tesseractResult = await tesseractResponse.json();
        tesseractCells = tesseractResult?.cells || [];
        updateStep("tesseract", { status: "completed", message: `${tesseractCells.length} cells`, progress: 100, completedAt: new Date() });
      } else {
        updateStep("tesseract", { status: "error", message: "Failed", progress: 0 });
      }

      setProgress({ phase: "generating_venn", message: "Generating Venn...", progress: 85 });

      if (abortRef.current) throw new Error("Aborted");

      // ========================================
      // PHASE 4: Generate Venn
      // ========================================
      updateStep("venn", { status: "running", message: "Generating analysis...", startedAt: new Date() });

      await fetch(`${BASE_URL}/audit-generate-venn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId, projectId, shareToken,
          mergedConcepts,
          unmergedD1Concepts: unmergedD1Concepts.map(c => ({ ...c, d1Ids: c.elementIds })),
          unmergedD2Concepts: unmergedD2Concepts.map(c => ({ ...c, d2Ids: c.elementIds })),
          tesseractCells,
          d1Count: d1Elements.length,
          d2Count: d2Elements.length
        }),
      });

      updateStep("venn", { status: "completed", message: "Complete", progress: 100, completedAt: new Date() });

      // Update session to completed
      await supabase.rpc("update_audit_session_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_status: "completed",
        p_phase: "completed",
      });

      setProgress({ phase: "completed", message: "Pipeline complete!", progress: 100 });

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[Pipeline] Error:", errMsg);
      setError(errMsg);
      setProgress({ phase: "error", message: errMsg, progress: 0 });

      await supabase.rpc("update_audit_session_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_status: "failed",
      });
    } finally {
      setIsRunning(false);
    }
  }, [updateStep, addStepDetail]);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { runPipeline, isRunning, progress, steps, error, abort };
}
