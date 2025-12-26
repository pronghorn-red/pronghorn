// Audit Pipeline Phase 1: Extract concepts from dataset elements
// Called twice in parallel - once for D1, once for D2
// Processes elements in batches to avoid timeout/payload issues
// Returns concepts with linked element IDs via SSE streaming

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 8; // Process 8 elements at a time

interface DatasetElement {
  id: string;
  label: string;
  content: string;
  category?: string;
}

interface ExtractedConcept {
  label: string;
  description: string;
  elementIds: string[];
}

interface ExtractRequest {
  sessionId: string;
  projectId: string;
  shareToken: string;
  dataset: "d1" | "d2";
  elements: DatasetElement[];
}

async function extractConceptsFromBatch(
  elements: DatasetElement[], 
  batchIndex: number,
  totalBatches: number,
  dataset: string,
  geminiKey: string
): Promise<ExtractedConcept[]> {
  const datasetLabel = dataset === "d1" ? "requirements/specifications" : "implementation/code";
  
  // Build element list with full content (up to 500 chars per element)
  const elementsText = elements.map((e, i) => {
    const content = (e.content || "").slice(0, 500);
    return `[Element ${i + 1}]
ID: ${e.id}
Label: ${e.label}
Category: ${e.category || "unknown"}
Content: ${content}`;
  }).join("\n\n---\n\n");

  const prompt = `You are analyzing ${datasetLabel} elements (batch ${batchIndex + 1}/${totalBatches}).

## Elements to analyze:
${elementsText}

## Task
Identify 2-5 high-level CONCEPTS that group these ${elements.length} elements by theme, purpose, or functionality.
Each concept should capture a meaningful grouping.
Every element MUST be assigned to at least one concept.

## Output Format (JSON only)
{
  "concepts": [
    {
      "label": "Concept Name (2-4 words)",
      "description": "Clear explanation of what this concept covers and why the elements belong together (2-3 sentences)",
      "elementIds": ["element-uuid-1", "element-uuid-2"]
    }
  ]
}

CRITICAL RULES:
1. Every element UUID listed above MUST appear in at least one concept's elementIds
2. Use the exact UUIDs from the elements
3. Return ONLY valid JSON, no other text`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${dataset}] Batch ${batchIndex + 1} Gemini error:`, response.status, errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  
  console.log(`[${dataset}] Batch ${batchIndex + 1} response length: ${rawText.length}`);

  // Parse JSON with recovery
  let parsed: { concepts: ExtractedConcept[] };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error(`[${dataset}] Batch ${batchIndex + 1} JSON parse failed, attempting recovery...`);
    const firstBrace = rawText.indexOf("{");
    const lastBrace = rawText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
    } else {
      throw new Error(`Failed to parse JSON from batch ${batchIndex + 1}`);
    }
  }

  return parsed.concepts || [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendSSE = async (event: string, data: any) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    await writer.write(encoder.encode(message));
  };

  (async () => {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const geminiKey = Deno.env.get("GEMINI_API_KEY")!;

      const authHeader = req.headers.get("Authorization");
      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: authHeader ? { Authorization: authHeader } : {} },
      });

      const { sessionId, projectId, shareToken, dataset, elements }: ExtractRequest = await req.json();
      
      const datasetLabel = dataset === "d1" ? "D1" : "D2";
      console.log(`[${dataset}] Starting batched extraction for ${elements.length} elements`);

      await sendSSE("progress", { 
        phase: `${dataset}_extraction`, 
        message: `Starting ${datasetLabel} analysis (${elements.length} elements)...`,
        progress: 0,
        elementCount: elements.length
      });

      // Split elements into batches
      const batches: DatasetElement[][] = [];
      for (let i = 0; i < elements.length; i += BATCH_SIZE) {
        batches.push(elements.slice(i, i + BATCH_SIZE));
      }

      console.log(`[${dataset}] Split into ${batches.length} batches of ${BATCH_SIZE}`);

      const allConcepts: ExtractedConcept[] = [];

      // Process each batch
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const progressPercent = Math.round((batchIndex / batches.length) * 80) + 10;

        await sendSSE("progress", { 
          phase: `${dataset}_extraction`, 
          message: `Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} elements)...`,
          progress: progressPercent,
          batch: batchIndex + 1,
          totalBatches: batches.length
        });

        try {
          const batchConcepts = await extractConceptsFromBatch(
            batch, 
            batchIndex, 
            batches.length, 
            dataset, 
            geminiKey
          );

          console.log(`[${dataset}] Batch ${batchIndex + 1} extracted ${batchConcepts.length} concepts`);

          // Stream each concept as it's extracted
          for (const concept of batchConcepts) {
            allConcepts.push(concept);
            await sendSSE("concept", {
              index: allConcepts.length - 1,
              batch: batchIndex + 1,
              label: concept.label,
              description: concept.description,
              elementCount: concept.elementIds.length
            });
          }
        } catch (batchError) {
          console.error(`[${dataset}] Batch ${batchIndex + 1} failed:`, batchError);
          await sendSSE("progress", { 
            phase: `${dataset}_extraction`, 
            message: `Batch ${batchIndex + 1} failed, continuing...`,
            progress: progressPercent,
            error: true
          });
          // Continue with other batches
        }
      }

      console.log(`[${dataset}] Total extracted: ${allConcepts.length} concepts`);

      await sendSSE("progress", { 
        phase: `${dataset}_extraction`, 
        message: `Extracted ${allConcepts.length} concepts from ${elements.length} elements`,
        progress: 90,
        conceptCount: allConcepts.length
      });

      // Log to blackboard
      await supabase.rpc("insert_audit_blackboard_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: `${dataset}_extractor`,
        p_entry_type: `${dataset}_concepts`,
        p_content: `Extracted ${allConcepts.length} concepts from ${elements.length} elements:\n${allConcepts.map(c => `• ${c.label} (${c.elementIds.length} elements)`).join("\n")}`,
        p_iteration: 1,
        p_confidence: 0.9,
        p_evidence: null,
        p_target_agent: null,
      });

      // Log activity
      await supabase.rpc("insert_audit_activity_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: `${dataset}_extractor`,
        p_activity_type: "concept_extraction",
        p_title: `${datasetLabel} Concept Extraction Complete`,
        p_content: `Extracted ${allConcepts.length} concepts from ${elements.length} elements across ${batches.length} batches`,
        p_metadata: { conceptCount: allConcepts.length, elementCount: elements.length, batchCount: batches.length, dataset },
      });

      await sendSSE("progress", { 
        phase: `${dataset}_extraction`, 
        message: `Complete! ${allConcepts.length} concepts`,
        progress: 100
      });

      await sendSSE("result", { 
        success: true, 
        concepts: allConcepts, 
        dataset, 
        elementCount: elements.length,
        batchCount: batches.length
      });
      
      await sendSSE("done", { success: true });

    } catch (error: unknown) {
      console.error("Concept extraction error:", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      await sendSSE("error", { message: errMsg });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
