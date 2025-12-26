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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ") && currentEvent) {
        try {
          const data = JSON.parse(line.slice(6));
          switch (currentEvent) {
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
            case "error":
              onError(data.message);
              break;
          }
        } catch (e) {
          console.warn("Failed to parse SSE data:", line);
        }
        currentEvent = "";
      }
    }
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
      // ========================================
      
      // Calculate character counts upfront
      const d1TotalChars = d1Elements.reduce((sum, e) => sum + (e.content?.length || 0), 0);
      const d2TotalChars = d2Elements.reduce((sum, e) => sum + (e.content?.length || 0), 0);
      const d1EstTokens = Math.ceil(d1TotalChars / 4);
      const d2EstTokens = Math.ceil(d2TotalChars / 4);
      
      setProgress({ phase: "extracting_d1", message: "Extracting concepts...", progress: 15 });
      updateStep("d1", { 
        status: "running", 
        message: `${d1TotalChars.toLocaleString()} chars (~${d1EstTokens.toLocaleString()} tokens)`, 
        startedAt: new Date() 
      });
      addStepDetail("d1", `Total content: ${d1TotalChars.toLocaleString()} chars (~${d1EstTokens.toLocaleString()} tokens)`);
      
      updateStep("d2", { 
        status: "running", 
        message: `${d2TotalChars.toLocaleString()} chars (~${d2EstTokens.toLocaleString()} tokens)`, 
        startedAt: new Date() 
      });
      addStepDetail("d2", `Total content: ${d2TotalChars.toLocaleString()} chars (~${d2EstTokens.toLocaleString()} tokens)`);

      // Start both extractions in parallel
      const d1Promise = fetch(`${BASE_URL}/audit-extract-concepts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, projectId, shareToken, dataset: "d1", elements: d1Elements }),
      });

      const d2Promise = fetch(`${BASE_URL}/audit-extract-concepts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, projectId, shareToken, dataset: "d2", elements: d2Elements }),
      });

      const [d1Response, d2Response] = await Promise.all([d1Promise, d2Promise]);

      // Process both streams - handle errors independently so one failure doesn't block the other
      const processStream = async (
        response: Response, 
        stepId: string, 
        conceptsRef: { value: Concept[] }
      ): Promise<void> => {
        try {
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[${stepId}] HTTP error:`, response.status, errorText);
            updateStep(stepId, { status: "error", message: `HTTP ${response.status}: ${errorText.slice(0, 100)}` });
            return;
          }
          await streamSSE(
            response,
            (data) => updateStep(stepId, { message: data.message, progress: data.progress }),
            (data) => addStepDetail(stepId, `${data.label} (${data.elementCount} elements)`),
            (data) => {
              conceptsRef.value = data.concepts || [];
              updateStep(stepId, { 
                status: "completed", 
                message: `${conceptsRef.value.length} concepts extracted`, 
                progress: 100, 
                completedAt: new Date() 
              });
            },
            (err) => {
              console.error(`[${stepId}] Stream error:`, err);
              updateStep(stepId, { status: "error", message: err });
            }
          );
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[${stepId}] Processing error:`, errMsg);
          updateStep(stepId, { status: "error", message: errMsg });
        }
      };

      const d1ConceptsRef = { value: [] as Concept[] };
      const d2ConceptsRef = { value: [] as Concept[] };

      // Run in parallel - each handles its own errors
      await Promise.allSettled([
        processStream(d1Response, "d1", d1ConceptsRef),
        processStream(d2Response, "d2", d2ConceptsRef),
      ]);

      d1Concepts = d1ConceptsRef.value;
      d2Concepts = d2ConceptsRef.value;

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
        throw new Error(`Merge failed: ${mergeResponse.status}`);
      }

      const mergeResult = await mergeResponse.json();
      if (!mergeResult.success) {
        throw new Error(`Merge error: ${mergeResult.error}`);
      }

      mergedConcepts = mergeResult.mergedConcepts || [];
      unmergedD1Concepts = (mergeResult.unmergedD1Concepts || []).map((c: any) => ({
        label: c.label,
        description: c.description,
        elementIds: c.d1Ids || [],
      }));
      unmergedD2Concepts = (mergeResult.unmergedD2Concepts || []).map((c: any) => ({
        label: c.label,
        description: c.description,
        elementIds: c.d2Ids || [],
      }));

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
