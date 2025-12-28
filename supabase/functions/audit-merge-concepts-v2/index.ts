// Audit Pipeline Phase 2 V2: ID-based merge with additive remapping
// LLM only maps concept IDs to new concepts. Code handles all element remapping.
// Old concepts are marked remappedTo, NOT deleted. Client cleans up at the end.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Unified concept with unique ID for tracking through merges
export interface UnifiedConcept {
  id: string;           // Unique ID like "C1", "C2" - NEVER changes
  label: string;
  description: string;
  d1Ids: string[];
  d2Ids: string[];
  elementLabels?: string[];
  remappedTo?: string;  // If merged, points to new concept ID
}

interface MergeLogEntry {
  fromIds: string[];    // Source concept IDs that were merged
  fromLabels: string[]; // Source concept labels (for display)
  toId: string;         // New concept ID
  toLabel: string;      // New concept label
}

interface MergeRequest {
  sessionId: string;
  projectId: string;
  shareToken: string;
  concepts: UnifiedConcept[];
  round: number;
  totalRounds: number;
}

interface MergeResponse {
  concepts: UnifiedConcept[];     // ALL concepts: new, remapped, and unchanged
  mergeLog: MergeLogEntry[];      // What merges happened (for UI display)
  inputCount: number;
  outputCount: number;            // Count of non-remapped concepts
  d1ElementCount: number;
  d2ElementCount: number;
  nextConceptId: number;          // For client to continue ID sequence
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

      // Only consider non-remapped concepts for input counting
      const activeConcepts = concepts.filter(c => !c.remappedTo);
      
      // Count input elements (for verification)
      const inputD1Count = activeConcepts.reduce((sum, c) => sum + (c.d1Ids?.length || 0), 0);
      const inputD2Count = activeConcepts.reduce((sum, c) => sum + (c.d2Ids?.length || 0), 0);
      
      // Find highest existing concept ID number
      let nextConceptId = 1;
      for (const c of concepts) {
        const match = c.id.match(/^C(\d+)$/);
        if (match) {
          nextConceptId = Math.max(nextConceptId, parseInt(match[1], 10) + 1);
        }
      }
      
      console.log(`[merge-v2] Round ${round}/${totalRounds} using ${selectedModel}`);
      console.log(`[merge-v2] INPUT: ${activeConcepts.length} active concepts, ${inputD1Count} D1 elements, ${inputD2Count} D2 elements`);
      
      await sendSSE("progress", { 
        phase: "concept_merge", 
        message: `Round ${round}/${totalRounds}: Analyzing ${activeConcepts.length} concepts...`, 
        progress: 10 
      });

      // Build concept text for LLM - ONLY using IDs
      const conceptsText = activeConcepts.map((c) => {
        const d1Count = c.d1Ids?.length || 0;
        const d2Count = c.d2Ids?.length || 0;
        const sourceInfo = d1Count > 0 && d2Count > 0 
          ? `[BOTH: ${d1Count} D1 + ${d2Count} D2]`
          : d1Count > 0 
            ? `[D1-only: ${d1Count} elements]` 
            : `[D2-only: ${d2Count} elements]`;
        
        const elementsPreview = c.elementLabels && c.elementLabels.length > 0 
          ? `\n  Elements: ${c.elementLabels.slice(0, 3).map(el => el.slice(0, 60)).join("; ")}${c.elementLabels.length > 3 ? ` (+${c.elementLabels.length - 3} more)` : ""}`
          : "";
        return `[${c.id}] "${c.label}" ${sourceInfo}\n  Description: ${c.description}${elementsPreview}`;
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

**Current concepts (${activeConcepts.length} total):**

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
      let parsed: { merges: Array<{ sourceIds: string[]; mergedLabel: string; mergedDescription: string }> };
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

      // Build concept lookup map by ID
      const conceptById = new Map<string, UnifiedConcept>();
      for (const c of concepts) {
        conceptById.set(c.id, c);
      }

      // Track which concept IDs were merged (to mark remappedTo)
      const mergedIds = new Set<string>();
      
      // Build output concept list and merge log
      const outputConcepts: UnifiedConcept[] = [];
      const mergeLog: MergeLogEntry[] = [];

      // Process each merge instruction - use IDs for deterministic lookup
      for (const m of (parsed.merges || [])) {
        const validSources: UnifiedConcept[] = [];
        const validSourceIds: string[] = [];
        const validSourceLabels: string[] = [];
        
        for (const id of (m.sourceIds || [])) {
          // Skip if already used in another merge
          if (mergedIds.has(id)) {
            console.log(`[merge-v2] SKIP: "${id}" already merged`);
            continue;
          }
          
          const found = conceptById.get(id);
          if (found && !found.remappedTo) {
            validSources.push(found);
            validSourceIds.push(found.id);
            validSourceLabels.push(found.label);
            mergedIds.add(id);
          } else if (!found) {
            console.log(`[merge-v2] NOT FOUND: "${id}"`);
          } else {
            console.log(`[merge-v2] ALREADY REMAPPED: "${id}"`);
          }
        }
        
        // Only create merged concept if 2+ valid sources
        if (validSources.length >= 2) {
          // Create new concept ID
          const newId = `C${nextConceptId++}`;
          
          // Combine all element IDs from source concepts (NO deduplication - preserve exact counts)
          const combinedD1Ids = validSources.flatMap(c => c.d1Ids || []);
          const combinedD2Ids = validSources.flatMap(c => c.d2Ids || []);
          const combinedLabels = validSources.flatMap(c => c.elementLabels || []);
          
          const mergedConcept: UnifiedConcept = {
            id: newId,
            label: m.mergedLabel,
            description: m.mergedDescription,
            d1Ids: combinedD1Ids,
            d2Ids: combinedD2Ids,
            elementLabels: combinedLabels,
          };
          outputConcepts.push(mergedConcept);
          
          // Mark source concepts as remapped (DON'T delete them)
          for (const src of validSources) {
            src.remappedTo = newId;
          }
          
          // Add to merge log for UI
          mergeLog.push({
            fromIds: validSourceIds,
            fromLabels: validSourceLabels,
            toId: newId,
            toLabel: m.mergedLabel,
          });
          
          console.log(`[merge-v2] MERGED: [${newId}] "${m.mergedLabel}" ← [${validSourceIds.join(", ")}] (${combinedD1Ids.length} D1, ${combinedD2Ids.length} D2)`);
        } else if (validSources.length === 1) {
          // Only 1 valid source - unmark it so it passes through unchanged
          mergedIds.delete(validSources[0].id);
          console.log(`[merge-v2] UNMERGE: "${validSources[0].id}" (only 1 valid source)`);
        }
      }

      // Add ALL original concepts (including those marked remappedTo)
      // This preserves the full history for the client
      for (const c of concepts) {
        outputConcepts.push(c);
      }

      // ========================================
      // VERIFICATION: Count elements in non-remapped concepts only
      // ========================================
      const activeOutputConcepts = outputConcepts.filter(c => !c.remappedTo);
      const outputD1Count = activeOutputConcepts.reduce((sum, c) => sum + (c.d1Ids?.length || 0), 0);
      const outputD2Count = activeOutputConcepts.reduce((sum, c) => sum + (c.d2Ids?.length || 0), 0);
      
      console.log(`[merge-v2] OUTPUT: ${activeOutputConcepts.length} active concepts, ${outputD1Count} D1 elements, ${outputD2Count} D2 elements`);
      
      if (outputD1Count !== inputD1Count) {
        console.error(`[merge-v2] ❌ D1 ELEMENT LOSS: ${inputD1Count} in → ${outputD1Count} out`);
      }
      if (outputD2Count !== inputD2Count) {
        console.error(`[merge-v2] ❌ D2 ELEMENT LOSS: ${inputD2Count} in → ${outputD2Count} out`);
      }
      if (outputD1Count === inputD1Count && outputD2Count === inputD2Count) {
        console.log(`[merge-v2] ✅ Element counts verified: ${outputD1Count} D1, ${outputD2Count} D2`);
      }

      await sendSSE("progress", { phase: "concept_merge", message: "Merge complete", progress: 90 });

      // Write to activity stream
      await supabase.rpc("insert_audit_activity_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: "concept_merger_v2",
        p_activity_type: "concept_merge",
        p_title: `Round ${round}/${totalRounds}: ${activeConcepts.length} → ${activeOutputConcepts.length} concepts`,
        p_content: mergeLog.length > 0 
          ? `Merges:\n${mergeLog.map(m => `• [${m.toId}] ${m.toLabel} ← [${m.fromIds.join(", ")}]`).join("\n")}`
          : "No merges in this round",
        p_metadata: { 
          round,
          totalRounds,
          inputCount: activeConcepts.length,
          outputCount: activeOutputConcepts.length,
          mergeCount: mergeLog.length,
          d1ElementCount: outputD1Count,
          d2ElementCount: outputD2Count,
          model: selectedModel,
        },
      });

      // Return complete result
      const response: MergeResponse = {
        concepts: outputConcepts,
        mergeLog,
        inputCount: activeConcepts.length,
        outputCount: activeOutputConcepts.length,
        d1ElementCount: outputD1Count,
        d2ElementCount: outputD2Count,
        nextConceptId,
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
      "Connection": "keep-alive",
    },
  });
});
