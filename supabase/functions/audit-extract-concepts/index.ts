// Audit Pipeline Phase 1: Extract concepts from dataset elements
// Called twice in parallel - once for D1, once for D2
// Returns concepts with linked element IDs

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      
      const datasetLabel = dataset === "d1" ? "D1 (requirements)" : "D2 (implementation)";
      const datasetContext = dataset === "d1" 
        ? "requirements, specifications, or source of truth items"
        : "implementation artifacts like code files, configurations, or deliverables";
      
      await sendSSE("progress", { 
        phase: `${dataset}_extraction`, 
        message: `Analyzing ${elements.length} ${datasetLabel} elements...`, 
        progress: 0 
      });

      // Build the prompt for concept extraction
      const elementsText = elements.map((e, i) => 
        `### Element ${i + 1}: ${e.label}\nID: ${e.id}\nCategory: ${e.category || "unknown"}\nContent:\n${e.content || "(no content)"}`
      ).join("\n\n---\n\n");

      const prompt = `You are analyzing Dataset ${dataset.toUpperCase()} elements to extract common concepts/themes.

## ${datasetLabel} Elements (${elements.length} total)

These are ${datasetContext}.

${elementsText}

## Your Task

Analyze ALL elements and identify the common CONCEPTS that tie them together. Each element MUST be linked to at least one concept.

A concept is a high-level theme, category, or functional area that groups related elements. Examples:
${dataset === "d1" ? `- "User Authentication" - groups login, logout, session management requirements
- "Data Validation" - groups input validation, sanitization requirements
- "Error Handling" - groups error logging, user feedback requirements` : 
`- "User Authentication" - groups login, session, auth-related files
- "API Endpoints" - groups route handlers, controllers
- "Database Operations" - groups models, migrations, queries
- "UI Components" - groups React components, views`}

## Output Format

Return a JSON object with this exact structure:
{
  "concepts": [
    {
      "label": "Concept Name",
      "description": "A detailed description explaining what this concept represents and why the linked elements belong to it. Be thorough - this description helps humans understand the grouping.",
      "elementIds": ["uuid1", "uuid2", "uuid3"]
    }
  ],
  "unmappedIds": []
}

RULES:
1. Every element ID MUST appear in at least one concept's elementIds array
2. An element CAN appear in multiple concepts if it spans multiple themes
3. Create 3-15 concepts depending on the variety of elements
4. Descriptions should be 2-4 sentences explaining the concept's purpose
5. unmappedIds should ideally be empty - try to map everything

Return ONLY the JSON object, no other text.`;

      await sendSSE("progress", { 
        phase: `${dataset}_extraction`, 
        message: "Calling LLM for concept extraction...", 
        progress: 20 
      });

      // Call Gemini
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 8192,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
      }

      const result = await response.json();
      const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      
      await sendSSE("progress", { 
        phase: `${dataset}_extraction`, 
        message: "Parsing LLM response...", 
        progress: 60 
      });

      // Parse JSON from response
      let parsed: { concepts: ExtractedConcept[]; unmappedIds?: string[] };
      try {
        parsed = JSON.parse(rawText);
      } catch {
        const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          const firstBrace = rawText.indexOf("{");
          const lastBrace = rawText.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
          } else {
            throw new Error("Could not parse JSON from LLM response");
          }
        }
      }

      const concepts = parsed.concepts || [];
      const unmappedIds = parsed.unmappedIds || [];

      await sendSSE("progress", { 
        phase: `${dataset}_extraction`, 
        message: `Extracted ${concepts.length} concepts from ${datasetLabel}`, 
        progress: 80,
        conceptCount: concepts.length,
        unmappedCount: unmappedIds.length
      });

      // Write to blackboard for logging
      await supabase.rpc("insert_audit_blackboard_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: `${dataset}_extractor`,
        p_entry_type: `${dataset}_concepts`,
        p_content: `Extracted ${concepts.length} concepts from ${elements.length} ${datasetLabel} elements:\n${concepts.map(c => `- ${c.label}: ${c.elementIds.length} elements`).join("\n")}`,
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
        p_content: `Extracted ${concepts.length} concepts from ${elements.length} elements`,
        p_metadata: { conceptCount: concepts.length, elementCount: elements.length, dataset },
      });

      await sendSSE("progress", { 
        phase: `${dataset}_extraction`, 
        message: `${datasetLabel} extraction complete`, 
        progress: 100 
      });
      await sendSSE("result", { concepts, unmappedIds, dataset, elementCount: elements.length });
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
