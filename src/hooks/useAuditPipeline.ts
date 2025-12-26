// Hook for orchestrating the audit pipeline - RUNS ENTIRELY LOCALLY
// No database writes until explicit save. All operations update local state only.

import { useState, useCallback, useRef } from "react";

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
  errorMessage?: string; // Full error message for display
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

export interface LocalGraphNode {
  id: string;
  label: string;
  description: string;
  node_type: string;
  source_dataset: string;
  source_element_ids: string[];
  color: string;
  size: number;
  metadata: Record<string, any>;
}

export interface LocalGraphEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string;
  label: string;
  weight: number;
  metadata: Record<string, any>;
}

export interface LocalTesseractCell {
  id: string;
  conceptLabel: string;
  conceptDescription: string;
  polarity: number; // -1 to 1
  rationale: string;
  d1ElementIds: string[];
  d2ElementIds: string[];
}

export interface LocalVennResult {
  uniqueToD1: { label: string; description: string }[];
  aligned: { label: string; description: string; polarity: number }[];
  uniqueToD2: { label: string; description: string }[];
  summary: string;
}

interface PipelineInput {
  sessionId: string;
  projectId: string;
  shareToken: string;
  d1Elements: Element[];
  d2Elements: Element[];
}

export interface PipelineResults {
  nodes: LocalGraphNode[];
  edges: LocalGraphEdge[];
  tesseractCells: LocalTesseractCell[];
  vennResult: LocalVennResult | null;
}

const BASE_URL = "https://obkzdksfayygnrzdqoam.supabase.co/functions/v1";

// Generate local UUIDs
function localId(): string {
  return crypto.randomUUID();
}

// Parse SSE stream and call callbacks for each event
async function streamSSE(
  response: Response,
  onProgress: (data: any) => void,
  onConcept: (data: any) => void,
  onResult: (data: any) => void,
  onError: (error: string) => void
): Promise<any> {
  const reader = response.body?.getReader();
  if (!reader) {
    console.warn("[streamSSE] No response body");
    return null;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let result: any = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      
      for (const eventBlock of events) {
        if (!eventBlock.trim()) continue;
        
        const lines = eventBlock.split("\n");
        let eventType = "";
        let dataStr = "";
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith("event:")) {
            eventType = trimmedLine.slice(6).trim();
          } else if (trimmedLine.startsWith("data:")) {
            dataStr = trimmedLine.slice(5).trim();
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
            case "cell":
              onConcept(data);
              break;
            case "result":
              result = data;
              onResult(data);
              break;
            case "done":
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
    
    // Process remaining buffer
    if (buffer.trim()) {
      const lines = buffer.split("\n");
      let eventType = "";
      let dataStr = "";
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("event:")) {
          eventType = trimmedLine.slice(6).trim();
        } else if (trimmedLine.startsWith("data:")) {
          dataStr = trimmedLine.slice(5).trim();
        }
      }
      if (eventType && dataStr) {
        try {
          const data = JSON.parse(dataStr);
          if (eventType === "result") {
            result = data;
            onResult(data);
          }
        } catch {
          // Final buffer not valid JSON
        }
      }
    }
  } catch (err) {
    console.error("[streamSSE] Stream error:", err);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Already released
    }
  }

  return result;
}

export function useAuditPipeline() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress>({ phase: "idle", message: "", progress: 0 });
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PipelineResults | null>(null);
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
    setResults(null);
    abortRef.current = false;

    const { sessionId, projectId, shareToken, d1Elements, d2Elements } = input;

    // LOCAL STATE - all nodes/edges/cells stored here, NO DB writes
    const localNodes: LocalGraphNode[] = [];
    const localEdges: LocalGraphEdge[] = [];
    const localTesseractCells: LocalTesseractCell[] = [];
    let localVennResult: LocalVennResult | null = null;

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

    // Helper to update results state for live graph updates
    const updateResults = () => {
      setResults({
        nodes: [...localNodes],
        edges: [...localEdges],
        tesseractCells: [...localTesseractCells],
        vennResult: localVennResult,
      });
    };

    try {
      // ========================================
      // PHASE 0: Create D1 and D2 element nodes LOCALLY (instant)
      // ========================================
      setProgress({ phase: "creating_nodes", message: `Creating ${d1Elements.length + d2Elements.length} nodes...`, progress: 5 });
      updateStep("nodes", { status: "running", message: "Creating nodes locally...", startedAt: new Date() });

      // Create D1 nodes locally
      for (const element of d1Elements) {
        const node: LocalGraphNode = {
          id: localId(),
          label: element.label,
          description: (element.content || "").slice(0, 2000),
          node_type: "d1_element",
          source_dataset: "dataset1",
          source_element_ids: [element.id],
          color: "#3b82f6",
          size: 15,
          metadata: { category: element.category || "unknown", originalElementId: element.id },
        };
        localNodes.push(node);
      }

      // Create D2 nodes locally
      for (const element of d2Elements) {
        const node: LocalGraphNode = {
          id: localId(),
          label: element.label,
          description: (element.content || "").slice(0, 2000),
          node_type: "d2_element",
          source_dataset: "dataset2",
          source_element_ids: [element.id],
          color: "#22c55e",
          size: 15,
          metadata: { category: element.category || "unknown", originalElementId: element.id },
        };
        localNodes.push(node);
      }

      updateResults(); // Immediate graph update
      updateStep("nodes", { status: "completed", message: `Created ${d1Elements.length + d2Elements.length} nodes`, progress: 100, completedAt: new Date() });

      if (abortRef.current) throw new Error("Aborted");

      // ========================================
      // PHASE 1: Extract D1 and D2 concepts IN PARALLEL
      // ========================================
      const d1TotalChars = d1Elements.reduce((sum, e) => sum + (e.content?.length || 0), 0);
      const d2TotalChars = d2Elements.reduce((sum, e) => sum + (e.content?.length || 0), 0);
      const d1EstTokens = Math.ceil(d1TotalChars / 4);
      const d2EstTokens = Math.ceil(d2TotalChars / 4);
      
      const BATCH_CHAR_LIMIT = 50000;
      
      const batchByCharLimit = (elements: Element[], limit: number, totalChars: number): Element[][] => {
        if (totalChars <= limit) return [elements];
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
        if (currentBatch.length > 0) batches.push(currentBatch);
        return batches;
      };
      
      const d1Batches = batchByCharLimit(d1Elements, BATCH_CHAR_LIMIT, d1TotalChars);
      const d2Batches = batchByCharLimit(d2Elements, BATCH_CHAR_LIMIT, d2TotalChars);
      
      setProgress({ phase: "extracting_d1", message: "Extracting concepts...", progress: 15 });
      updateStep("d1", { status: "running", message: `${d1TotalChars.toLocaleString()} chars in ${d1Batches.length} batch(es)`, startedAt: new Date() });
      updateStep("d2", { status: "running", message: `${d2TotalChars.toLocaleString()} chars in ${d2Batches.length} batch(es)`, startedAt: new Date() });

      // Helper to extract concepts from a batch
      const extractBatch = async (
        dataset: "d1" | "d2",
        batchElements: Element[],
        batchIndex: number,
        totalBatches: number,
        stepId: string
      ): Promise<Concept[]> => {
        addStepDetail(stepId, `Batch ${batchIndex + 1}/${totalBatches}: ${batchElements.length} elements`);
        
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
          (data) => {
            // IMMEDIATELY add concept node to local graph as it streams in
            if (data.label && data.elementIds) {
              const conceptNode: LocalGraphNode = {
                id: localId(),
                label: data.label,
                description: data.description || "",
                node_type: "concept",
                source_dataset: dataset === "d1" ? "dataset1" : "dataset2",
                source_element_ids: data.elementIds,
                color: dataset === "d1" ? "#60a5fa" : "#4ade80",
                size: 20,
                metadata: { source: dataset, premerge: true },
              };
              localNodes.push(conceptNode);

              // Create edges from element nodes to concept node
              for (const elId of data.elementIds) {
                const elementNode = localNodes.find(n => n.metadata?.originalElementId === elId);
                if (elementNode) {
                  const edge: LocalGraphEdge = {
                    id: localId(),
                    source_node_id: elementNode.id,
                    target_node_id: conceptNode.id,
                    edge_type: dataset === "d1" ? "defines" : "implements",
                    label: dataset === "d1" ? "defines" : "implements",
                    weight: 1.0,
                    metadata: { premerge: true },
                  };
                  localEdges.push(edge);
                }
              }

              updateResults(); // Update graph immediately
              addStepDetail(stepId, `Concept: ${data.label} (${data.elementIds?.length || 0} elements)`);
            }
          },
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

      // Process all batches for a dataset - marks itself complete when done
      const processAllBatches = async (
        dataset: "d1" | "d2",
        batches: Element[][],
        stepId: string
      ): Promise<{ concepts: Concept[]; error?: string }> => {
        const allConcepts: Concept[] = [];
        const batchErrors: string[] = [];
        
        for (let i = 0; i < batches.length; i++) {
          if (abortRef.current) {
            updateStep(stepId, { status: "error", message: "Aborted", errorMessage: "User aborted pipeline" });
            throw new Error("Aborted");
          }
          
          try {
            const batchConcepts = await extractBatch(dataset, batches[i], i, batches.length, stepId);
            allConcepts.push(...batchConcepts);
          } catch (batchErr: any) {
            const errMsg = batchErr.message || String(batchErr);
            console.error(`[${stepId}] Batch ${i + 1} error:`, errMsg);
            batchErrors.push(`Batch ${i + 1}: ${errMsg}`);
            addStepDetail(stepId, `ERROR Batch ${i + 1}: ${errMsg}`);
            // Continue with other batches
          }
        }
        
        // Mark step complete/error IMMEDIATELY (don't wait for other dataset)
        if (batchErrors.length > 0) {
          const fullError = batchErrors.join("\n\n");
          if (allConcepts.length > 0) {
            // Partial success
            updateStep(stepId, { 
              status: "completed", 
              message: `${allConcepts.length} concepts (${batchErrors.length} batches failed)`, 
              progress: 100, 
              completedAt: new Date(),
              errorMessage: fullError 
            });
          } else {
            // Complete failure
            updateStep(stepId, { 
              status: "error", 
              message: `All ${batches.length} batches failed`, 
              errorMessage: fullError 
            });
          }
          return { concepts: allConcepts, error: fullError };
        } else {
          updateStep(stepId, { 
            status: "completed", 
            message: `${allConcepts.length} concepts`, 
            progress: 100, 
            completedAt: new Date() 
          });
          return { concepts: allConcepts };
        }
      };

      // Run D1 and D2 extraction in parallel - each marks itself complete independently
      const [d1Result, d2Result] = await Promise.allSettled([
        processAllBatches("d1", d1Batches, "d1"),
        processAllBatches("d2", d2Batches, "d2"),
      ]);

      // Collect results (steps already marked complete/error inside processAllBatches)
      if (d1Result.status === "fulfilled") {
        d1Concepts = d1Result.value.concepts;
      } else {
        console.error("[d1] Extraction threw:", d1Result.reason);
      }

      if (d2Result.status === "fulfilled") {
        d2Concepts = d2Result.value.concepts;
      } else {
        console.error("[d2] Extraction threw:", d2Result.reason);
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

      await streamSSE(
        mergeResponse,
        (data) => {
          updateStep("merge", { message: data.message || "Merging...", progress: data.progress || 50 });
        },
        () => {},
        (data) => {
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
        (err) => { throw new Error(`Merge stream error: ${err}`); }
      );

      updateStep("merge", { 
        status: "completed", 
        message: `${mergedConcepts.length} merged, ${unmergedD1Concepts.length} gaps, ${unmergedD2Concepts.length} orphans`, 
        progress: 100, 
        completedAt: new Date() 
      });

      setProgress({ phase: "building_graph", message: "Rebuilding graph with merged concepts...", progress: 50, mergedCount: mergedConcepts.length });

      if (abortRef.current) throw new Error("Aborted");

      // ========================================
      // PHASE 2.5: Rebuild graph locally with merged concepts
      // ========================================
      updateStep("graph", { status: "running", message: "Rebuilding graph...", startedAt: new Date() });

      // Remove premerge concept nodes and their edges
      const premergeConcepts = localNodes.filter(n => n.metadata?.premerge === true);
      const premergeNodeIds = new Set(premergeConcepts.map(n => n.id));
      
      // Remove premerge nodes
      for (let i = localNodes.length - 1; i >= 0; i--) {
        if (premergeNodeIds.has(localNodes[i].id)) {
          localNodes.splice(i, 1);
        }
      }
      
      // Remove edges pointing to/from premerge nodes
      for (let i = localEdges.length - 1; i >= 0; i--) {
        if (premergeNodeIds.has(localEdges[i].source_node_id) || premergeNodeIds.has(localEdges[i].target_node_id)) {
          localEdges.splice(i, 1);
        }
      }

      addStepDetail("graph", `Removed ${premergeConcepts.length} pre-merge concepts`);

      // Handle fallback if merge returned empty
      const hasMergeResults = mergedConcepts.length > 0 || unmergedD1Concepts.length > 0 || unmergedD2Concepts.length > 0;
      if (!hasMergeResults && (d1Concepts.length > 0 || d2Concepts.length > 0)) {
        addStepDetail("graph", "Merge returned empty, using raw extracted concepts");
        for (const c of d1Concepts) {
          mergedConcepts.push({
            mergedLabel: c.label,
            mergedDescription: c.description,
            d1ConceptLabels: [c.label],
            d2ConceptLabels: [],
            d1Ids: c.elementIds,
            d2Ids: [],
          });
        }
        for (const c of d2Concepts) {
          mergedConcepts.push({
            mergedLabel: c.label,
            mergedDescription: c.description,
            d1ConceptLabels: [],
            d2ConceptLabels: [c.label],
            d1Ids: [],
            d2Ids: c.elementIds,
          });
        }
      }

      // Create merged concept nodes
      for (const concept of mergedConcepts) {
        const conceptNode: LocalGraphNode = {
          id: localId(),
          label: concept.mergedLabel,
          description: concept.mergedDescription,
          node_type: "concept",
          source_dataset: "both",
          source_element_ids: [...concept.d1Ids, ...concept.d2Ids],
          color: "#a855f7",
          size: 25,
          metadata: { merged: true, d1Labels: concept.d1ConceptLabels, d2Labels: concept.d2ConceptLabels },
        };
        localNodes.push(conceptNode);

        // Create edges from D1 elements
        for (const d1Id of concept.d1Ids) {
          const d1Node = localNodes.find(n => n.metadata?.originalElementId === d1Id);
          if (d1Node) {
            localEdges.push({
              id: localId(),
              source_node_id: d1Node.id,
              target_node_id: conceptNode.id,
              edge_type: "defines",
              label: "defines",
              weight: 1.0,
              metadata: { merged: true },
            });
          }
        }

        // Create edges from D2 elements
        for (const d2Id of concept.d2Ids) {
          const d2Node = localNodes.find(n => n.metadata?.originalElementId === d2Id);
          if (d2Node) {
            localEdges.push({
              id: localId(),
              source_node_id: d2Node.id,
              target_node_id: conceptNode.id,
              edge_type: "implements",
              label: "implements",
              weight: 1.0,
              metadata: { merged: true },
            });
          }
        }
        
        addStepDetail("graph", `Created merged: ${concept.mergedLabel}`);
      }

      // Create gap concept nodes (D1 only)
      for (const concept of unmergedD1Concepts) {
        const gapNode: LocalGraphNode = {
          id: localId(),
          label: concept.label,
          description: concept.description,
          node_type: "concept",
          source_dataset: "dataset1",
          source_element_ids: concept.elementIds,
          color: "#ef4444",
          size: 22,
          metadata: { gap: true },
        };
        localNodes.push(gapNode);

        for (const d1Id of concept.elementIds) {
          const d1Node = localNodes.find(n => n.metadata?.originalElementId === d1Id);
          if (d1Node) {
            localEdges.push({
              id: localId(),
              source_node_id: d1Node.id,
              target_node_id: gapNode.id,
              edge_type: "defines",
              label: "defines",
              weight: 1.0,
              metadata: { gap: true },
            });
          }
        }
        addStepDetail("graph", `Created gap: ${concept.label}`);
      }

      // Create orphan concept nodes (D2 only)
      for (const concept of unmergedD2Concepts) {
        const orphanNode: LocalGraphNode = {
          id: localId(),
          label: concept.label,
          description: concept.description,
          node_type: "concept",
          source_dataset: "dataset2",
          source_element_ids: concept.elementIds,
          color: "#f97316",
          size: 22,
          metadata: { orphan: true },
        };
        localNodes.push(orphanNode);

        for (const d2Id of concept.elementIds) {
          const d2Node = localNodes.find(n => n.metadata?.originalElementId === d2Id);
          if (d2Node) {
            localEdges.push({
              id: localId(),
              source_node_id: d2Node.id,
              target_node_id: orphanNode.id,
              edge_type: "implements",
              label: "implements",
              weight: 1.0,
              metadata: { orphan: true },
            });
          }
        }
        addStepDetail("graph", `Created orphan: ${concept.label}`);
      }

      updateResults();
      updateStep("graph", { status: "completed", message: `${localNodes.length} nodes, ${localEdges.length} edges`, progress: 100, completedAt: new Date() });

      if (abortRef.current) throw new Error("Aborted");

      // ========================================
      // PHASE 3: Build Tesseract cells locally
      // ========================================
      setProgress({ phase: "building_tesseract", message: "Analyzing alignment...", progress: 65 });
      updateStep("tesseract", { status: "running", message: "Calling tesseract LLM...", startedAt: new Date() });

      // Get concept nodes for tesseract analysis
      const conceptNodes = localNodes.filter(n => n.node_type === "concept");

      // Build D1/D2 element content maps for tesseract
      const d1ContentMap = new Map<string, Element>();
      const d2ContentMap = new Map<string, Element>();
      d1Elements.forEach(e => d1ContentMap.set(e.id, e));
      d2Elements.forEach(e => d2ContentMap.set(e.id, e));

      // Prepare concepts for tesseract with full content
      const conceptsForTesseract = conceptNodes.map(node => {
        const d1Content: string[] = [];
        const d2Content: string[] = [];
        
        for (const elId of node.source_element_ids) {
          const d1El = d1ContentMap.get(elId);
          const d2El = d2ContentMap.get(elId);
          if (d1El) d1Content.push(d1El.content);
          if (d2El) d2Content.push(d2El.content);
        }

        return {
          conceptId: node.id,
          label: node.label,
          description: node.description,
          d1ElementIds: node.source_element_ids.filter(id => d1ContentMap.has(id)),
          d2ElementIds: node.source_element_ids.filter(id => d2ContentMap.has(id)),
          d1Content,
          d2Content,
        };
      });

      const tesseractResponse = await fetch(`${BASE_URL}/audit-build-tesseract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, projectId, shareToken, concepts: conceptsForTesseract }),
      });

      if (!tesseractResponse.ok) {
        const errorText = await tesseractResponse.text();
        throw new Error(`Tesseract failed: ${tesseractResponse.status} - ${errorText.slice(0, 100)}`);
      }

      await streamSSE(
        tesseractResponse,
        (data) => {
          updateStep("tesseract", { message: data.message || "Analyzing...", progress: data.progress || 50 });
        },
        (data) => {
          // Each cell streamed in
          if (data.conceptLabel && data.polarity !== undefined) {
            const cell: LocalTesseractCell = {
              id: localId(),
              conceptLabel: data.conceptLabel,
              conceptDescription: data.conceptDescription || "",
              polarity: data.polarity,
              rationale: data.rationale || "",
              d1ElementIds: data.d1ElementIds || [],
              d2ElementIds: data.d2ElementIds || [],
            };
            localTesseractCells.push(cell);
            updateResults();
            addStepDetail("tesseract", `${data.conceptLabel}: ${data.polarity > 0 ? "+" : ""}${data.polarity.toFixed(2)}`);
          }
        },
        (data) => {
          // Full result at end
          if (data.cells) {
            for (const c of data.cells) {
              if (!localTesseractCells.find(tc => tc.conceptLabel === c.conceptLabel)) {
                localTesseractCells.push({
                  id: localId(),
                  conceptLabel: c.conceptLabel,
                  conceptDescription: c.conceptDescription || "",
                  polarity: c.polarity,
                  rationale: c.rationale || "",
                  d1ElementIds: c.d1ElementIds || [],
                  d2ElementIds: c.d2ElementIds || [],
                });
              }
            }
            updateResults();
          }
        },
        (err) => { throw new Error(`Tesseract stream error: ${err}`); }
      );

      updateStep("tesseract", { status: "completed", message: `${localTesseractCells.length} cells analyzed`, progress: 100, completedAt: new Date() });

      if (abortRef.current) throw new Error("Aborted");

      // ========================================
      // PHASE 4: Generate Venn analysis locally
      // ========================================
      setProgress({ phase: "generating_venn", message: "Generating Venn diagram...", progress: 85 });
      updateStep("venn", { status: "running", message: "Calling venn LLM...", startedAt: new Date() });

      const vennResponse = await fetch(`${BASE_URL}/audit-generate-venn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          sessionId, 
          projectId, 
          shareToken, 
          mergedConcepts, 
          unmergedD1Concepts, 
          unmergedD2Concepts,
          tesseractCells: localTesseractCells,
        }),
      });

      if (!vennResponse.ok) {
        const errorText = await vennResponse.text();
        throw new Error(`Venn failed: ${vennResponse.status} - ${errorText.slice(0, 100)}`);
      }

      await streamSSE(
        vennResponse,
        (data) => {
          updateStep("venn", { message: data.message || "Generating...", progress: data.progress || 50 });
        },
        () => {},
        (data) => {
          localVennResult = {
            uniqueToD1: data.uniqueToD1 || [],
            aligned: data.aligned || [],
            uniqueToD2: data.uniqueToD2 || [],
            summary: data.summary || "",
          };
          updateResults();
        },
        (err) => { throw new Error(`Venn stream error: ${err}`); }
      );

      updateStep("venn", { status: "completed", message: "Venn analysis complete", progress: 100, completedAt: new Date() });

      // ========================================
      // COMPLETE - all data is LOCAL, not saved to DB
      // ========================================
      setProgress({ phase: "completed", message: "Pipeline complete! Review results before saving.", progress: 100 });

      // Final update
      setResults({
        nodes: localNodes,
        edges: localEdges,
        tesseractCells: localTesseractCells,
        vennResult: localVennResult,
      });

    } catch (err: any) {
      console.error("Pipeline error:", err);
      setError(err.message || "Pipeline failed");
      setProgress({ phase: "error", message: err.message || "Pipeline failed", progress: 0 });
      
      // Still save whatever we have so far
      setResults({
        nodes: localNodes,
        edges: localEdges,
        tesseractCells: localTesseractCells,
        vennResult: localVennResult,
      });
    } finally {
      setIsRunning(false);
    }
  }, [updateStep, addStepDetail]);

  const abort = useCallback(() => {
    abortRef.current = true;
    setProgress({ phase: "idle", message: "Aborted", progress: 0 });
    setIsRunning(false);
  }, []);

  const clearResults = useCallback(() => {
    setResults(null);
    setSteps([]);
    setProgress({ phase: "idle", message: "", progress: 0 });
    setError(null);
  }, []);

  return {
    isRunning,
    progress,
    steps,
    error,
    results,
    runPipeline,
    abort,
    clearResults,
  };
}
