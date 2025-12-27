// Audit Pipeline Phase 1: Extract concepts from dataset elements
// Uses project model settings instead of hardcoded model

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

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
  supportingEvidence?: string[]; // Direct quotes/citations from elements
}

interface ExtractRequest {
  sessionId: string;
  projectId: string;
  shareToken: string;
  dataset: "d1" | "d2";
  elements: DatasetElement[];
  mappingMode?: "one_to_one" | "one_to_many"; // New setting
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
            temperature: 0.4,
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
        temperature: 0.4,
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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const { sessionId, projectId, shareToken, dataset, elements, mappingMode }: ExtractRequest = await req.json();

    // Get project settings for model configuration
    const { data: project } = await supabase.rpc("get_project_with_token", {
      p_project_id: projectId,
      p_token: shareToken,
    }) as { data: ProjectSettings | null };

    const selectedModel = project?.selected_model || "gemini-2.5-flash";
    const maxTokens = project?.max_tokens || 32768;
    const modelConfig = getModelConfig(selectedModel);

    console.log(`[${dataset}] Using model: ${selectedModel}, maxTokens: ${maxTokens}`);
    
    const datasetLabel = dataset === "d1" ? "requirements/specifications" : "implementation/code";
    
    // Calculate total content size
    const totalContentChars = elements.reduce((sum, e) => sum + (e.content?.length || 0), 0);
    const totalEstimatedTokens = Math.ceil(totalContentChars / 4);
    
    console.log(`[${dataset}] Starting extraction: ${elements.length} elements, ${totalContentChars.toLocaleString()} chars (~${totalEstimatedTokens.toLocaleString()} tokens)`);

    // Build element list with FULL content
    const elementsText = elements.map((e, i) => {
      return `[Element ${i + 1}]
ID: ${e.id}
Label: ${e.label}
Category: ${e.category || "unknown"}
Content:
${e.content || "(empty)"}`;
    }).join("\n\n---\n\n");

    // Build prompt based on mapping mode
    const isOneToOne = mappingMode === "one_to_one";
    
    const mappingInstructions = isOneToOne
      ? `IMPORTANT GUIDELINES (1:1 MAPPING - STRICT):
1. Each element MUST belong to EXACTLY ONE concept (its PRIMARY/best-fit theme)
2. Every element MUST be assigned - no orphans allowed
3. If an element could fit multiple concepts, assign it to the MOST SPECIFIC one
4. Create broader concepts if needed to ensure single assignment

ASSIGNMENT RULES:
- Each element UUID can appear in exactly ONE concept's elementIds
- No duplications allowed
- No orphans allowed (every input element must appear exactly once)
- If unsure, create a more general concept that encompasses multiple themes`
      : `IMPORTANT GUIDELINES (1:MANY MAPPING - FLEXIBLE):
1. The number of concepts should reflect the content
2. A single element CAN belong to multiple concepts if it spans multiple themes
3. Every element MUST be assigned to at least one concept

ASSIGNMENT RULES:
- No orphans allowed (every input element must be mapped to at least one concept)
- Elements spanning multiple themes should appear in multiple concepts`;

    console.log(`[${dataset}] Using ${isOneToOne ? "1:1" : "1:Many"} mapping mode`);

    // ENHANCED PROMPT with mapping mode awareness
    const prompt = `You are analyzing ${datasetLabel} elements to identify high-level concepts.

## Elements to analyze (${elements.length} total):
${elementsText}

## Task
Identify ALL meaningful high-level CONCEPTS that group these elements by theme, purpose, or functionality.

${mappingInstructions}

## Output Format (JSON only)
{
  "concepts": [
    {
      "label": "Concept Name (2-5 words, descriptive)",
      "description": "Comprehensive explanation of what this concept covers (4-8 sentences). Include: (1) The core purpose/theme of this concept, (2) Why these elements belong together, (3) Key features or capabilities represented, (4) Any important sub-themes within this concept.",
      "elementIds": ["element-uuid-1", "element-uuid-2"],
      "supportingEvidence": [
        "Direct quote or key phrase from element 1 that demonstrates this concept",
        "Direct quote or key phrase from element 2 that demonstrates this concept"
      ]
    }
  ]
}

CRITICAL RULES:
1. Every element UUID listed above MUST appear in ${isOneToOne ? "exactly one" : "at least one"} concept's elementIds
2. Use the exact UUIDs from the elements
3. Descriptions must be thorough and evidence-based, not generic
4. supportingEvidence should contain 1-3 SHORT direct quotes (max 50 chars each) from the elements that demonstrate why they belong to this concept
5. Return ONLY valid JSON, no other text`;

    // Log payload size
    const payloadChars = prompt.length;
    const estimatedTokens = Math.ceil(payloadChars / 4);
    console.log(`[${dataset}] Prompt: ${payloadChars.toLocaleString()} chars (~${estimatedTokens.toLocaleString()} tokens)`);

    // Retry logic with exponential backoff
    let lastError: Error | null = null;
    let concepts: ExtractedConcept[] = [];
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[${dataset}] Attempt ${attempt}/${MAX_RETRIES} using ${selectedModel}...`);
        
        const rawText = await callLLM(prompt, modelConfig, maxTokens);
        
        console.log(`[${dataset}] Response: ${rawText.length} chars`);

        // Parse JSON with recovery
        let parsed: { concepts: ExtractedConcept[] };
        try {
          parsed = JSON.parse(rawText);
        } catch {
          console.error(`[${dataset}] JSON parse failed, attempting recovery...`);
          const firstBrace = rawText.indexOf("{");
          const lastBrace = rawText.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
          } else {
            throw new Error(`Failed to parse JSON from LLM response`);
          }
        }

        concepts = parsed.concepts || [];
        console.log(`[${dataset}] Extracted ${concepts.length} concepts`);
        break; // Success - exit retry loop
        
      } catch (err: any) {
        lastError = err;
        const isAbort = err.name === "AbortError";
        const errMsg = isAbort ? "Request timeout (3 min)" : (err.message || String(err));
        
        console.error(`[${dataset}] Attempt ${attempt}/${MAX_RETRIES} failed:`, errMsg);
        
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS * attempt;
          console.log(`[${dataset}] Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    // If all retries failed, return error
    if (concepts.length === 0 && lastError) {
      const errorMessage = lastError.message || String(lastError);
      console.error(`[${dataset}] All ${MAX_RETRIES} attempts failed:`, errorMessage);
      
      return new Response(JSON.stringify({
        success: false,
        error: errorMessage,
        dataset,
        elementCount: elements.length,
        concepts: [],
      }), {
        status: 200, // Return 200 so client can read error
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log to blackboard
    try {
      await supabase.rpc("insert_audit_blackboard_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: `${dataset}_extractor`,
        p_entry_type: `${dataset}_concepts`,
        p_content: `Extracted ${concepts.length} concepts from ${elements.length} elements using ${selectedModel}:\n${concepts.map(c => `• ${c.label} (${c.elementIds.length} elements): ${c.description.slice(0, 100)}...`).join("\n")}`,
        p_iteration: 1,
        p_confidence: 0.9,
        p_evidence: null,
        p_target_agent: null,
      });
    } catch (e) {
      console.warn(`[${dataset}] Failed to log to blackboard:`, e);
    }

    // Log activity
    try {
      await supabase.rpc("insert_audit_activity_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: `${dataset}_extractor`,
        p_activity_type: "concept_extraction",
        p_title: `${dataset === "d1" ? "D1" : "D2"} Concept Extraction Complete`,
        p_content: `Extracted ${concepts.length} concepts from ${elements.length} elements using ${selectedModel}`,
        p_metadata: { 
          conceptCount: concepts.length, 
          elementCount: elements.length, 
          dataset,
          totalContentChars,
          totalEstimatedTokens,
          model: selectedModel,
        },
      });
    } catch (e) {
      console.warn(`[${dataset}] Failed to log activity:`, e);
    }

    console.log(`[${dataset}] Returning ${concepts.length} concepts`);

    return new Response(JSON.stringify({
      success: true,
      concepts,
      dataset,
      elementCount: elements.length,
      totalContentChars,
      totalEstimatedTokens,
      model: selectedModel,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Concept extraction error:", errMsg, error);
    
    return new Response(JSON.stringify({
      success: false,
      error: errMsg,
      concepts: [],
    }), {
      status: 200, // Return 200 so client can read error
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
