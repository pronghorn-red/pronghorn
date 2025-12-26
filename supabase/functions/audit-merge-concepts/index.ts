// Audit Pipeline Phase 2: Merge similar concepts
// Merges D1↔D1, D1↔D2, D2↔D1, and D2↔D2 duplicates
// Returns merged concepts plus unmerged ones for each dataset

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const MAX_OUTPUT_TOKENS = 16384;

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
      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

      const authHeader = req.headers.get("Authorization");
      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: authHeader ? { Authorization: authHeader } : {} },
      });

      const { sessionId, projectId, shareToken, d1Concepts, d2Concepts }: MergeRequest = await req.json();
      
      console.log(`[merge] Starting: ${d1Concepts.length} D1 concepts, ${d2Concepts.length} D2 concepts`);
      
      await sendSSE("progress", { 
        phase: "concept_merge", 
        message: `Analyzing ${d1Concepts.length} D1 + ${d2Concepts.length} D2 concepts for merging...`, 
        progress: 0 
      });

      // Build the prompt - now includes within-dataset merging
      const d1ConceptsText = d1Concepts.map((c, i) => 
        `D1-${i + 1}: "${c.label}"\nDescription: ${c.description}\nLinked D1 element IDs: ${c.d1Ids.join(", ")}`
      ).join("\n\n");

      const d2ConceptsText = d2Concepts.map((c, i) => 
        `D2-${i + 1}: "${c.label}"\nDescription: ${c.description}\nLinked D2 element IDs: ${c.d2Ids.join(", ")}`
      ).join("\n\n");

      const prompt = `You are merging concepts from two datasets. Your job is to identify concepts that are identical or nearly identical and should be merged.

IMPORTANT: Check for duplicates WITHIN each dataset as well as ACROSS datasets:
- D1 with D1 (duplicates within D1)
- D1 with D2 (cross-dataset duplicates)  
- D2 with D2 (duplicates within D2)

## D1 Concepts (from requirements/source of truth)

${d1ConceptsText || "(none)"}

## D2 Concepts (from implementation)

${d2ConceptsText || "(none)"}

## Your Task

1. First, identify D1 concepts that are duplicates of other D1 concepts - merge these together
2. Then, identify D2 concepts that are duplicates of other D2 concepts - merge these together  
3. Finally, identify D1 concepts that match D2 concepts - merge these across datasets

Concepts should be merged if they:
- Have the same or similar names (e.g., "Authentication" and "User Authentication")
- Cover the same functional area (e.g., "Login Flow" and "Auth Handlers")
- Describe the same theme even with different wording

DO NOT merge concepts that are genuinely different functional areas.

## Output Format

Return a JSON object with this exact structure:
{
  "mergedConcepts": [
    {
      "mergedLabel": "Final Concept Name",
      "mergedDescription": "Combined description capturing all merged concepts",
      "d1ConceptLabels": ["D1 Concept Label 1", "D1 Concept Label 2"],
      "d2ConceptLabels": ["D2 Concept Label 1"],
      "d1Ids": ["all", "d1", "element", "ids", "from", "merged", "concepts"],
      "d2Ids": ["all", "d2", "element", "ids", "from", "merged", "concepts"]
    }
  ],
  "unmergedD1Concepts": [
    {
      "label": "D1 Concept with no matches",
      "description": "...",
      "d1Ids": ["..."]
    }
  ],
  "unmergedD2Concepts": [
    {
      "label": "D2 Concept with no matches",
      "description": "...",
      "d2Ids": ["..."]
    }
  ]
}

Notes:
- mergedConcepts: concepts that were merged (can be D1+D1, D2+D2, or D1+D2 combinations)
- A merged concept can have multiple d1ConceptLabels OR multiple d2ConceptLabels (within-dataset merge)
- A merged concept with both d1ConceptLabels AND d2ConceptLabels is a cross-dataset merge
- unmergedD1Concepts: D1 concepts with NO matches anywhere
- unmergedD2Concepts: D2 concepts with NO matches anywhere

Return ONLY the JSON object, no other text.`;

      const payloadChars = prompt.length;
      console.log(`[merge] Prompt: ${payloadChars.toLocaleString()} chars (~${Math.ceil(payloadChars/4).toLocaleString()} tokens)`);

      await sendSSE("progress", { phase: "concept_merge", message: "Calling LLM for concept matching...", progress: 20 });

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[merge] Claude API error:", response.status, errorText);
        throw new Error(`Claude API error: ${response.status} - ${errorText.slice(0, 200)}`);
      }

      const result = await response.json();
      const rawText = result.content?.[0]?.text || "{}";
      
      console.log(`[merge] Response: ${rawText.length} chars`);
      
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
        console.error("[merge] JSON parse failed, attempting recovery...");
        const firstBrace = rawText.indexOf("{");
        const lastBrace = rawText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
        } else {
          throw new Error("Could not parse JSON from LLM response");
        }
      }

      const mergedConcepts = parsed.mergedConcepts || [];
      const unmergedD1Concepts = parsed.unmergedD1Concepts || parsed.unmergeedD1Concepts || [];
      const unmergedD2Concepts = parsed.unmergedD2Concepts || [];

      // Count different merge types
      const d1OnlyMerges = mergedConcepts.filter(c => c.d1ConceptLabels.length > 1 && c.d2ConceptLabels.length === 0).length;
      const d2OnlyMerges = mergedConcepts.filter(c => c.d2ConceptLabels.length > 1 && c.d1ConceptLabels.length === 0).length;
      const crossMerges = mergedConcepts.filter(c => c.d1ConceptLabels.length > 0 && c.d2ConceptLabels.length > 0).length;

      console.log(`[merge] Results: ${mergedConcepts.length} merged (${d1OnlyMerges} D1↔D1, ${d2OnlyMerges} D2↔D2, ${crossMerges} D1↔D2), ${unmergedD1Concepts.length} D1-only, ${unmergedD2Concepts.length} D2-only`);

      await sendSSE("progress", { 
        phase: "concept_merge", 
        message: `Found ${mergedConcepts.length} merged, ${unmergedD1Concepts.length} D1-only, ${unmergedD2Concepts.length} D2-only`, 
        progress: 80 
      });

      // Write to blackboard
      await supabase.rpc("insert_audit_blackboard_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: "concept_merger",
        p_entry_type: "merge_results",
        p_content: `Concept Merge Results:\n- Total merged concepts: ${mergedConcepts.length}\n  - D1↔D1 merges: ${d1OnlyMerges}\n  - D2↔D2 merges: ${d2OnlyMerges}\n  - D1↔D2 merges: ${crossMerges}\n- D1-only (gaps): ${unmergedD1Concepts.length}\n- D2-only (potential orphans): ${unmergedD2Concepts.length}\n\nMerged:\n${mergedConcepts.map(c => `• ${c.mergedLabel} (${c.d1Ids.length} D1, ${c.d2Ids.length} D2)`).join("\n")}`,
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
        p_content: `Merged ${mergedConcepts.length} concepts (${d1OnlyMerges} D1↔D1, ${d2OnlyMerges} D2↔D2, ${crossMerges} D1↔D2), ${unmergedD1Concepts.length} D1-only gaps, ${unmergedD2Concepts.length} D2-only orphans`,
        p_metadata: { 
          mergedCount: mergedConcepts.length,
          d1OnlyMerges,
          d2OnlyMerges,
          crossMerges,
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
      try {
        await writer.close();
      } catch {
        // Already closed
      }
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
