// Audit Pipeline Phase 1: Extract concepts from dataset elements
// Called twice in parallel - once for D1, once for D2
// Processes elements in batches to manage LLM calls
// Returns concepts with linked element IDs via SSE streaming

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Elements per LLM batch - only used if > 200k chars total
// For smaller inputs, we send ALL elements in one LLM call
const BATCH_SIZE = 15; // Larger batches when needed
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const MAX_OUTPUT_TOKENS = 16384;
const CHAR_THRESHOLD_FOR_BATCHING = 200000; // Only batch if > 200k chars

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
  anthropicKey: string,
  sendSSE: (event: string, data: any) => Promise<void>
): Promise<ExtractedConcept[]> {
  const datasetLabel = dataset === "d1" ? "requirements/specifications" : "implementation/code";
  
  // Build element list with FULL content - NO TRUNCATION
  const elementsText = elements.map((e, i) => {
    return `[Element ${i + 1}]
ID: ${e.id}
Label: ${e.label}
Category: ${e.category || "unknown"}
Content:
${e.content || "(empty)"}`;
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

  // Log payload size
  const payloadChars = prompt.length;
  const estimatedTokens = Math.ceil(payloadChars / 4); // rough estimate: 4 chars per token
  console.log(`[${dataset}] Batch ${batchIndex + 1}/${totalBatches}: ${payloadChars.toLocaleString()} chars (~${estimatedTokens.toLocaleString()} tokens)`);

  await sendSSE("progress", { 
    phase: `${dataset}_extraction`, 
    message: `Batch ${batchIndex + 1}/${totalBatches}: ${payloadChars.toLocaleString()} chars (~${estimatedTokens.toLocaleString()} tokens)`,
    progress: Math.round(((batchIndex + 0.5) / totalBatches) * 80) + 10,
    batch: batchIndex + 1,
    totalBatches,
    payloadChars,
    estimatedTokens
  });

  // Use Claude with 1M context window
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "context-1m-2025-08-07",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${dataset}] Batch ${batchIndex + 1} Claude error:`, response.status, errorText);
    throw new Error(`Claude API error: ${response.status} - ${errorText.slice(0, 200)}`);
  }

  const result = await response.json();
  const rawText = result.content?.[0]?.text || "{}";
  
  console.log(`[${dataset}] Batch ${batchIndex + 1} response: ${rawText.length} chars`);

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
      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

      const authHeader = req.headers.get("Authorization");
      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: authHeader ? { Authorization: authHeader } : {} },
      });

      const { sessionId, projectId, shareToken, dataset, elements }: ExtractRequest = await req.json();
      
      const datasetLabel = dataset === "d1" ? "D1" : "D2";
      
      // Calculate total content size
      const totalContentChars = elements.reduce((sum, e) => sum + (e.content?.length || 0), 0);
      const totalEstimatedTokens = Math.ceil(totalContentChars / 4);
      
      console.log(`[${dataset}] Starting extraction: ${elements.length} elements, ${totalContentChars.toLocaleString()} chars (~${totalEstimatedTokens.toLocaleString()} tokens total)`);

      await sendSSE("progress", { 
        phase: `${dataset}_extraction`, 
        message: `Starting ${datasetLabel}: ${elements.length} elements, ${totalContentChars.toLocaleString()} chars (~${totalEstimatedTokens.toLocaleString()} tokens)`,
        progress: 5,
        elementCount: elements.length,
        totalContentChars,
        totalEstimatedTokens
      });

      // Split elements into batches ONLY if total content is very large
      // For small/medium content, send ALL elements in one LLM call
      const batches: DatasetElement[][] = [];
      if (totalContentChars > CHAR_THRESHOLD_FOR_BATCHING) {
        // Large content: batch by element count
        for (let i = 0; i < elements.length; i += BATCH_SIZE) {
          batches.push(elements.slice(i, i + BATCH_SIZE));
        }
        console.log(`[${dataset}] Content exceeds ${CHAR_THRESHOLD_FOR_BATCHING.toLocaleString()} chars, splitting into ${batches.length} batches of up to ${BATCH_SIZE} elements`);
      } else {
        // Small/medium content: single batch with all elements
        batches.push(elements);
        console.log(`[${dataset}] Content under threshold, processing all ${elements.length} elements in single LLM call`);
      }

      await sendSSE("progress", { 
        phase: `${dataset}_extraction`, 
        message: `Processing ${batches.length} batch(es)...`,
        progress: 10,
        batchCount: batches.length,
        singleBatch: batches.length === 1
      });

      const allConcepts: ExtractedConcept[] = [];

      // Process each batch sequentially to avoid rate limits
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];

        try {
          const batchConcepts = await extractConceptsFromBatch(
            batch, 
            batchIndex, 
            batches.length, 
            dataset, 
            anthropicKey,
            sendSSE
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
              elementCount: concept.elementIds.length,
              elementIds: concept.elementIds
            });
          }

          await sendSSE("progress", { 
            phase: `${dataset}_extraction`, 
            message: `Batch ${batchIndex + 1}/${batches.length} complete: ${batchConcepts.length} concepts`,
            progress: Math.round(((batchIndex + 1) / batches.length) * 80) + 10,
            batch: batchIndex + 1,
            totalBatches: batches.length,
            conceptsSoFar: allConcepts.length
          });

        } catch (batchError) {
          const errMsg = batchError instanceof Error ? batchError.message : String(batchError);
          console.error(`[${dataset}] Batch ${batchIndex + 1} failed:`, errMsg);
          await sendSSE("progress", { 
            phase: `${dataset}_extraction`, 
            message: `Batch ${batchIndex + 1} failed: ${errMsg.slice(0, 100)}`,
            progress: Math.round(((batchIndex + 1) / batches.length) * 80) + 10,
            error: true,
            errorMessage: errMsg
          });
          // Continue with other batches
        }
      }

      console.log(`[${dataset}] Extraction complete: ${allConcepts.length} concepts from ${elements.length} elements`);

      await sendSSE("progress", { 
        phase: `${dataset}_extraction`, 
        message: `Complete: ${allConcepts.length} concepts from ${elements.length} elements`,
        progress: 95,
        conceptCount: allConcepts.length
      });

      // Log to blackboard
      await supabase.rpc("insert_audit_blackboard_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: `${dataset}_extractor`,
        p_entry_type: `${dataset}_concepts`,
        p_content: `Extracted ${allConcepts.length} concepts from ${elements.length} elements (${totalContentChars.toLocaleString()} chars):\n${allConcepts.map(c => `• ${c.label} (${c.elementIds.length} elements)`).join("\n")}`,
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
        p_metadata: { 
          conceptCount: allConcepts.length, 
          elementCount: elements.length, 
          batchCount: batches.length, 
          dataset,
          totalContentChars,
          totalEstimatedTokens
        },
      });

      await sendSSE("progress", { 
        phase: `${dataset}_extraction`, 
        message: `Done! ${allConcepts.length} concepts`,
        progress: 100
      });

      await sendSSE("result", { 
        success: true, 
        concepts: allConcepts, 
        dataset, 
        elementCount: elements.length,
        batchCount: batches.length,
        totalContentChars,
        totalEstimatedTokens
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
