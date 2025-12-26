// Hook for orchestrating the new audit pipeline
// Calls the 5 edge functions in sequence with SSE streaming

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PipelinePhase = 
  | "idle" 
  | "extracting_d1" 
  | "extracting_d2" 
  | "merging_concepts" 
  | "building_tesseract" 
  | "generating_venn" 
  | "completed" 
  | "error";

interface PipelineProgress {
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
  d1Ids: string[];
}

interface D2Concept {
  label: string;
  description: string;
  d2Ids: string[];
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

export function useAuditPipeline() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress>({ phase: "idle", message: "", progress: 0 });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const parseSSEStream = async (
    response: Response,
    onProgress: (data: any) => void,
    onResult: (data: any) => void
  ): Promise<void> => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          const event = line.slice(7);
          const dataLine = lines[lines.indexOf(line) + 1];
          if (dataLine?.startsWith("data: ")) {
            try {
              const data = JSON.parse(dataLine.slice(6));
              if (event === "progress") onProgress(data);
              else if (event === "result") onResult(data);
              else if (event === "error") throw new Error(data.message);
            } catch (e) {
              // Skip parse errors for partial data
            }
          }
        } else if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.phase) onProgress(data);
            else onResult(data);
          } catch (e) {
            // Skip
          }
        }
      }
    }
  };

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
      // Phase 1: Extract D1 and D2 concepts in parallel
      setProgress({ phase: "extracting_d1", message: "Extracting D1 concepts...", progress: 0 });

      const [d1Response, d2Response] = await Promise.all([
        fetch(`${baseUrl}/audit-extract-d1-concepts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, projectId, shareToken, elements: d1Elements }),
        }),
        fetch(`${baseUrl}/audit-extract-d2-concepts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, projectId, shareToken, elements: d2Elements }),
        }),
      ]);

      // Parse D1 results
      const d1Text = await d1Response.text();
      const d1ResultMatch = d1Text.match(/event: result\ndata: (.+)/);
      if (d1ResultMatch) {
        const d1Result = JSON.parse(d1ResultMatch[1]);
        d1Concepts = d1Result.concepts || [];
      }

      // Parse D2 results
      const d2Text = await d2Response.text();
      const d2ResultMatch = d2Text.match(/event: result\ndata: (.+)/);
      if (d2ResultMatch) {
        const d2Result = JSON.parse(d2ResultMatch[1]);
        d2Concepts = d2Result.concepts || [];
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
      const mergeResponse = await fetch(`${baseUrl}/audit-merge-concepts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, projectId, shareToken, d1Concepts, d2Concepts }),
      });

      const mergeText = await mergeResponse.text();
      const mergeResultMatch = mergeText.match(/event: result\ndata: (.+)/);
      if (mergeResultMatch) {
        const mergeResult = JSON.parse(mergeResultMatch[1]);
        mergedConcepts = mergeResult.mergedConcepts || [];
        unmergedD1Concepts = mergeResult.unmergedD1Concepts || [];
        unmergedD2Concepts = mergeResult.unmergedD2Concepts || [];
      }

      setProgress({ 
        phase: "building_tesseract", 
        message: `Analyzing ${mergedConcepts.length} merged concepts...`, 
        progress: 50,
        mergedCount: mergedConcepts.length
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
      const tesseractResultMatch = tesseractText.match(/event: result\ndata: (.+)/);
      let tesseractCells: any[] = [];
      if (tesseractResultMatch) {
        const tesseractResult = JSON.parse(tesseractResultMatch[1]);
        tesseractCells = tesseractResult.cells || [];
      }

      setProgress({ 
        phase: "generating_venn", 
        message: "Generating Venn analysis...", 
        progress: 80 
      });

      if (abortRef.current) throw new Error("Aborted");

      // Phase 4: Generate Venn
      const vennResponse = await fetch(`${baseUrl}/audit-generate-venn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          sessionId, projectId, shareToken,
          mergedConcepts,
          unmergedD1Concepts,
          unmergedD2Concepts,
          tesseractCells,
          d1Count: d1Elements.length,
          d2Count: d2Elements.length
        }),
      });

      const vennText = await vennResponse.text();
      const vennResultMatch = vennText.match(/event: result\ndata: (.+)/);
      
      setProgress({ phase: "completed", message: "Audit complete!", progress: 100 });

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      setProgress({ phase: "error", message: errMsg, progress: 0 });
    } finally {
      setIsRunning(false);
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { runPipeline, isRunning, progress, error, abort };
}
