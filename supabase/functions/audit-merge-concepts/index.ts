// Audit Pipeline Phase 2: Merge similar concepts
// Now uses UNIFIED concept list - no D1/D2 split between rounds
// Uses project model settings instead of hardcoded model

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Unified concept - tracks both D1 and D2 element IDs
interface UnifiedConcept {
  label: string;
  description: string;
  d1Ids: string[];
  d2Ids: string[];
  elementLabels?: string[];
}

interface MergeInstruction {
  mergedLabel: string;
  mergedDescription: string;
  sourceConcepts: string[];
}

interface MergeRequest {
  sessionId: string;
  projectId: string;
  shareToken: string;
  concepts: UnifiedConcept[];  // UNIFIED concept list
  consolidationRound?: number;
  totalRounds?: number;
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

      const { sessionId, projectId, shareToken, concepts, consolidationRound, totalRounds }: MergeRequest = await req.json();

      // Get project settings for model configuration
      const { data: project } = await supabase.rpc("get_project_with_token", {
        p_project_id: projectId,
        p_token: shareToken,
      }) as { data: ProjectSettings | null };

      const selectedModel = project?.selected_model || "gemini-2.5-flash";
      const maxTokens = project?.max_tokens || 16384;
      const modelConfig = getModelConfig(selectedModel);

      const round = consolidationRound || 1;
      const rounds = totalRounds || 1;
      
      console.log(`[merge] Using model: ${selectedModel}, maxTokens: ${maxTokens}, round ${round}/${rounds}`);
      console.log(`[merge] Starting with ${concepts.length} unified concepts`);
      
      await sendSSE("progress", { 
        phase: "concept_merge", 
        message: `Analyzing ${concepts.length} concepts for merging using ${selectedModel}...`, 
        progress: 0 
      });

      // Build concept text with source info and element labels
      const conceptsText = concepts.map((c, i) => {
        const sourceInfo = c.d1Ids.length > 0 && c.d2Ids.length > 0 
          ? `[MERGED: ${c.d1Ids.length} D1 + ${c.d2Ids.length} D2]`
          : c.d1Ids.length > 0 
            ? `[D1: ${c.d1Ids.length} elements]` 
            : `[D2: ${c.d2Ids.length} elements]`;
        
        const elementsPreview = c.elementLabels && c.elementLabels.length > 0 
          ? `\n  Elements:\n${c.elementLabels.slice(0, 5).map(el => `    - ${el.slice(0, 100)}`).join("\n")}${c.elementLabels.length > 5 ? `\n    ... and ${c.elementLabels.length - 5} more` : ""}`
          : "";
        return `${i + 1}. "${c.label}" ${sourceInfo}\n  Description: ${c.description}${elementsPreview}`;
      }).join("\n\n");

      // Round-specific merge aggressiveness
      const roundDescriptions: Record<number, { label: string; criteria: string }> = {
        1: { 
          label: "EXACT/NEAR MATCHES", 
          criteria: `Only merge concepts that are:
- Nearly identical names (e.g., "User Auth" and "User Authentication")
- Obvious duplicates created from the same source
- Clearly the same concept with minor wording differences` 
        },
        2: { 
          label: "THEMATIC SIMILARITY", 
          criteria: `Merge concepts that are:
- Thematically related (e.g., "Login Flow" and "Session Management" → "Authentication System")
- Part of the same functional domain (e.g., "Create User", "Update User", "Delete User" → "User Management")
- Logically connected sub-concepts that belong together` 
        },
        3: { 
          label: "BROAD CATEGORIES", 
          criteria: `Aggressively merge into broad categories:
- Combine related domains (e.g., "Auth", "Permissions", "Roles" → "Access Control")
- Create high-level architectural concepts
- Aim for 5-15 final concepts maximum
- If in doubt, MERGE - fewer broad concepts are better than many narrow ones` 
        },
      };
      
      const roundConfig = roundDescriptions[round] || roundDescriptions[1];
      
      const prompt = `You are merging concepts. This is ROUND ${round}/${rounds}: ${roundConfig.label}

**MERGE CRITERIA FOR THIS ROUND:**
${roundConfig.criteria}

**Current input:** ${concepts.length} concepts

${round === 3 ? "**AGGRESSIVE MODE**: Merge liberally. Target 5-15 final broad concepts." : ""}

## All Concepts

${conceptsText}

## Your Task

Identify which concepts should be MERGED together based on:
${round === 1 ? "- ONLY obvious duplicates and near-exact name matches" : ""}
${round === 2 ? "- Thematic similarity and functional domains" : ""}
${round === 3 ? "- Broad categories - be aggressive, fewer is better" : ""}

Look at the element labels within each concept to help determine if they're truly related.

**CRITICAL RULES:**
1. Each concept can ONLY appear in ONE merge group
2. Only output merges for concepts that should be combined (2+ concepts)
3. Use ONLY the concept NAME - do NOT include the [D1/D2/MERGED] metadata suffix
4. Concepts not listed remain unchanged

## Output Format

Return a JSON object:
{
  "merges": [
    {
      "sourceConcepts": ["User Authentication", "Login System"],
      "mergedLabel": "Authentication & Login",
      "mergedDescription": "Handles user authentication and login functionality"
    }
  ]
}

**IMPORTANT**: In "sourceConcepts", use ONLY the concept name (e.g., "User Authentication").
Do NOT include the [D1: X elements] or [MERGED: X D1 + Y D2] suffix.

Return ONLY the JSON object, no other text.`;

      const payloadChars = prompt.length;
      console.log(`[merge] Prompt: ${payloadChars.toLocaleString()} chars (~${Math.ceil(payloadChars/4).toLocaleString()} tokens)`);

      await sendSSE("progress", { phase: "concept_merge", message: `Calling ${selectedModel}...`, progress: 20 });

      const rawText = await callLLM(prompt, modelConfig, maxTokens);
      
      console.log(`[merge] RAW LLM Response (${rawText.length} chars):\n${rawText}`);
      
      await sendSSE("progress", { phase: "concept_merge", message: "Parsing merge instructions...", progress: 60 });

      // Parse JSON
      let parsed: { merges: MergeInstruction[] };
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

      // Build concept lookup map (label -> concept)
      const conceptByLabel = new Map<string, UnifiedConcept>();
      concepts.forEach(c => {
        conceptByLabel.set(c.label.toLowerCase(), c);
      });

      // Track which concepts were merged
      const mergedConceptLabels = new Set<string>();
      
      // Build output concept list
      const outputConcepts: UnifiedConcept[] = [];
      let mergeCount = 0;

      // Process each merge instruction
      for (const m of (parsed.merges || [])) {
        const sourceConcepts: UnifiedConcept[] = [];
        
        for (const label of (m.sourceConcepts || [])) {
          const key = label.toLowerCase();
          
          // Skip if already used in another merge
          if (mergedConceptLabels.has(key)) {
            console.log(`[merge] WARNING: "${label}" already used, skipping`);
            continue;
          }
          
          const found = conceptByLabel.get(key);
          if (found) {
            sourceConcepts.push(found);
            mergedConceptLabels.add(key);
          } else {
            console.log(`[merge] WARNING: "${label}" not found in input`);
          }
        }
        
        // Only create merged concept if 2+ sources
        if (sourceConcepts.length >= 2) {
          const mergedConcept: UnifiedConcept = {
            label: m.mergedLabel,
            description: m.mergedDescription,
            d1Ids: sourceConcepts.flatMap(c => c.d1Ids),
            d2Ids: sourceConcepts.flatMap(c => c.d2Ids),
            elementLabels: sourceConcepts.flatMap(c => c.elementLabels || []),
          };
          outputConcepts.push(mergedConcept);
          mergeCount++;
          console.log(`[merge] Created: "${m.mergedLabel}" from ${sourceConcepts.length} concepts`);
        }
      }

      // Add unmerged concepts (those not in any merge)
      for (const c of concepts) {
        if (!mergedConceptLabels.has(c.label.toLowerCase())) {
          outputConcepts.push(c);
        }
      }

      console.log(`[merge] Results: ${mergeCount} merges performed, ${outputConcepts.length} total concepts out`);

      await sendSSE("progress", { 
        phase: "concept_merge", 
        message: `${mergeCount} merges performed, ${outputConcepts.length} concepts remaining`, 
        progress: 80 
      });

      // Write to blackboard
      await supabase.rpc("insert_audit_blackboard_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: "concept_merger",
        p_entry_type: "merge_results",
        p_content: `Round ${round}/${rounds} Merge Results (using ${selectedModel}):\n- ${mergeCount} merges performed\n- ${outputConcepts.length} concepts remaining\n\nMerges:\n${parsed.merges?.map(m => `• ${m.mergedLabel} ← [${m.sourceConcepts.join(", ")}]`).join("\n") || "(none)"}`,
        p_iteration: round,
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
        p_title: `Round ${round}/${rounds}: ${mergeCount} merges`,
        p_content: `${concepts.length} concepts in → ${outputConcepts.length} out (${mergeCount} merges) using ${selectedModel}`,
        p_metadata: { 
          round,
          totalRounds: rounds,
          inputCount: concepts.length,
          outputCount: outputConcepts.length,
          mergeCount,
          model: selectedModel
        },
      });

      await sendSSE("progress", { phase: "concept_merge", message: "Merge complete", progress: 100 });
      
      // Return unified concept list
      await sendSSE("result", { 
        concepts: outputConcepts,
        mergeCount,
      });
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
