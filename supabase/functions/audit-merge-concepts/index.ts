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
  elementLabels?: string[]; // Labels of the D1 elements for context
}

interface D2Concept {
  label: string;
  description: string;
  d2Ids: string[];
  elementLabels?: string[]; // Labels of the D2 elements for context
}

interface MergeInstruction {
  mergedLabel: string;
  mergedDescription: string;
  sourceConcepts: string[]; // Unified list of concept labels that were merged
  d1Ids: string[];
  d2Ids: string[];
}

interface MergeRequest {
  sessionId: string;
  projectId: string;
  shareToken: string;
  d1Concepts: D1Concept[];
  d2Concepts: D2Concept[];
  consolidationRound?: number; // 1, 2, or 3
  totalRounds?: number;       // Total rounds for this audit
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

      const { sessionId, projectId, shareToken, d1Concepts, d2Concepts, consolidationRound, totalRounds }: MergeRequest = await req.json();

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
      console.log(`[merge] Starting: ${d1Concepts.length} D1 concepts, ${d2Concepts.length} D2 concepts`);
      
      await sendSSE("progress", { 
        phase: "concept_merge", 
        message: `Analyzing ${d1Concepts.length} D1 + ${d2Concepts.length} D2 concepts for merging using ${selectedModel}...`, 
        progress: 0 
      });

      // Build a UNIFIED concept list for the LLM (all concepts together)
      // Each concept shows its source (D1/D2) and element labels for context
      const allConcepts: Array<{
        label: string;
        description: string;
        source: "D1" | "D2";
        elementCount: number;
        elementLabels: string[];
        d1Ids: string[];
        d2Ids: string[];
      }> = [
        ...d1Concepts.map(c => ({
          label: c.label,
          description: c.description,
          source: "D1" as const,
          elementCount: c.d1Ids.length,
          elementLabels: c.elementLabels || [],
          d1Ids: c.d1Ids,
          d2Ids: [] as string[],
        })),
        ...d2Concepts.map(c => ({
          label: c.label,
          description: c.description,
          source: "D2" as const,
          elementCount: c.d2Ids.length,
          elementLabels: c.elementLabels || [],
          d1Ids: [] as string[],
          d2Ids: c.d2Ids,
        })),
      ];

      // Build concept text with element labels for context
      const conceptsText = allConcepts.map((c, i) => {
        const elementsPreview = c.elementLabels.length > 0 
          ? `\n  Elements:\n${c.elementLabels.slice(0, 5).map(el => `    - ${el.slice(0, 100)}`).join("\n")}${c.elementLabels.length > 5 ? `\n    ... and ${c.elementLabels.length - 5} more` : ""}`
          : "";
        return `${i + 1}. "${c.label}" [${c.source}, ${c.elementCount} elements]\n  Description: ${c.description}${elementsPreview}`;
      }).join("\n\n");

      // Calculate target concept count for guidance
      const totalInputConcepts = allConcepts.length;
      const totalSourceElements = new Set([...d1Concepts.flatMap(c => c.d1Ids), ...d2Concepts.flatMap(c => c.d2Ids)]).size;
      const targetConceptRatio = Math.max(Math.ceil(totalSourceElements / 4), Math.ceil(totalInputConcepts / 3));

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
      
      const prompt = `You are merging concepts from two datasets. This is ROUND ${round}/${rounds}: ${roundConfig.label}

**MERGE CRITERIA FOR THIS ROUND:**
${roundConfig.criteria}

**Current input:** ${totalInputConcepts} concepts from ${totalSourceElements} source elements

${round === 3 ? "**AGGRESSIVE MODE**: Merge liberally. Target 5-15 final broad concepts." : ""}

## All Concepts (D1 = requirements/source of truth, D2 = implementation)

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
3. Use ONLY the concept NAME - do NOT include the [D1, X elements] or [D2, X elements] metadata
4. Do NOT list individual elements - only identify which CONCEPTS to merge

## Output Format

Return a JSON object with this structure:
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
Do NOT include the [D1, X elements] or [D2, X elements] suffix that appears in the input list.

Notes:
- "sourceConcepts" is the list of concept labels to merge (can include any mix of D1 and D2 concepts)
- Concepts not listed in any merge will remain unchanged
- Each concept label can only appear in ONE merge

Return ONLY the JSON object, no other text.`;

      const payloadChars = prompt.length;
      console.log(`[merge] Prompt: ${payloadChars.toLocaleString()} chars (~${Math.ceil(payloadChars/4).toLocaleString()} tokens)`);

      await sendSSE("progress", { phase: "concept_merge", message: `Calling ${selectedModel} for concept matching...`, progress: 20 });

      const rawText = await callLLM(prompt, modelConfig, maxTokens);
      
      console.log(`[merge] RAW LLM Response (${rawText.length} chars):\n${rawText}`);
      
      await sendSSE("progress", { phase: "concept_merge", message: "Parsing merge instructions...", progress: 60 });

      // Parse JSON - now expects simplified merges format
      let parsed: { 
        merges: Array<{
          sourceConcepts: string[];
          mergedLabel: string;
          mergedDescription: string;
        }>; 
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

      // Build a UNIFIED concept lookup map (label -> { d1Ids, d2Ids })
      const conceptByLabel = new Map<string, { d1Ids: string[], d2Ids: string[] }>();
      
      // Add D1 concepts to the map
      d1Concepts.forEach(c => {
        const key = c.label.toLowerCase();
        if (!conceptByLabel.has(key)) {
          conceptByLabel.set(key, { d1Ids: [], d2Ids: [] });
        }
        conceptByLabel.get(key)!.d1Ids.push(...c.d1Ids);
      });
      
      // Add D2 concepts to the map
      d2Concepts.forEach(c => {
        const key = c.label.toLowerCase();
        if (!conceptByLabel.has(key)) {
          conceptByLabel.set(key, { d1Ids: [], d2Ids: [] });
        }
        conceptByLabel.get(key)!.d2Ids.push(...c.d2Ids);
      });

      // Track which concepts have been used to prevent duplication
      const usedConcepts = new Set<string>();

      // Reconstruct full merged concepts with IDs
      const mergedConcepts: MergeInstruction[] = (parsed.merges || []).map(m => {
        const d1Ids: string[] = [];
        const d2Ids: string[] = [];
        const actualSourceConcepts: string[] = [];
        
        for (const label of (m.sourceConcepts || [])) {
          const key = label.toLowerCase();
          
          // Check if this concept was already used in a previous merge
          if (usedConcepts.has(key)) {
            console.log(`[merge] WARNING: Concept "${label}" already used in a previous merge, skipping duplicate reference`);
            continue;
          }
          
          // Mark as used
          usedConcepts.add(key);
          
          // Find the concept and aggregate its IDs
          const found = conceptByLabel.get(key);
          if (found) {
            d1Ids.push(...found.d1Ids);
            d2Ids.push(...found.d2Ids);
            actualSourceConcepts.push(label);
          } else {
            console.log(`[merge] WARNING: Concept label "${label}" not found in input concepts`);
          }
        }
        
        return {
          mergedLabel: m.mergedLabel,
          mergedDescription: m.mergedDescription,
          sourceConcepts: actualSourceConcepts,
          d1Ids,
          d2Ids
        };
      }).filter(m => m.sourceConcepts.length >= 2); // Only keep actual merges (2+ concepts)

      // Programmatically derive unmerged concepts
      // Any concept NOT in usedConcepts is unmerged
      const unmergedD1Concepts = d1Concepts.filter(c => !usedConcepts.has(c.label.toLowerCase()));
      const unmergedD2Concepts = d2Concepts.filter(c => !usedConcepts.has(c.label.toLowerCase()));

      console.log(`[merge] Used concepts: ${usedConcepts.size}, Unmerged: ${unmergedD1Concepts.length} D1, ${unmergedD2Concepts.length} D2`);

      // Count different merge types
      const d1OnlyMerges = mergedConcepts.filter(c => c.d1Ids.length > 0 && c.d2Ids.length === 0).length;
      const d2OnlyMerges = mergedConcepts.filter(c => c.d2Ids.length > 0 && c.d1Ids.length === 0).length;
      const crossMerges = mergedConcepts.filter(c => c.d1Ids.length > 0 && c.d2Ids.length > 0).length;

      console.log(`[merge] Results: ${mergedConcepts.length} merged (${d1OnlyMerges} D1-only, ${d2OnlyMerges} D2-only, ${crossMerges} D1↔D2), ${unmergedD1Concepts.length} D1-only, ${unmergedD2Concepts.length} D2-only`);

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
        p_content: `Concept Merge Results (using ${selectedModel}):\n- Total merged concepts: ${mergedConcepts.length}\n  - D1-only merges: ${d1OnlyMerges}\n  - D2-only merges: ${d2OnlyMerges}\n  - D1↔D2 merges: ${crossMerges}\n- D1-only (gaps): ${unmergedD1Concepts.length}\n- D2-only (potential orphans): ${unmergedD2Concepts.length}\n\nMerged:\n${mergedConcepts.map(c => `• ${c.mergedLabel} (${c.d1Ids.length} D1, ${c.d2Ids.length} D2) ← [${c.sourceConcepts.join(", ")}]`).join("\n")}`,
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
        p_content: `Merged ${mergedConcepts.length} concepts (${d1OnlyMerges} D1-only, ${d2OnlyMerges} D2-only, ${crossMerges} D1↔D2), ${unmergedD1Concepts.length} D1-only gaps, ${unmergedD2Concepts.length} D2-only orphans using ${selectedModel}`,
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
