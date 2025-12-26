// Hook for orchestrating the new audit pipeline
// Calls the 4 edge functions in sequence with SSE streaming

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
  tesseractCurrent?: number;
  tesseractTotal?: number;
}

interface D1Concept {
  label: string;
  description: string;
  elementIds: string[];
}

interface D2Concept {
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

// Parse SSE text to extract result
function extractSSEResult(text: string): any {
  // Look for the result event
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "event: result" && lines[i + 1]?.startsWith("data: ")) {
      try {
        return JSON.parse(lines[i + 1].slice(6));
      } catch {
        continue;
      }
    }
    // Also handle case where data comes on same conceptual line
    if (lines[i].startsWith("data: ") && !lines[i].includes("[DONE]")) {
      const prev = lines[i - 1];
      if (prev === "event: result") {
        try {
          return JSON.parse(lines[i].slice(6));
        } catch {
          continue;
        }
      }
    }
  }
  // Fallback: try to find any result-like JSON
  const resultMatch = text.match(/event: result\s*\n\s*data: (.+)/);
  if (resultMatch) {
    try {
      return JSON.parse(resultMatch[1]);
    } catch {
      // ignore
    }
  }
  return null;
}

export function useAuditPipeline() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress>({ phase: "idle", message: "", progress: 0 });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const runPipeline = useCallback(async (input: PipelineInput) => {
    setIsRunning(true);
    setError(null);
    abortRef.current = false;

    const { sessionId, projectId, shareToken, d1Elements, d2Elements } = input;
    const baseUrl = `https://obkzdksfayygnrzdqoam.supabase.co/functions/v1`;

    let d1Concepts: D1Concept[] = [];
    let d2Concepts: D2Concept[] = [];
    let mergedConcepts: MergedConcept[] = [];
    let unmergedD1Concepts: D1Concept[] = [];
    let unmergedD2Concepts: D2Concept[] = [];

    try {
      // Phase 0: Create D1 and D2 nodes in graph
      setProgress({ phase: "creating_nodes", message: `Creating ${d1Elements.length} D1 and ${d2Elements.length} D2 nodes...`, progress: 5 });

      for (const element of d1Elements) {
        await supabase.rpc("upsert_audit_graph_node_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_label: element.label,
          p_description: element.content?.slice(0, 500) || "",
          p_node_type: "d1_element",
          p_source_dataset: "dataset1",
          p_source_element_ids: [element.id],
          p_created_by_agent: "pipeline",
          p_color: "#3b82f6",
          p_size: 15,
          p_metadata: { category: element.category || "unknown" },
        });
      }

      for (const element of d2Elements) {
        await supabase.rpc("upsert_audit_graph_node_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_label: element.label,
          p_description: element.content?.slice(0, 500) || "",
          p_node_type: "d2_element",
          p_source_dataset: "dataset2",
          p_source_element_ids: [element.id],
          p_created_by_agent: "pipeline",
          p_color: "#22c55e",
          p_size: 15,
          p_metadata: { category: element.category || "unknown" },
        });
      }

      // Update session status
      await supabase.rpc("update_audit_session_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_status: "running",
        p_phase: "extracting_concepts",
      });

      if (abortRef.current) throw new Error("Aborted");

      // Phase 1: Extract D1 and D2 concepts in parallel
      setProgress({ phase: "extracting_d1", message: "Extracting concepts from D1 and D2 in parallel...", progress: 10 });

      const [d1Response, d2Response] = await Promise.all([
        fetch(`${baseUrl}/audit-extract-concepts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, projectId, shareToken, dataset: "d1", elements: d1Elements }),
        }),
        fetch(`${baseUrl}/audit-extract-concepts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, projectId, shareToken, dataset: "d2", elements: d2Elements }),
        }),
      ]);

      // Parse D1 results
      const d1Text = await d1Response.text();
      const d1Result = extractSSEResult(d1Text);
      if (d1Result?.concepts) {
        d1Concepts = d1Result.concepts.map((c: any) => ({
          label: c.label,
          description: c.description,
          elementIds: c.elementIds || [],
        }));
      }

      // Parse D2 results
      const d2Text = await d2Response.text();
      const d2Result = extractSSEResult(d2Text);
      if (d2Result?.concepts) {
        d2Concepts = d2Result.concepts.map((c: any) => ({
          label: c.label,
          description: c.description,
          elementIds: c.elementIds || [],
        }));
      }

      setProgress({ 
        phase: "merging_concepts", 
        message: `Merging ${d1Concepts.length} D1 and ${d2Concepts.length} D2 concepts...`, 
        progress: 30,
        d1ConceptCount: d1Concepts.length,
        d2ConceptCount: d2Concepts.length
      });

      if (abortRef.current) throw new Error("Aborted");

      // Phase 2: Merge concepts
      // Convert to expected format for merge function
      const d1ForMerge = d1Concepts.map(c => ({ label: c.label, description: c.description, d1Ids: c.elementIds }));
      const d2ForMerge = d2Concepts.map(c => ({ label: c.label, description: c.description, d2Ids: c.elementIds }));

      const mergeResponse = await fetch(`${baseUrl}/audit-merge-concepts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, projectId, shareToken, d1Concepts: d1ForMerge, d2Concepts: d2ForMerge }),
      });

      const mergeText = await mergeResponse.text();
      const mergeResult = extractSSEResult(mergeText);
      if (mergeResult) {
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
      }

      setProgress({ 
        phase: "building_graph", 
        message: `Creating ${mergedConcepts.length} merged concept nodes and edges...`, 
        progress: 45,
        mergedCount: mergedConcepts.length
      });

      if (abortRef.current) throw new Error("Aborted");

      // Phase 2.5: Build graph nodes for concepts and create edges
      for (const concept of mergedConcepts) {
        // Create merged concept node
        const { data: conceptNode } = await supabase.rpc("upsert_audit_graph_node_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_label: concept.mergedLabel,
          p_description: concept.mergedDescription,
          p_node_type: "concept",
          p_source_dataset: "both",
          p_source_element_ids: [...concept.d1Ids, ...concept.d2Ids],
          p_created_by_agent: "pipeline",
          p_color: "#a855f7", // Purple for merged concepts
          p_size: 25,
          p_metadata: { merged: true, d1Count: concept.d1Ids.length, d2Count: concept.d2Ids.length },
        });

        if (conceptNode?.id) {
          // Create edges from D1 elements to concept
          for (const d1Id of concept.d1Ids) {
            const { data: d1Nodes } = await supabase.rpc("get_audit_graph_nodes_with_token", {
              p_session_id: sessionId,
              p_token: shareToken,
            });
            const d1Node = d1Nodes?.find((n: any) => n.source_element_ids?.includes(d1Id));
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

          // Create edges from D2 elements to concept
          for (const d2Id of concept.d2Ids) {
            const { data: d2Nodes } = await supabase.rpc("get_audit_graph_nodes_with_token", {
              p_session_id: sessionId,
              p_token: shareToken,
            });
            const d2Node = d2Nodes?.find((n: any) => n.source_element_ids?.includes(d2Id));
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
      }

      // Create nodes for unmerged D1 concepts (gaps)
      for (const concept of unmergedD1Concepts) {
        await supabase.rpc("upsert_audit_graph_node_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_label: concept.label,
          p_description: concept.description,
          p_node_type: "concept",
          p_source_dataset: "dataset1",
          p_source_element_ids: concept.elementIds,
          p_created_by_agent: "pipeline",
          p_color: "#ef4444", // Red for gaps
          p_size: 22,
          p_metadata: { gap: true, unmerged: true },
        });
      }

      // Create nodes for unmerged D2 concepts (orphans)
      for (const concept of unmergedD2Concepts) {
        await supabase.rpc("upsert_audit_graph_node_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_label: concept.label,
          p_description: concept.description,
          p_node_type: "concept",
          p_source_dataset: "dataset2",
          p_source_element_ids: concept.elementIds,
          p_created_by_agent: "pipeline",
          p_color: "#f59e0b", // Orange for orphans
          p_size: 22,
          p_metadata: { orphan: true, unmerged: true },
        });
      }

      setProgress({ 
        phase: "building_tesseract", 
        message: `Analyzing ${mergedConcepts.length} merged concepts for alignment...`, 
        progress: 55,
        tesseractTotal: mergedConcepts.length
      });

      if (abortRef.current) throw new Error("Aborted");

      // Phase 3: Build tesseract
      const tesseractResponse = await fetch(`${baseUrl}/audit-build-tesseract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          sessionId, projectId, shareToken, 
          mergedConcepts, 
          d1Elements, 
          d2Elements 
        }),
      });

      const tesseractText = await tesseractResponse.text();
      const tesseractResult = extractSSEResult(tesseractText);
      const tesseractCells = tesseractResult?.cells || [];

      setProgress({ 
        phase: "generating_venn", 
        message: "Generating final Venn analysis...", 
        progress: 85 
      });

      if (abortRef.current) throw new Error("Aborted");

      // Phase 4: Generate Venn
      await fetch(`${baseUrl}/audit-generate-venn`, {
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

      setProgress({ phase: "completed", message: "Audit pipeline complete!", progress: 100 });

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      setProgress({ phase: "error", message: errMsg, progress: 0 });
      
      // Update session with error status
      await supabase.rpc("update_audit_session_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_status: "failed",
      });
    } finally {
      setIsRunning(false);
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { runPipeline, isRunning, progress, error, abort };
}
