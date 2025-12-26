// Audit Pipeline Phase 2: Merge similar D1 and D2 concepts
// Identifies identical/similar concepts and provides merge instructions
// The actual graph operations are done programmatically based on LLM output

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

interface MergeInstruction {
  mergedLabel: string;
  mergedDescription: string;
  d1ConceptLabels: string[];
  d2ConceptLabels: string[];
  d1Ids: string[];
  d2Ids: string[];
}

interface MergeRequest {
  sessionId: string;
  projectId: string;
  shareToken: string;
  d1Concepts: D1Concept[];
  d2Concepts: D2Concept[];
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

      const { sessionId, projectId, shareToken, d1Concepts, d2Concepts }: MergeRequest = await req.json();
      
      await sendSSE("progress", { 
        phase: "concept_merge", 
        message: `Analyzing ${d1Concepts.length} D1 concepts and ${d2Concepts.length} D2 concepts for merging...`, 
        progress: 0 
      });

      // Build the prompt
      const d1ConceptsText = d1Concepts.map((c, i) => 
        `D1-${i + 1}: "${c.label}"\nDescription: ${c.description}\nLinked D1 IDs: ${c.d1Ids.join(", ")}`
      ).join("\n\n");

      const d2ConceptsText = d2Concepts.map((c, i) => 
        `D2-${i + 1}: "${c.label}"\nDescription: ${c.description}\nLinked D2 IDs: ${c.d2Ids.join(", ")}`
      ).join("\n\n");

      const prompt = `You are merging concepts from two datasets. Your job is to identify which D1 concepts and D2 concepts are identical or nearly identical and should be merged.

## D1 Concepts (from requirements/source of truth)

${d1ConceptsText}

## D2 Concepts (from implementation)

${d2ConceptsText}

## Your Task

Compare each D1 concept with each D2 concept. If they represent the SAME functional area or theme:
- Merge them into a single concept
- The merged concept inherits ALL d1Ids from the D1 concept and ALL d2Ids from the D2 concept

Concepts should be merged if they:
- Have the same or similar names (e.g., "Authentication" and "User Authentication")
- Cover the same functional area (e.g., "Login Flow" and "Auth Handlers")
- Describe the same theme even with different wording

DO NOT merge concepts that:
- Are genuinely different functional areas
- Only share a keyword but serve different purposes

## Output Format

Return a JSON object with this exact structure:
{
  "mergedConcepts": [
    {
      "mergedLabel": "Final Concept Name",
      "mergedDescription": "Combined description that captures both D1 requirements and D2 implementation aspects",
      "d1ConceptLabels": ["Original D1 Concept Label"],
      "d2ConceptLabels": ["Original D2 Concept Label"],
      "d1Ids": ["all", "d1", "element", "ids"],
      "d2Ids": ["all", "d2", "element", "ids"]
    }
  ],
  "unmergeedD1Concepts": [
    {
      "label": "D1 Concept that has no D2 match",
      "description": "...",
      "d1Ids": ["..."]
    }
  ],
  "unmergedD2Concepts": [
    {
      "label": "D2 Concept that has no D1 match",
      "description": "...",
      "d2Ids": ["..."]
    }
  ]
}

The unmerged arrays contain concepts that could NOT be matched - these represent gaps (D1 only) or orphans (D2 only).

Return ONLY the JSON object, no other text.`;

      await sendSSE("progress", { phase: "concept_merge", message: "Calling LLM for concept matching...", progress: 20 });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
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
      
      await sendSSE("progress", { phase: "concept_merge", message: "Parsing merge instructions...", progress: 60 });

      // Parse JSON
      let parsed: { 
        mergedConcepts: MergeInstruction[]; 
        unmergeedD1Concepts?: D1Concept[];
        unmergedD1Concepts?: D1Concept[];
        unmergedD2Concepts?: D2Concept[];
      };
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

      const mergedConcepts = parsed.mergedConcepts || [];
      const unmergedD1Concepts = parsed.unmergedD1Concepts || parsed.unmergeedD1Concepts || [];
      const unmergedD2Concepts = parsed.unmergedD2Concepts || [];

      await sendSSE("progress", { 
        phase: "concept_merge", 
        message: `Found ${mergedConcepts.length} merged concepts, ${unmergedD1Concepts.length} D1-only, ${unmergedD2Concepts.length} D2-only`, 
        progress: 80 
      });

      // Write to blackboard
      await supabase.rpc("insert_audit_blackboard_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: "concept_merger",
        p_entry_type: "merge_results",
        p_content: `Concept Merge Results:\n- Merged concepts: ${mergedConcepts.length}\n- D1-only (gaps): ${unmergedD1Concepts.length}\n- D2-only (potential orphans): ${unmergedD2Concepts.length}\n\nMerged:\n${mergedConcepts.map(c => `• ${c.mergedLabel} (${c.d1Ids.length} D1, ${c.d2Ids.length} D2)`).join("\n")}`,
        p_iteration: 2,
        p_confidence: 0.85,
        p_evidence: null,
        p_target_agent: null,
      });

      // Log activity
      await supabase.rpc("insert_audit_activity_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: "concept_merger",
        p_activity_type: "concept_merge",
        p_title: `Concept Merge Complete`,
        p_content: `Merged ${mergedConcepts.length} concepts, ${unmergedD1Concepts.length} D1-only gaps, ${unmergedD2Concepts.length} D2-only orphans`,
        p_metadata: { 
          mergedCount: mergedConcepts.length, 
          d1OnlyCount: unmergedD1Concepts.length,
          d2OnlyCount: unmergedD2Concepts.length
        },
      });

      await sendSSE("progress", { phase: "concept_merge", message: "Merge analysis complete", progress: 100 });
      await sendSSE("result", { mergedConcepts, unmergedD1Concepts, unmergedD2Concepts });
      await sendSSE("done", { success: true });

    } catch (error: unknown) {
      console.error("Concept merge error:", error);
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
