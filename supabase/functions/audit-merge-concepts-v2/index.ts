// Audit Pipeline Phase 2 V2: MERGE ADVISOR ONLY
// LLM analyzes concept IDs and suggests merges.
// Returns ONLY merge instructions. Client handles all graph state.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Lightweight concept for LLM prompt (no element tracking)
interface ConceptInput {
  id: string;           // e.g., "C1", "C2"
  label: string;
  description: string;
}

interface MergeInstruction {
  sourceIds: string[];      // Concept IDs to merge
  mergedLabel: string;
  mergedDescription: string;
}

interface MergeRequest {
  sessionId: string;
  projectId: string;
  shareToken: string;
  concepts: ConceptInput[];   // Lightweight list
  round: number;
  totalRounds: number;
}

interface MergeResponse {
  merges: MergeInstruction[];
}

interface ProjectSettings {
  selected_model: string | null;
  max_tokens: number | null;
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

      const { sessionId, projectId, shareToken, concepts, round, totalRounds }: MergeRequest = await req.json();

      // Get project settings for model configuration
      const { data: project } = await supabase.rpc("get_project_with_token", {
        p_project_id: projectId,
        p_token: shareToken,
      }) as { data: ProjectSettings | null };

      const selectedModel = project?.selected_model || "gemini-2.5-flash";
      const maxTokens = project?.max_tokens || 16384;
      const modelConfig = getModelConfig(selectedModel);

      console.log(`[merge-v2] Round ${round}/${totalRounds} using ${selectedModel}`);
      console.log(`[merge-v2] INPUT: ${concepts.length} concepts to analyze`);
      
      await sendSSE("progress", { 
        phase: "concept_merge", 
        message: `Round ${round}/${totalRounds}: Analyzing ${concepts.length} concepts...`, 
        progress: 10 
      });

      // Build concept text for LLM - just IDs and labels
      const conceptsText = concepts.map((c) => {
        return `[${c.id}] "${c.label}"\n  Description: ${c.description}`;
      }).join("\n\n");

      // Round-specific merge criteria
      const roundCriteria: Record<number, { label: string; criteria: string }> = {
        1: { 
          label: "EXACT MATCHING", 
          criteria: `Only merge concepts that are:
- Nearly identical names (e.g., "User Auth" and "User Authentication")
- Obvious duplicates with minor wording differences
- Clearly the same concept described differently` 
        },
        2: { 
          label: "THEMATIC MATCHING", 
          criteria: `Merge concepts that are:
- Thematically related (e.g., "Login Flow" + "Session Management" → "Authentication System")
- Part of the same functional domain
- Logically connected sub-concepts` 
        },
        3: { 
          label: "AGGRESSIVE CONSOLIDATION", 
          criteria: `Aggressively merge into broad categories:
- Combine related domains (e.g., "Auth", "Permissions", "Roles" → "Access Control")
- Create high-level concepts
- Target 5-15 final concepts
- When in doubt, MERGE` 
        },
      };
      
      const { label: roundLabel, criteria } = roundCriteria[round] || roundCriteria[1];
      
      const prompt = `You are merging concepts. Round ${round}/${totalRounds}: ${roundLabel}

**MERGE CRITERIA:**
${criteria}

**Current concepts (${concepts.length} total):**

${conceptsText}

## Your Task

Identify which concepts should be MERGED based on the criteria above.

**CRITICAL: USE CONCEPT IDs ONLY**
Each concept has an ID in square brackets like [C1], [C2], etc.
Your output MUST reference concepts by their ID, NOT by name.

For each merge:
1. List the source concept IDs (e.g., ["C1", "C2"])
2. Provide the new merged label
3. Provide a merged description

**RULES:**
- Each concept ID can appear in AT MOST ONE merge group
- Only output merges for 2+ concepts being combined
- Concepts not listed in any merge will remain unchanged
- Use ONLY the concept IDs (like "C1", "C2"), NOT the labels

## Output Format

Return JSON:
{
  "merges": [
    {
      "sourceIds": ["C1", "C2"],
      "mergedLabel": "Authentication & Login",
      "mergedDescription": "Handles user authentication and login functionality"
    }
  ]
}

If no merges should happen, return: {"merges": []}

Return ONLY the JSON object.`;

      await sendSSE("progress", { phase: "concept_merge", message: `Calling ${selectedModel}...`, progress: 30 });

      const rawText = await callLLM(prompt, modelConfig, maxTokens);
      
      console.log(`[merge-v2] LLM response (${rawText.length} chars)`);
      
      await sendSSE("progress", { phase: "concept_merge", message: "Processing merge instructions...", progress: 60 });

      // Parse JSON
      let parsed: { merges: MergeInstruction[] };
      try {
        parsed = JSON.parse(rawText);
      } catch {
        console.error("[merge-v2] JSON parse failed, attempting recovery...");
        const firstBrace = rawText.indexOf("{");
        const lastBrace = rawText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
        } else {
          throw new Error("Could not parse JSON from LLM response");
        }
      }

      // Validate and deduplicate merge instructions
      const validMerges: MergeInstruction[] = [];
      const usedIds = new Set<string>();
      const conceptIds = new Set(concepts.map(c => c.id));

      for (const m of (parsed.merges || [])) {
        // Filter to only valid IDs that haven't been used yet
        const validSourceIds = (m.sourceIds || []).filter(id => {
          if (!conceptIds.has(id)) {
            console.log(`[merge-v2] Invalid concept ID: "${id}"`);
            return false;
          }
          if (usedIds.has(id)) {
            console.log(`[merge-v2] Duplicate concept ID: "${id}"`);
            return false;
          }
          return true;
        });

        // Only keep merges with 2+ valid sources
        if (validSourceIds.length >= 2) {
          validSourceIds.forEach(id => usedIds.add(id));
          validMerges.push({
            sourceIds: validSourceIds,
            mergedLabel: m.mergedLabel,
            mergedDescription: m.mergedDescription,
          });
          console.log(`[merge-v2] MERGE: "${m.mergedLabel}" ← [${validSourceIds.join(", ")}]`);
        }
      }

      console.log(`[merge-v2] OUTPUT: ${validMerges.length} valid merges (no DB writes)`);

      // Return ONLY merge instructions - client handles everything else
      const response: MergeResponse = {
        merges: validMerges,
      };

      await sendSSE("result", response);
      await sendSSE("done", { success: true });

    } catch (error: unknown) {
      console.error("[merge-v2] Error:", error);
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
      Connection: "keep-alive",
    },
  });
});
