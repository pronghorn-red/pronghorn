// Audit Pipeline Phase 2: Merge similar concepts
// Merges D1↔D1, D1↔D2, D2↔D1, and D2↔D2 duplicates
// Uses project model settings instead of hardcoded model

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

interface ProjectSettings {
  selected_model: string | null;
  max_tokens: number | null;
  thinking_enabled: boolean | null;
  thinking_budget: number | null;
}

// Model routing helper
function getModelConfig(selectedModel: string): { 
  apiType: "anthropic" | "gemini" | "xai"; 
  modelName: string;
  apiKeyEnv: string;
} {
  if (selectedModel.startsWith("claude")) {
    return { apiType: "anthropic", modelName: selectedModel, apiKeyEnv: "ANTHROPIC_API_KEY" };
  } else if (selectedModel.startsWith("gemini")) {
    return { apiType: "gemini", modelName: selectedModel, apiKeyEnv: "GEMINI_API_KEY" };
  } else if (selectedModel.startsWith("grok")) {
    return { apiType: "xai", modelName: selectedModel, apiKeyEnv: "XAI_API_KEY" };
  }
  // Default to Gemini
  return { apiType: "gemini", modelName: "gemini-2.5-flash", apiKeyEnv: "GEMINI_API_KEY" };
}

// Call LLM based on model type
async function callLLM(
  prompt: string,
  config: { apiType: "anthropic" | "gemini" | "xai"; modelName: string; apiKeyEnv: string },
  maxTokens: number
): Promise<string> {
  const apiKey = Deno.env.get(config.apiKeyEnv);
  if (!apiKey) throw new Error(`API key not configured: ${config.apiKeyEnv}`);

  if (config.apiType === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.modelName,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText.slice(0, 300)}`);
    }

    const result = await response.json();
    return result.content?.[0]?.text || "{}";
  } else if (config.apiType === "gemini") {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.modelName}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: maxTokens,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText.slice(0, 300)}`);
    }

    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  } else {
    // xAI/Grok
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`xAI API error: ${response.status} - ${errorText.slice(0, 300)}`);
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content || "{}";
  }
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

      const authHeader = req.headers.get("Authorization");
      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: authHeader ? { Authorization: authHeader } : {} },
      });

      const { sessionId, projectId, shareToken, d1Concepts, d2Concepts }: MergeRequest = await req.json();

      // Get project settings for model configuration
      const { data: project } = await supabase.rpc("get_project_with_token", {
        p_project_id: projectId,
        p_token: shareToken,
      }) as { data: ProjectSettings | null };

      const selectedModel = project?.selected_model || "gemini-2.5-flash";
      const maxTokens = project?.max_tokens || 16384;
      const modelConfig = getModelConfig(selectedModel);

      console.log(`[merge] Using model: ${selectedModel}, maxTokens: ${maxTokens}`);
      console.log(`[merge] Starting: ${d1Concepts.length} D1 concepts, ${d2Concepts.length} D2 concepts`);
      
      await sendSSE("progress", { 
        phase: "concept_merge", 
        message: `Analyzing ${d1Concepts.length} D1 + ${d2Concepts.length} D2 concepts for merging using ${selectedModel}...`, 
        progress: 0 
      });

      // Build the prompt - include element counts for context
      const d1ConceptsText = d1Concepts.map((c, i) => 
        `D1-${i + 1}: "${c.label}" (${c.d1Ids.length} elements)\nDescription: ${c.description}`
      ).join("\n\n");

      const d2ConceptsText = d2Concepts.map((c, i) => 
        `D2-${i + 1}: "${c.label}" (${c.d2Ids.length} elements)\nDescription: ${c.description}`
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

Return a JSON object with this exact structure (use labels to identify concepts, NOT IDs):
{
  "mergedConcepts": [
    {
      "mergedLabel": "Final Concept Name",
      "mergedDescription": "Combined description capturing all merged concepts",
      "d1ConceptLabels": ["D1 Concept Label 1", "D1 Concept Label 2"],
      "d2ConceptLabels": ["D2 Concept Label 1"]
    }
  ],
  "unmergedD1Labels": ["D1 Concept with no matches"],
  "unmergedD2Labels": ["D2 Concept with no matches"]
}

Notes:
- mergedConcepts: concepts that were merged (can be D1+D1, D2+D2, or D1+D2 combinations)
- Use the EXACT labels from the input concepts so we can match them back
- unmergedD1Labels: labels of D1 concepts with NO matches anywhere
- unmergedD2Labels: labels of D2 concepts with NO matches anywhere

Return ONLY the JSON object, no other text.`;

      const payloadChars = prompt.length;
      console.log(`[merge] Prompt: ${payloadChars.toLocaleString()} chars (~${Math.ceil(payloadChars/4).toLocaleString()} tokens)`);

      await sendSSE("progress", { phase: "concept_merge", message: `Calling ${selectedModel} for concept matching...`, progress: 20 });

      const rawText = await callLLM(prompt, modelConfig, maxTokens);
      
      console.log(`[merge] Response: ${rawText.length} chars`);
      
      await sendSSE("progress", { phase: "concept_merge", message: "Parsing merge instructions...", progress: 60 });

      // Parse JSON - now expects labels only, we'll reconstruct IDs
      let parsed: { 
        mergedConcepts: Array<{
          mergedLabel: string;
          mergedDescription: string;
          d1ConceptLabels: string[];
          d2ConceptLabels: string[];
        }>; 
        unmergedD1Labels?: string[];
        unmergedD2Labels?: string[];
        // Legacy fallbacks
        unmergedD1Concepts?: D1Concept[];
        unmergeedD1Concepts?: D1Concept[];
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

      // Build lookup maps for reconstructing IDs from labels
      const d1ByLabel = new Map<string, D1Concept>();
      d1Concepts.forEach(c => d1ByLabel.set(c.label.toLowerCase(), c));
      
      const d2ByLabel = new Map<string, D2Concept>();
      d2Concepts.forEach(c => d2ByLabel.set(c.label.toLowerCase(), c));

      // Reconstruct full merged concepts with IDs
      const mergedConcepts: MergeInstruction[] = (parsed.mergedConcepts || []).map(m => {
        const d1Ids: string[] = [];
        const d2Ids: string[] = [];
        
        (m.d1ConceptLabels || []).forEach(label => {
          const found = d1ByLabel.get(label.toLowerCase());
          if (found) d1Ids.push(...found.d1Ids);
        });
        
        (m.d2ConceptLabels || []).forEach(label => {
          const found = d2ByLabel.get(label.toLowerCase());
          if (found) d2Ids.push(...found.d2Ids);
        });
        
        return {
          mergedLabel: m.mergedLabel,
          mergedDescription: m.mergedDescription,
          d1ConceptLabels: m.d1ConceptLabels || [],
          d2ConceptLabels: m.d2ConceptLabels || [],
          d1Ids,
          d2Ids
        };
      });

      // Reconstruct unmerged D1 concepts from labels
      let unmergedD1Concepts: D1Concept[] = [];
      if (parsed.unmergedD1Labels) {
        unmergedD1Concepts = parsed.unmergedD1Labels
          .map(label => d1ByLabel.get(label.toLowerCase()))
          .filter((c): c is D1Concept => c !== undefined);
      } else if (parsed.unmergedD1Concepts || parsed.unmergeedD1Concepts) {
        // Legacy fallback
        unmergedD1Concepts = parsed.unmergedD1Concepts || parsed.unmergeedD1Concepts || [];
      }

      // Reconstruct unmerged D2 concepts from labels
      let unmergedD2Concepts: D2Concept[] = [];
      if (parsed.unmergedD2Labels) {
        unmergedD2Concepts = parsed.unmergedD2Labels
          .map(label => d2ByLabel.get(label.toLowerCase()))
          .filter((c): c is D2Concept => c !== undefined);
      } else if (parsed.unmergedD2Concepts) {
        // Legacy fallback
        unmergedD2Concepts = parsed.unmergedD2Concepts || [];
      }

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
        p_content: `Concept Merge Results (using ${selectedModel}):\n- Total merged concepts: ${mergedConcepts.length}\n  - D1↔D1 merges: ${d1OnlyMerges}\n  - D2↔D2 merges: ${d2OnlyMerges}\n  - D1↔D2 merges: ${crossMerges}\n- D1-only (gaps): ${unmergedD1Concepts.length}\n- D2-only (potential orphans): ${unmergedD2Concepts.length}\n\nMerged:\n${mergedConcepts.map(c => `• ${c.mergedLabel} (${c.d1Ids.length} D1, ${c.d2Ids.length} D2)`).join("\n")}`,
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
        p_content: `Merged ${mergedConcepts.length} concepts (${d1OnlyMerges} D1↔D1, ${d2OnlyMerges} D2↔D2, ${crossMerges} D1↔D2), ${unmergedD1Concepts.length} D1-only gaps, ${unmergedD2Concepts.length} D2-only orphans using ${selectedModel}`,
        p_metadata: { 
          mergedCount: mergedConcepts.length,
          d1OnlyMerges,
          d2OnlyMerges,
          crossMerges,
          d1OnlyCount: unmergedD1Concepts.length,
          d2OnlyCount: unmergedD2Concepts.length,
          model: selectedModel
        },
      });

      await sendSSE("progress", { phase: "concept_merge", message: "Merge analysis complete", progress: 100 });
      await sendSSE("result", { mergedConcepts, unmergedD1Concepts, unmergedD2Concepts });
      await sendSSE("done", { success: true });

    } catch (error: unknown) {
      console.error("Concept merge error:", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      try {
        await sendSSE("error", { message: errMsg });
      } catch {
        // Stream may be closed
      }
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
