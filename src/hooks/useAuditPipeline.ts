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

// Audit processing settings types (match dialog)
export type ConsolidationLevel = "low" | "medium" | "high";
export type ChunkSize = "small" | "medium" | "large";
export type BatchSize = "10" | "50" | "unlimited";
export type MappingMode = "one_to_one" | "one_to_many";

interface PipelineInput {
  sessionId: string;
  projectId: string;
  shareToken: string;
  d1Elements: Element[];
  d2Elements: Element[];
  // Processing settings
  consolidationLevel?: ConsolidationLevel;
  chunkSize?: ChunkSize;
  batchSize?: BatchSize;
  mappingMode?: MappingMode;
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

// Step ID type for restart functionality
export type PipelineStepId = "nodes" | "d1" | "d2" | "merge" | "graph" | "tesseract" | "venn";

// Activity entry type for reconstruction
interface ActivityEntry {
  id: string;
  activity_type: string;
  title: string;
  content?: string | null;
  agent_role?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
}

export function useAuditPipeline() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress>({ phase: "idle", message: "", progress: 0 });
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PipelineResults | null>(null);
  const abortRef = useRef(false);

  // Reconstruct pipeline steps from activity stream (for viewing completed audits)
  const reconstructStepsFromActivity = useCallback((activityStream: ActivityEntry[]) => {
    if (activityStream.length === 0) {
      setSteps([]);
      setProgress({ phase: "idle", message: "", progress: 0 });
      return;
    }

    // Build a map of step states from activity
    const stepStates: Record<string, { status: "pending" | "running" | "completed" | "error"; message: string; details: string[] }> = {
      nodes: { status: "pending", message: "Waiting...", details: [] },
      d1: { status: "pending", message: "Waiting...", details: [] },
      d2: { status: "pending", message: "Waiting...", details: [] },
      merge: { status: "pending", message: "Waiting...", details: [] },
      graph: { status: "pending", message: "Waiting...", details: [] },
      tesseract: { status: "pending", message: "Waiting...", details: [] },
      venn: { status: "pending", message: "Waiting...", details: [] },
    };

    let pipelineCompleted = false;
    let d1ConceptCount = 0;
    let d2ConceptCount = 0;
    let mergeCount = 0;
    let tesseractCount = 0;

    // Process activity stream chronologically
    const sortedActivity = [...activityStream].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    for (const activity of sortedActivity) {
      const type = activity.activity_type;
      const title = activity.title.toLowerCase();

      // Auto-populate = nodes created
      if (type === "auto_populate" || title.includes("auto-created graph nodes")) {
        stepStates.nodes = { status: "completed", message: activity.title, details: [] };
      }

      // Concept extraction
      if (type === "concept_extraction") {
        if (title.includes("d1")) {
          stepStates.d1 = { status: "completed", message: activity.title, details: stepStates.d1.details };
          d1ConceptCount++;
          stepStates.d1.details.push(activity.title);
        } else if (title.includes("d2")) {
          stepStates.d2 = { status: "completed", message: activity.title, details: stepStates.d2.details };
          d2ConceptCount++;
          stepStates.d2.details.push(activity.title);
        }
      }

      // Concept merge
      if (type === "concept_merge") {
        stepStates.merge = { status: "completed", message: activity.title, details: stepStates.merge.details };
        mergeCount++;
        stepStates.merge.details.push(activity.title);
        // Graph is also done after merge
        stepStates.graph = { status: "completed", message: "Graph built from merged concepts", details: [] };
      }

      // Tesseract analysis
      if (type === "tesseract_analysis") {
        stepStates.tesseract = { status: "completed", message: activity.title, details: stepStates.tesseract.details };
        tesseractCount++;
        stepStates.tesseract.details.push(activity.title);
      }

      // Venn analysis
      if (type === "venn_analysis" || title.includes("venn")) {
        stepStates.venn = { status: "completed", message: activity.title, details: [] };
      }

      // Pipeline complete
      if (type === "pipeline_complete" || title.includes("audit complete") || title.includes("pipeline complete")) {
        pipelineCompleted = true;
      }

      // Handle errors
      if (type === "error") {
        // Don't override completed status with error from other steps
      }
    }

    // If we have venn analysis, mark pipeline as complete
    if (stepStates.venn.status === "completed") {
      pipelineCompleted = true;
    }

    // Build reconstructed steps array with actual counts
    const reconstructedSteps: PipelineStep[] = [
      { id: "nodes", phase: "creating_nodes", title: "Create Graph Nodes", ...stepStates.nodes, progress: stepStates.nodes.status === "completed" ? 100 : 0 },
      { id: "d1", phase: "extracting_d1", title: `Extract D1 Concepts${d1ConceptCount > 0 ? ` (${d1ConceptCount} found)` : ''}`, ...stepStates.d1, progress: stepStates.d1.status === "completed" ? 100 : 0 },
      { id: "d2", phase: "extracting_d2", title: `Extract D2 Concepts${d2ConceptCount > 0 ? ` (${d2ConceptCount} found)` : ''}`, ...stepStates.d2, progress: stepStates.d2.status === "completed" ? 100 : 0 },
      { id: "merge", phase: "merging_concepts", title: `Merge Concepts${mergeCount > 0 ? ` (${mergeCount} merged)` : ''}`, ...stepStates.merge, progress: stepStates.merge.status === "completed" ? 100 : 0 },
      { id: "graph", phase: "building_graph", title: "Build Graph Edges", ...stepStates.graph, progress: stepStates.graph.status === "completed" ? 100 : 0 },
      { id: "tesseract", phase: "building_tesseract", title: `Build Tesseract${tesseractCount > 0 ? ` (${tesseractCount} cells)` : ''}`, ...stepStates.tesseract, progress: stepStates.tesseract.status === "completed" ? 100 : 0 },
      { id: "venn", phase: "generating_venn", title: "Generate Venn Analysis", ...stepStates.venn, progress: stepStates.venn.status === "completed" ? 100 : 0 },
    ];

    setSteps(reconstructedSteps);
    
    if (pipelineCompleted) {
      setProgress({ phase: "completed", message: "Pipeline complete", progress: 100 });
    } else {
      const runningStep = reconstructedSteps.find(s => s.status === "running");
      if (runningStep) {
        setProgress({ phase: runningStep.phase, message: runningStep.message, progress: 50 });
      }
    }
  }, []);

  // Persistent state for restart functionality
  const lastInputRef = useRef<PipelineInput | null>(null);
  const intermediateStateRef = useRef<{
    d1Concepts: Concept[];
    d2Concepts: Concept[];
    mergedConcepts: MergedConcept[];
    unmergedD1Concepts: Concept[];
    unmergedD2Concepts: Concept[];
  }>({
    d1Concepts: [],
    d2Concepts: [],
    mergedConcepts: [],
    unmergedD1Concepts: [],
    unmergedD2Concepts: [],
  });

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
    lastInputRef.current = input;

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
      
      // Extract processing settings with defaults
      const consolidationLevel = input.consolidationLevel || "medium";
      const chunkSizeSetting = input.chunkSize || "medium";
      const batchSizeSetting = input.batchSize || "unlimited";
      const mappingMode = input.mappingMode || "one_to_one";
      
      // Convert chunk size to character limit
      const CHUNK_SIZE_MAP: Record<ChunkSize, number> = {
        small: 10000,   // 10KB
        medium: 50000,  // 50KB
        large: 100000,  // 100KB
      };
      const BATCH_CHAR_LIMIT = CHUNK_SIZE_MAP[chunkSizeSetting];
      
      // Convert batch size to element limit
      const BATCH_ELEMENT_MAP: Record<BatchSize, number> = {
        "10": 10,
        "50": 50,
        "unlimited": Infinity,
      };
      const BATCH_ELEMENT_LIMIT = BATCH_ELEMENT_MAP[batchSizeSetting];
      
      console.log(`[pipeline] Settings: consolidation=${consolidationLevel}, chunkSize=${chunkSizeSetting}(${BATCH_CHAR_LIMIT}), batchSize=${batchSizeSetting}(${BATCH_ELEMENT_LIMIT}), mappingMode=${mappingMode}`);
      
      const batchByCharLimit = (elements: Element[], charLimit: number, elementLimit: number, totalChars: number): Element[][] => {
        // If everything fits in one batch, return as single batch
        if (totalChars <= charLimit && elements.length <= elementLimit) return [elements];
        
        const batches: Element[][] = [];
        let currentBatch: Element[] = [];
        let currentChars = 0;
        
        for (const el of elements) {
          const elChars = el.content?.length || 0;
          const wouldExceedChars = currentChars + elChars > charLimit && currentBatch.length > 0;
          const wouldExceedElements = currentBatch.length >= elementLimit;
          
          if (wouldExceedChars || wouldExceedElements) {
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
      
      const d1Batches = batchByCharLimit(d1Elements, BATCH_CHAR_LIMIT, BATCH_ELEMENT_LIMIT, d1TotalChars);
      const d2Batches = batchByCharLimit(d2Elements, BATCH_CHAR_LIMIT, BATCH_ELEMENT_LIMIT, d2TotalChars);
      
      setProgress({ phase: "extracting_d1", message: "Extracting concepts...", progress: 15 });
      updateStep("d1", { status: "running", message: `${d1TotalChars.toLocaleString()} chars in ${d1Batches.length} batch(es)`, startedAt: new Date() });
      updateStep("d2", { status: "running", message: `${d2TotalChars.toLocaleString()} chars in ${d2Batches.length} batch(es)`, startedAt: new Date() });

      // Helper to extract concepts from a batch - returns JSON directly (no SSE)
      const extractBatch = async (
        dataset: "d1" | "d2",
        batchElements: Element[],
        batchIndex: number,
        totalBatches: number,
        stepId: string
      ): Promise<Concept[]> => {
        addStepDetail(stepId, `Batch ${batchIndex + 1}/${totalBatches}: ${batchElements.length} elements`);
        updateStep(stepId, { 
          message: `Batch ${batchIndex + 1}/${totalBatches}: Calling LLM...`, 
          progress: Math.round((batchIndex / totalBatches) * 100)
        });
        
        const response = await fetch(`${BASE_URL}/audit-extract-concepts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            sessionId, 
            projectId, 
            shareToken, 
            dataset, 
            elements: batchElements,
            mappingMode, // Pass mapping mode to edge function
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[${stepId}] Batch ${batchIndex + 1} HTTP error:`, response.status, errorText);
          throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
        }
        
        const result = await response.json();
        
        // Check for error in response
        if (!result.success) {
          const errMsg = result.error || "Unknown error from edge function";
          console.error(`[${stepId}] Batch ${batchIndex + 1} error:`, errMsg);
          throw new Error(errMsg);
        }
        
        const concepts: Concept[] = result.concepts || [];
        
        // Add concept nodes to local graph
        for (const concept of concepts) {
          const conceptNode: LocalGraphNode = {
            id: localId(),
            label: concept.label,
            description: concept.description || "",
            node_type: "concept",
            source_dataset: dataset === "d1" ? "dataset1" : "dataset2",
            source_element_ids: concept.elementIds,
            color: dataset === "d1" ? "#60a5fa" : "#4ade80",
            size: 20,
            metadata: { source: dataset, premerge: true },
          };
          localNodes.push(conceptNode);

          // Create edges from element nodes to concept node
          for (const elId of concept.elementIds) {
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

          addStepDetail(stepId, `Concept: ${concept.label} (${concept.elementIds?.length || 0} elements)`);
        }

        updateResults(); // Update graph
        addStepDetail(stepId, `Batch ${batchIndex + 1} complete: ${concepts.length} concepts`);
        updateStep(stepId, { 
          message: `Batch ${batchIndex + 1}/${totalBatches}: ${concepts.length} concepts`, 
          progress: Math.round(((batchIndex + 1) / totalBatches) * 100)
        });
        
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
      // PHASE 2: Merge concepts (with consolidation rounds)
      // ========================================
      updateStep("merge", { status: "running", message: "Calling merge LLM...", startedAt: new Date() });

      // Determine number of merge rounds based on consolidation level
      const CONSOLIDATION_ROUNDS: Record<ConsolidationLevel, number> = {
        low: 1,    // Single round - exact matches only
        medium: 2, // Two rounds - thematic similarity
        high: 3,   // Three rounds - aggressive consolidation
      };
      const mergeRounds = CONSOLIDATION_ROUNDS[consolidationLevel];
      
      let currentD1Concepts = d1Concepts.map(c => ({ label: c.label, description: c.description, d1Ids: c.elementIds }));
      let currentD2Concepts = d2Concepts.map(c => ({ label: c.label, description: c.description, d2Ids: c.elementIds }));

      // Run multiple merge rounds if consolidation > low
      for (let round = 1; round <= mergeRounds; round++) {
        if (abortRef.current) throw new Error("Aborted");
        
        // Determine aggressiveness for this round
        const roundAggressiveness = round === 1 ? "exact" : round === 2 ? "thematic" : "aggressive";
        
        updateStep("merge", { 
          message: `Round ${round}/${mergeRounds}: ${roundAggressiveness} matching...`, 
          progress: Math.round((round - 1) / mergeRounds * 80) 
        });
        addStepDetail("merge", `Round ${round}/${mergeRounds}: ${roundAggressiveness} matching`);
        
        const mergeResponse = await fetch(`${BASE_URL}/audit-merge-concepts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            sessionId, 
            projectId, 
            shareToken, 
            d1Concepts: currentD1Concepts, 
            d2Concepts: currentD2Concepts,
            consolidationRound: round,
            totalRounds: mergeRounds,
          }),
        });

        if (!mergeResponse.ok) {
          const errorText = await mergeResponse.text();
          throw new Error(`Merge failed: ${mergeResponse.status} - ${errorText.slice(0, 100)}`);
        }

        await streamSSE(
          mergeResponse,
          (data) => {
            updateStep("merge", { message: data.message || "Merging...", progress: Math.round((round - 0.5) / mergeRounds * 80) });
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
        
        addStepDetail("merge", `Round ${round} complete: ${mergedConcepts.length} merged, ${unmergedD1Concepts.length}+${unmergedD2Concepts.length} unmerged`);
        
        // For subsequent rounds, feed unmerged concepts back as input
        if (round < mergeRounds) {
          // Convert merged concepts back to D1/D2 format for next round
          // Merged concepts become "super-concepts" that can be merged again
          const mergedAsD1 = mergedConcepts
            .filter(m => m.d1Ids && m.d1Ids.length > 0)
            .map(m => ({ label: m.mergedLabel, description: m.mergedDescription, d1Ids: m.d1Ids }));
          const mergedAsD2 = mergedConcepts
            .filter(m => m.d2Ids && m.d2Ids.length > 0)
            .map(m => ({ label: m.mergedLabel, description: m.mergedDescription, d2Ids: m.d2Ids }));
          
          currentD1Concepts = [...unmergedD1Concepts.map(c => ({ label: c.label, description: c.description, d1Ids: c.elementIds })), ...mergedAsD1];
          currentD2Concepts = [...unmergedD2Concepts.map(c => ({ label: c.label, description: c.description, d2Ids: c.elementIds })), ...mergedAsD2];
        }
      }

      updateStep("merge", { 
        status: "completed", 
        message: `${mergedConcepts.length} merged, ${unmergedD1Concepts.length} gaps, ${unmergedD2Concepts.length} orphans`, 
        progress: 100, 
        completedAt: new Date() 
      });

      // Save intermediate state for restart functionality
      intermediateStateRef.current = {
        d1Concepts,
        d2Concepts,
        mergedConcepts,
        unmergedD1Concepts,
        unmergedD2Concepts,
      };

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
      // PHASE 3: Build Tesseract cells - ONE CALL PER CONCEPT
      // ========================================
      setProgress({ phase: "building_tesseract", message: "Analyzing alignment...", progress: 65 });
      updateStep("tesseract", { status: "running", message: "Preparing concepts...", startedAt: new Date() });

      // Get concept nodes for tesseract analysis
      const conceptNodes = localNodes.filter(n => n.node_type === "concept");

      // Build D1/D2 element content maps for tesseract
      const d1ContentMap = new Map<string, Element>();
      const d2ContentMap = new Map<string, Element>();
      d1Elements.forEach(e => d1ContentMap.set(e.id, e));
      d2Elements.forEach(e => d2ContentMap.set(e.id, e));

      // Prepare concepts for tesseract with full content
      const conceptsForTesseract = conceptNodes.map(node => {
        const d1Els: Array<{ id: string; label: string; content: string }> = [];
        const d2Els: Array<{ id: string; label: string; content: string }> = [];
        
        for (const elId of node.source_element_ids) {
          const d1El = d1ContentMap.get(elId);
          const d2El = d2ContentMap.get(elId);
          if (d1El) d1Els.push({ id: d1El.id, label: d1El.label, content: d1El.content });
          if (d2El) d2Els.push({ id: d2El.id, label: d2El.label, content: d2El.content });
        }

        return {
          conceptId: node.id,
          conceptLabel: node.label,
          conceptDescription: node.description || "",
          d1Elements: d1Els,
          d2Elements: d2Els,
        };
      });

      const totalConcepts = conceptsForTesseract.length;
      updateStep("tesseract", { message: `Analyzing ${totalConcepts} concepts...`, progress: 5 });

      if (totalConcepts === 0) {
        updateStep("tesseract", { status: "completed", message: "No concepts to analyze", progress: 100, completedAt: new Date() });
      } else {
        // Process concepts one at a time for better progress tracking
        const TESSERACT_PARALLEL = 1;
        let completedCount = 0;
        let errorCount = 0;

        const processTesseractConcept = async (concept: typeof conceptsForTesseract[0], index: number): Promise<void> => {
          const conceptName = concept.conceptLabel.slice(0, 40);
          console.log(`[tesseract] === START concept ${index + 1}/${totalConcepts}: ${conceptName} ===`);
          
          try {
            // Calculate payload size for debugging
            const payload = { 
              sessionId, 
              projectId, 
              shareToken, 
              concepts: [concept]  // Full content, no truncation
            };
            const payloadStr = JSON.stringify(payload);
            const payloadSizeKB = Math.round(payloadStr.length / 1024);
            const d1ContentSize = concept.d1Elements.reduce((sum, e) => sum + (e.content?.length || 0), 0);
            const d2ContentSize = concept.d2Elements.reduce((sum, e) => sum + (e.content?.length || 0), 0);

            addStepDetail("tesseract", `Starting: ${conceptName} (${payloadSizeKB}KB payload, D1: ${Math.round(d1ContentSize/1024)}KB, D2: ${Math.round(d2ContentSize/1024)}KB)`);
            console.log(`[tesseract] Sending payload: ${payloadSizeKB}KB`);

            let response: Response;
            try {
              response = await fetch(`${BASE_URL}/audit-build-tesseract`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payloadStr,
              });
            } catch (fetchErr: any) {
              const fetchErrMsg = `${conceptName}: Fetch failed - ${fetchErr?.message || 'Network error'}`;
              console.error(`[tesseract] Fetch error:`, fetchErrMsg);
              addStepDetail("tesseract", `❌ ${fetchErrMsg}`);
              errorCount++;
              return;
            }

            console.log(`[tesseract] Response status: ${response.status}`);

            if (!response.ok) {
              let errorText = "Unknown error";
              try {
                errorText = await response.text();
              } catch (e) {
                console.error(`[tesseract] Failed to read error text:`, e);
              }
              const errorMsg = `${conceptName}: HTTP ${response.status} - ${errorText.slice(0, 300)}`;
              console.error(`[tesseract] HTTP error:`, errorMsg);
              addStepDetail("tesseract", `❌ ${errorMsg}`);
              errorCount++;
              return;
            }

            // Parse JSON response (not SSE)
            let result: any;
            try {
              result = await response.json();
              console.log(`[tesseract] Parsed JSON result:`, JSON.stringify(result).slice(0, 200));
            } catch (jsonErr: any) {
              const jsonErrMsg = `${conceptName}: JSON parse failed - ${jsonErr?.message || 'Unknown'}`;
              console.error(`[tesseract] JSON parse error:`, jsonErrMsg);
              addStepDetail("tesseract", `❌ ${jsonErrMsg}`);
              errorCount++;
              return;
            }
            
            if (!result.success) {
              const errorMsg = `${conceptName}: ${result.error || 'Unknown error from edge function'}`;
              console.error(`[tesseract] Edge function reported failure:`, errorMsg);
              addStepDetail("tesseract", `❌ ${errorMsg}`);
              errorCount++;
              return;
            }

            // Process cells from response
            if (result.cells && result.cells.length > 0) {
              console.log(`[tesseract] Got ${result.cells.length} cells`);
              for (const c of result.cells) {
                const cell: LocalTesseractCell = {
                  id: localId(),
                  conceptLabel: c.conceptLabel,
                  conceptDescription: concept.conceptDescription,
                  polarity: c.polarity,
                  rationale: c.rationale || "", // Full rationale, no truncation
                  d1ElementIds: concept.d1Elements.map(e => e.id),
                  d2ElementIds: concept.d2Elements.map(e => e.id),
                };
                localTesseractCells.push(cell);
                
                const polarityStr = c.polarity >= 0 ? `+${c.polarity.toFixed(2)}` : c.polarity.toFixed(2);
                addStepDetail("tesseract", `✓ ${c.conceptLabel}: ${polarityStr}`);
                console.log(`[tesseract] Added cell: ${c.conceptLabel} = ${polarityStr}`);
                updateResults(); // Update immediately so UI reflects new cell
              }
              completedCount++;
              console.log(`[tesseract] === END concept ${index + 1}: SUCCESS ===`);
            } else {
              // No cells returned - edge function errors are in result.errors
              if (result.errors && result.errors.length > 0) {
                const errorMsg = `${conceptName}: ${result.errors.join(', ')}`;
                console.error(`[tesseract] Edge function errors:`, errorMsg);
                addStepDetail("tesseract", `❌ ${errorMsg}`);
                errorCount++;
              } else {
                console.warn(`[tesseract] No cells returned for ${conceptName}`);
                addStepDetail("tesseract", `⚠ ${conceptName}: No cells returned`);
                errorCount++;
              }
              console.log(`[tesseract] === END concept ${index + 1}: NO CELLS ===`);
            }

          } catch (err: any) {
            const errorMsg = `${conceptName}: ${err?.message || 'Unknown error'}`;
            console.error(`[tesseract] Uncaught error:`, err);
            addStepDetail("tesseract", `❌ ${errorMsg}`);
            errorCount++;
            console.log(`[tesseract] === END concept ${index + 1}: ERROR ===`);
          }
        };

        // Process concepts one at a time
        const errorMessages: string[] = [];
        
        for (let i = 0; i < conceptsForTesseract.length; i++) {
          if (abortRef.current) throw new Error("Aborted");
          
          const concept = conceptsForTesseract[i];
          
          // Update progress at concept start
          updateStep("tesseract", { 
            message: `Concept ${i + 1}/${totalConcepts}: ${concept.conceptLabel.slice(0, 30)}...`, 
            progress: Math.round((i / totalConcepts) * 90) + 5 
          });
          
          await processTesseractConcept(concept, i);
          
          // Update progress after concept completes
          const progressPercent = Math.round(((i + 1) / totalConcepts) * 90) + 5;
          updateStep("tesseract", { 
            message: `Completed ${completedCount}/${totalConcepts} concepts (${errorCount} errors)`, 
            progress: progressPercent 
          });
        }

        const finalMessage = errorCount > 0 
          ? `${localTesseractCells.length} cells analyzed (${errorCount} errors)`
          : `${localTesseractCells.length} cells analyzed`;
        
        // Collect error details from step details
        const stepDetails = steps.find(s => s.id === "tesseract")?.details || [];
        const failedDetails = stepDetails.filter(d => d.startsWith("❌")).join("\n");
        
        updateStep("tesseract", { 
          status: errorCount === totalConcepts ? "error" : "completed", 
          message: finalMessage, 
          progress: 100, 
          completedAt: new Date(),
          errorMessage: errorCount > 0 ? `${errorCount} concept(s) failed:\n${failedDetails}` : undefined
        });
      }

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
          // Handle both snake_case (from server) and camelCase field names
          localVennResult = {
            uniqueToD1: data.unique_to_d1 || data.uniqueToD1 || [],
            aligned: data.aligned || [],
            uniqueToD2: data.unique_to_d2 || data.uniqueToD2 || [],
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
    intermediateStateRef.current = {
      d1Concepts: [],
      d2Concepts: [],
      mergedConcepts: [],
      unmergedD1Concepts: [],
      unmergedD2Concepts: [],
    };
  }, []);

  // Restart from a specific step - re-runs that step and all subsequent steps
  const restartStep = useCallback(async (stepId: PipelineStepId) => {
    if (!lastInputRef.current) {
      console.error("[restartStep] No input available");
      return;
    }
    
    const input = lastInputRef.current;
    
    // Determine which steps to re-run based on the restart point
    const stepOrder: PipelineStepId[] = ["nodes", "d1", "d2", "merge", "graph", "tesseract", "venn"];
    const restartIndex = stepOrder.indexOf(stepId);
    
    if (restartIndex === -1) {
      console.error(`[restartStep] Unknown step: ${stepId}`);
      return;
    }
    
    // Mark steps from restart point onwards as pending
    setSteps(prev => prev.map((s, idx) => {
      const stepIdx = stepOrder.indexOf(s.id as PipelineStepId);
      if (stepIdx >= restartIndex) {
        return { ...s, status: "pending" as const, message: "Waiting...", progress: 0, details: [], errorMessage: undefined };
      }
      return s;
    }));
    
    // If restarting from nodes (beginning), just run the full pipeline
    if (stepId === "nodes") {
      await runPipeline(input);
      return;
    }
    
    // For other steps, we need existing results
    if (!results) {
      console.error("[restartStep] No results available for partial restart");
      return;
    }
    
    const { sessionId, projectId, shareToken, d1Elements, d2Elements } = input;
    
    // Clone current results to work with
    let localNodes = [...results.nodes];
    let localEdges = [...results.edges];
    let localTesseractCells = [...results.tesseractCells];
    let localVennResult = results.vennResult;
    
    // Get intermediate state
    let { d1Concepts, d2Concepts, mergedConcepts, unmergedD1Concepts, unmergedD2Concepts } = intermediateStateRef.current;
    
    const updateResults = () => {
      setResults({
        nodes: [...localNodes],
        edges: [...localEdges],
        tesseractCells: [...localTesseractCells],
        vennResult: localVennResult,
      });
    };
    
    setIsRunning(true);
    abortRef.current = false;
    setError(null);

    try {
      // Helper for D1/D2 extraction restart
      const runExtractionStep = async (dataset: "d1" | "d2", elements: Element[], stepIdStr: string) => {
        updateStep(stepIdStr, { status: "running", message: "Extracting concepts...", startedAt: new Date(), details: [] });
        
        // Remove old concept nodes for this dataset
        const datasetStr = dataset === "d1" ? "dataset1" : "dataset2";
        const oldConceptIds = new Set(localNodes.filter(n => n.node_type === "concept" && n.source_dataset === datasetStr && n.metadata?.premerge).map(n => n.id));
        localNodes = localNodes.filter(n => !oldConceptIds.has(n.id));
        localEdges = localEdges.filter(e => !oldConceptIds.has(e.source_node_id) && !oldConceptIds.has(e.target_node_id));
        
        const response = await fetch(`${BASE_URL}/audit-extract-concepts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, projectId, shareToken, dataset, elements }),
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error || "Extraction failed");
        
        const concepts: Concept[] = result.concepts || [];
        
        // Add concept nodes
        for (const concept of concepts) {
          const conceptNode: LocalGraphNode = {
            id: localId(),
            label: concept.label,
            description: concept.description || "",
            node_type: "concept",
            source_dataset: datasetStr,
            source_element_ids: concept.elementIds,
            color: dataset === "d1" ? "#60a5fa" : "#4ade80",
            size: 20,
            metadata: { source: dataset, premerge: true },
          };
          localNodes.push(conceptNode);
          
          for (const elId of concept.elementIds) {
            const elementNode = localNodes.find(n => n.metadata?.originalElementId === elId);
            if (elementNode) {
              localEdges.push({
                id: localId(),
                source_node_id: elementNode.id,
                target_node_id: conceptNode.id,
                edge_type: dataset === "d1" ? "defines" : "implements",
                label: dataset === "d1" ? "defines" : "implements",
                weight: 1.0,
                metadata: { premerge: true },
              });
            }
          }
          addStepDetail(stepIdStr, `Concept: ${concept.label}`);
        }
        
        updateResults();
        updateStep(stepIdStr, { status: "completed", message: `${concepts.length} concepts`, progress: 100, completedAt: new Date() });
        return concepts;
      };

      // Helper to run merge step
      const runMergeStep = async () => {
        updateStep("merge", { status: "running", message: "Merging concepts...", startedAt: new Date(), details: [] });
        
        const d1ForMerge = d1Concepts.map(c => ({ label: c.label, description: c.description, d1Ids: c.elementIds }));
        const d2ForMerge = d2Concepts.map(c => ({ label: c.label, description: c.description, d2Ids: c.elementIds }));
        
        const response = await fetch(`${BASE_URL}/audit-merge-concepts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, projectId, shareToken, d1Concepts: d1ForMerge, d2Concepts: d2ForMerge }),
        });
        
        if (!response.ok) throw new Error(`Merge failed: ${response.status}`);
        
        await streamSSE(
          response,
          (data) => updateStep("merge", { message: data.message || "Merging...", progress: data.progress || 50 }),
          () => {},
          (data) => {
            mergedConcepts = data.mergedConcepts || [];
            unmergedD1Concepts = (data.unmergedD1Concepts || []).map((c: any) => ({ label: c.label, description: c.description, elementIds: c.d1Ids || [] }));
            unmergedD2Concepts = (data.unmergedD2Concepts || []).map((c: any) => ({ label: c.label, description: c.description, elementIds: c.d2Ids || [] }));
          },
          (err) => { throw new Error(err); }
        );
        
        intermediateStateRef.current = { d1Concepts, d2Concepts, mergedConcepts, unmergedD1Concepts, unmergedD2Concepts };
        updateStep("merge", { status: "completed", message: `${mergedConcepts.length} merged`, progress: 100, completedAt: new Date() });
      };

      // Helper to rebuild graph
      const runGraphStep = async () => {
        updateStep("graph", { status: "running", message: "Building graph edges...", startedAt: new Date(), details: [] });
        
        // Remove premerge concepts and their edges
        const premergeIds = new Set(localNodes.filter(n => n.metadata?.premerge).map(n => n.id));
        localNodes = localNodes.filter(n => !premergeIds.has(n.id));
        localEdges = localEdges.filter(e => !premergeIds.has(e.source_node_id) && !premergeIds.has(e.target_node_id));
        
        // Also remove merged/gap/orphan concepts (will recreate)
        const conceptIds = new Set(localNodes.filter(n => n.node_type === "concept").map(n => n.id));
        localNodes = localNodes.filter(n => n.node_type !== "concept");
        localEdges = localEdges.filter(e => !conceptIds.has(e.source_node_id) && !conceptIds.has(e.target_node_id));
        
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
            metadata: { merged: true },
          };
          localNodes.push(conceptNode);
          
          for (const d1Id of concept.d1Ids) {
            const d1Node = localNodes.find(n => n.metadata?.originalElementId === d1Id);
            if (d1Node) localEdges.push({ id: localId(), source_node_id: d1Node.id, target_node_id: conceptNode.id, edge_type: "defines", label: "defines", weight: 1.0, metadata: {} });
          }
          for (const d2Id of concept.d2Ids) {
            const d2Node = localNodes.find(n => n.metadata?.originalElementId === d2Id);
            if (d2Node) localEdges.push({ id: localId(), source_node_id: d2Node.id, target_node_id: conceptNode.id, edge_type: "implements", label: "implements", weight: 1.0, metadata: {} });
          }
          addStepDetail("graph", `Merged: ${concept.mergedLabel}`);
        }
        
        // Create gap nodes (D1 only)
        for (const concept of unmergedD1Concepts) {
          const gapNode: LocalGraphNode = { id: localId(), label: concept.label, description: concept.description, node_type: "concept", source_dataset: "dataset1", source_element_ids: concept.elementIds, color: "#ef4444", size: 22, metadata: { gap: true } };
          localNodes.push(gapNode);
          for (const d1Id of concept.elementIds) {
            const d1Node = localNodes.find(n => n.metadata?.originalElementId === d1Id);
            if (d1Node) localEdges.push({ id: localId(), source_node_id: d1Node.id, target_node_id: gapNode.id, edge_type: "defines", label: "defines", weight: 1.0, metadata: {} });
          }
        }
        
        // Create orphan nodes (D2 only)
        for (const concept of unmergedD2Concepts) {
          const orphanNode: LocalGraphNode = { id: localId(), label: concept.label, description: concept.description, node_type: "concept", source_dataset: "dataset2", source_element_ids: concept.elementIds, color: "#f97316", size: 22, metadata: { orphan: true } };
          localNodes.push(orphanNode);
          for (const d2Id of concept.elementIds) {
            const d2Node = localNodes.find(n => n.metadata?.originalElementId === d2Id);
            if (d2Node) localEdges.push({ id: localId(), source_node_id: d2Node.id, target_node_id: orphanNode.id, edge_type: "implements", label: "implements", weight: 1.0, metadata: {} });
          }
        }
        
        updateResults();
        updateStep("graph", { status: "completed", message: `${localNodes.length} nodes, ${localEdges.length} edges`, progress: 100, completedAt: new Date() });
      };

      // Helper to run tesseract
      const runTesseractStep = async () => {
        updateStep("tesseract", { status: "running", message: "Building tesseract...", startedAt: new Date(), details: [] });
        localTesseractCells = [];
        
        const conceptNodes = localNodes.filter(n => n.node_type === "concept");
        const d1ContentMap = new Map<string, Element>();
        const d2ContentMap = new Map<string, Element>();
        d1Elements.forEach(e => d1ContentMap.set(e.id, e));
        d2Elements.forEach(e => d2ContentMap.set(e.id, e));
        
        const conceptsForTesseract = conceptNodes.map(node => {
          const d1Els: Array<{ id: string; label: string; content: string }> = [];
          const d2Els: Array<{ id: string; label: string; content: string }> = [];
          for (const elId of node.source_element_ids) {
            const d1El = d1ContentMap.get(elId);
            const d2El = d2ContentMap.get(elId);
            if (d1El) d1Els.push({ id: d1El.id, label: d1El.label, content: d1El.content });
            if (d2El) d2Els.push({ id: d2El.id, label: d2El.label, content: d2El.content });
          }
          return { conceptId: node.id, conceptLabel: node.label, conceptDescription: node.description || "", d1Elements: d1Els, d2Elements: d2Els };
        });
        
        for (let i = 0; i < conceptsForTesseract.length; i++) {
          if (abortRef.current) throw new Error("Aborted");
          const concept = conceptsForTesseract[i];
          updateStep("tesseract", { message: `Concept ${i + 1}/${conceptsForTesseract.length}: ${concept.conceptLabel.slice(0, 30)}...`, progress: Math.round((i / conceptsForTesseract.length) * 90) + 5 });
          
          try {
            const response = await fetch(`${BASE_URL}/audit-build-tesseract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, projectId, shareToken, concepts: [concept] }) });
            if (!response.ok) { addStepDetail("tesseract", `❌ ${concept.conceptLabel}: HTTP ${response.status}`); continue; }
            const result = await response.json();
            if (!result.success) { addStepDetail("tesseract", `❌ ${concept.conceptLabel}: ${result.error}`); continue; }
            
            for (const c of (result.cells || [])) {
              localTesseractCells.push({ id: localId(), conceptLabel: c.conceptLabel, conceptDescription: concept.conceptDescription, polarity: c.polarity, rationale: c.rationale || "", d1ElementIds: concept.d1Elements.map(e => e.id), d2ElementIds: concept.d2Elements.map(e => e.id) });
              addStepDetail("tesseract", `✓ ${c.conceptLabel}: ${c.polarity >= 0 ? '+' : ''}${c.polarity.toFixed(2)}`);
            }
            updateResults();
          } catch (err: any) {
            addStepDetail("tesseract", `❌ ${concept.conceptLabel}: ${err.message}`);
          }
        }
        
        updateStep("tesseract", { status: "completed", message: `${localTesseractCells.length} cells analyzed`, progress: 100, completedAt: new Date() });
      };

      // Helper to run venn
      const runVennStep = async () => {
        updateStep("venn", { status: "running", message: "Generating Venn analysis...", startedAt: new Date(), details: [] });
        
        const response = await fetch(`${BASE_URL}/audit-generate-venn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, projectId, shareToken, mergedConcepts, unmergedD1Concepts, unmergedD2Concepts, tesseractCells: localTesseractCells }),
        });
        
        if (!response.ok) throw new Error(`Venn failed: ${response.status}`);
        
        await streamSSE(
          response,
          (data) => updateStep("venn", { message: data.message || "Generating...", progress: data.progress || 50 }),
          () => {},
          (data) => {
            localVennResult = { uniqueToD1: data.unique_to_d1 || data.uniqueToD1 || [], aligned: data.aligned || [], uniqueToD2: data.unique_to_d2 || data.uniqueToD2 || [], summary: data.summary || "" };
            updateResults();
          },
          (err) => { throw new Error(err); }
        );
        
        updateStep("venn", { status: "completed", message: "Venn analysis complete", progress: 100, completedAt: new Date() });
      };

      // Execute steps from restart point onwards
      const stepsToRun = stepOrder.slice(restartIndex);
      
      for (const step of stepsToRun) {
        if (abortRef.current) throw new Error("Aborted");
        setProgress({ phase: step === "d1" ? "extracting_d1" : step === "d2" ? "extracting_d2" : step === "merge" ? "merging_concepts" : step === "graph" ? "building_graph" : step === "tesseract" ? "building_tesseract" : step === "venn" ? "generating_venn" : "idle", message: `Running ${step}...`, progress: 50 });
        
        switch (step) {
          case "d1":
            d1Concepts = await runExtractionStep("d1", d1Elements, "d1");
            break;
          case "d2":
            d2Concepts = await runExtractionStep("d2", d2Elements, "d2");
            break;
          case "merge":
            await runMergeStep();
            break;
          case "graph":
            await runGraphStep();
            break;
          case "tesseract":
            await runTesseractStep();
            break;
          case "venn":
            await runVennStep();
            break;
        }
      }
      
      setProgress({ phase: "completed", message: "Pipeline restart complete", progress: 100 });

    } catch (err: any) {
      console.error("[restartStep] Error:", err);
      setError(err.message || "Restart failed");
      const currentStep = steps.find(s => s.status === "running");
      if (currentStep) {
        updateStep(currentStep.id, { status: "error", message: err.message || "Restart failed", errorMessage: err.message });
      }
    } finally {
      setIsRunning(false);
    }
  }, [results, steps, updateStep, addStepDetail, runPipeline]);

  return {
    isRunning,
    progress,
    steps,
    error,
    results,
    runPipeline,
    restartStep,
    abort,
    clearResults,
    reconstructStepsFromActivity,
  };
}
