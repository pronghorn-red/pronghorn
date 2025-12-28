// Audit Pipeline Phase 1: Extract concepts from dataset elements
// Uses project model settings instead of hardcoded model
// Supports context-aware extraction with existing concepts

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

// Existing concept passed from client for context-aware extraction
interface ExistingConcept {
  id: string;       // e.g., "C1", "C5"
  label: string;
  description: string;
}

// Legacy response format (for 1:1 mode and recovery)
interface ExtractedConcept {
  label: string;
  description: string;
  elementIds: string[];
  supportingEvidence?: string[];
}

// New response format for context-aware 1:many mode
interface ContextAwareResponse {
  new_concepts: Array<{
    label: string;
    description: string;
  }>;
  existing_concepts: string[]; // Array of concept IDs like ["C1", "C3"]
}

interface ExtractRequest {
  sessionId: string;
  projectId: string;
  shareToken: string;
  dataset: "d1" | "d2";
  elements: DatasetElement[];
  mappingMode?: "one_to_one" | "one_to_many";
  recoveryMode?: boolean;
  existingConceptLabels?: string[];
  // New fields for context-aware extraction
  existingConcepts?: ExistingConcept[];
  maxConceptsPerElement?: number;
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

// Taxonomy mission - used in both system prompt and user prompt for redundancy
const TAXONOMY_MISSION = `You are an artifact categorizer building a concept taxonomy as part of a critical project audit.

Your mission is to evaluate project artifacts by categorizing them into meaningful, specific concepts. These concepts will be used to understand important themes, identify gaps between requirements and implementations, and assess coverage.

Critical rules:
- Every element MUST be assigned at least one concept
- Concepts must be SPECIFIC (e.g., "User Session Management" not "General User Items")
- Reuse existing concepts only when there's a true semantic match
- Create new concepts for genuinely unique themes
- Never use catch-all or vague concepts like "General", "Miscellaneous", or "Other"`;

// Call LLM based on model type - now with optional system prompt support
async function callLLM(
  prompt: string,
  config: { apiType: "anthropic" | "gemini" | "xai"; modelName: string; apiKeyEnv: string },
  maxTokens: number,
  systemPrompt?: string
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
        ...(systemPrompt ? { system: systemPrompt } : {}),
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
          ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
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
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });
    
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages,
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

    const { 
      sessionId, projectId, shareToken, dataset, elements, 
      mappingMode, recoveryMode, existingConceptLabels,
      existingConcepts, maxConceptsPerElement 
    }: ExtractRequest = await req.json();

    // Get project settings for model configuration
    const { data: project } = await supabase.rpc("get_project_with_token", {
      p_project_id: projectId,
      p_token: shareToken,
    }) as { data: ProjectSettings | null };

    const selectedModel = project?.selected_model || "gemini-2.5-flash";
    const modelConfig = getModelConfig(selectedModel);
    
    // Determine if we should use context-aware mode
    const isContextAwareMode = mappingMode === "one_to_many" && 
                               existingConcepts && 
                               existingConcepts.length >= 0 && 
                               !recoveryMode;
    
    // Use reduced tokens for context-aware mode (faster responses)
    const maxTokens = isContextAwareMode ? 4096 : (project?.max_tokens || 32768);

    console.log(`[${dataset}] Using model: ${selectedModel}, maxTokens: ${maxTokens}, contextAware: ${isContextAwareMode}, recoveryMode: ${recoveryMode || false}`);
    
    // Debug: Confirm context-aware mode entry
    if (isContextAwareMode) {
      console.log(`[${dataset}] CONTEXT-AWARE MODE ACTIVE - ${existingConcepts?.length || 0} existing concepts passed`);
    }
    
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

    // Build prompt based on mode
    const isOneToOne = mappingMode === "one_to_one";
    let prompt: string;
    
    if (recoveryMode) {
      // RECOVERY MODE: More aggressive prompt for orphaned elements
      const existingLabels = existingConceptLabels?.length 
        ? `\n\nEXISTING CONCEPTS IN THIS DATASET:\n${existingConceptLabels.map(l => `• ${l}`).join("\n")}`
        : "";
      
      prompt = `You are analyzing ORPHANED ${datasetLabel} elements that were missed in the initial extraction pass.

CRITICAL: These elements MUST be assigned. Every single one. No exceptions.
${existingLabels}

## Orphaned Elements to Categorize (${elements.length} total):
${elementsText}

## Task
Assign EVERY element above to a concept. You have two options for each:
1. Assign to an EXISTING concept (use exact label from the list above)
2. Create a NEW concept if the element truly doesn't fit any existing concept

RULES (MANDATORY):
- EVERY element ID must appear in exactly ONE concept
- Prefer assigning to existing concepts when there's ANY reasonable fit
- Only create new concepts for genuinely unique themes
- Even if an element seems ambiguous, pick the BEST FIT - do not leave orphans
- If an element is too generic, create a "General ${dataset.toUpperCase()} Elements" catch-all

## Output Format (JSON only)
{
  "concepts": [
    {
      "label": "Exact existing label OR new concept name",
      "description": "Brief explanation of this concept",
      "elementIds": ["element-uuid-1", "element-uuid-2"],
      "isExisting": true or false
    }
  ]
}

ABSOLUTE REQUIREMENT: Every single element ID from the list above MUST appear in exactly one concept. Zero orphans.`;

    } else if (isContextAwareMode) {
      // CONTEXT-AWARE MODE: Pass existing concepts, return simplified response
      const maxConcepts = maxConceptsPerElement || 10;
      
      // Filter out any "General" or "Miscellaneous" concepts from the list to prevent lazy reuse
      const filteredConcepts = existingConcepts?.filter(c => 
        !c.label.toLowerCase().includes('general') && 
        !c.label.toLowerCase().includes('miscellaneous') &&
        !c.label.toLowerCase().includes('other items') &&
        !c.label.toLowerCase().includes('catch-all')
      ) || [];
      
      const existingConceptsList = filteredConcepts.length > 0
        ? filteredConcepts.map(c => `- ${c.id}: ${c.label} - ${c.description.slice(0, 100)}...`).join("\n")
        : "(no existing concepts yet)";
      
      console.log(`[${dataset}] Filtered ${(existingConcepts?.length || 0) - filteredConcepts.length} generic concepts from list`);
      
prompt = `You are an artifact categorizer building a concept taxonomy as part of a critical project audit.

## Your Mission
We are evaluating the completeness of project artifacts by categorizing them into meaningful concepts. These concepts will be used by future LLMs to understand important themes, identify gaps, and assess coverage between different artifact sets. The quality of your categorization directly determines whether this audit can succeed.

## Why This Matters
Without proper, specific categorization:
- We cannot identify gaps between requirements and implementations
- We cannot measure coverage or completeness
- The entire audit becomes unreliable

## Element to Analyze
${elementsText}

## Existing Concept Taxonomy (for context and potential reuse)
${existingConceptsList}

The existing concepts above represent categories we've already identified. You should:
1. **Reuse an existing concept** if this element genuinely fits its semantic meaning
2. **Create a new concept** if this element represents a theme not yet captured

Think carefully: What is this element ACTUALLY about? What specific functionality, requirement, or capability does it describe?

## Your Response (JSON only)
Return up to ${maxConcepts} concepts that accurately describe this element:

{
  "new_concepts": [
    {
      "label": "Descriptive Name (2-5 words)",
      "description": "A thorough explanation (4-8 sentences) of what this concept represents, what types of elements belong here, key characteristics, and how it differs from similar concepts."
    }
  ],
  "existing_concepts": ["C1", "C3"]
}

## Guidelines
- **Be specific**: "User Session Management" not "General User Items"
- **Be accurate**: Match the element's actual content, not a vague category
- **Reuse wisely**: Only reuse existing concepts that are a TRUE semantic match
- **Create thoughtfully**: New concepts should be specific enough to be useful for gap analysis
- **At least one concept required**: Every element must have at least one concept assignment

## Quality Check (ask yourself)
Before responding, verify:
- Does my concept name specifically describe what this element is about?
- Would another analyst reading just the concept name understand what elements belong here?
- Am I being lazy by using a catch-all, or am I truly categorizing the content?`;

    } else {
      // NORMAL MODE: Standard extraction prompt (1:1 or 1:many without context)
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

      prompt = `You are analyzing ${datasetLabel} elements to identify high-level concepts.

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
3. NEVER create a concept with 0 elements in elementIds - every concept MUST have at least 1 element
4. Descriptions must be thorough and evidence-based, not generic
5. supportingEvidence should contain 1-3 SHORT direct quotes (max 50 chars each) from the elements that demonstrate why they belong to this concept
6. Return ONLY valid JSON, no other text`;
    }

    // Log payload size
    const payloadChars = prompt.length;
    const estimatedTokens = Math.ceil(payloadChars / 4);
    console.log(`[${dataset}] Prompt: ${payloadChars.toLocaleString()} chars (~${estimatedTokens.toLocaleString()} tokens)`);

    // Retry logic with exponential backoff
    let lastError: Error | null = null;
    let rawResult: any = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[${dataset}] Attempt ${attempt}/${MAX_RETRIES} using ${selectedModel}...`);
        
        // For context-aware mode, use mission in both system prompt AND user prompt (belt + suspenders)
        const finalPrompt = isContextAwareMode ? `${TAXONOMY_MISSION}\n\n${prompt}` : prompt;
        const systemPromptToUse = isContextAwareMode ? TAXONOMY_MISSION : undefined;
        
        const rawText = await callLLM(finalPrompt, modelConfig, maxTokens, systemPromptToUse);
        
        console.log(`[${dataset}] Response: ${rawText.length} chars`);

        // Parse JSON with recovery
        let parsed: any;
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

        // For context-aware mode, validate at least 1 concept was returned
        if (isContextAwareMode) {
          const newCount = (parsed.new_concepts || []).length;
          const existingCount = (parsed.existing_concepts || []).length;
          if (newCount === 0 && existingCount === 0) {
            console.warn(`[${dataset}] LLM returned 0 concepts - retrying with stronger prompt`);
            throw new Error("LLM returned 0 concepts - must return at least 1");
          }
        }

        rawResult = parsed;
        console.log(`[${dataset}] Parsed response successfully`);
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

    // If all retries failed in context-aware mode due to 0 concepts, create fallback
    if (!rawResult && lastError && isContextAwareMode && 
        lastError.message?.includes("0 concepts")) {
      console.log(`[${dataset}] Creating FALLBACK concept for ${elements.length} element(s) after all retries failed`);
      
      const fallbackLabel = dataset === "d1" 
        ? "General Requirements Items" 
        : "General Implementation Items";
      
      rawResult = {
        new_concepts: [{
          label: fallbackLabel,
          description: `This is a fallback concept for elements that could not be categorized by the LLM after ${MAX_RETRIES} attempts. These elements may require manual review or represent edge cases in the ${datasetLabel} dataset. Elements: ${elements.map(e => e.label).join(', ')}`
        }],
        existing_concepts: []
      };
      
      console.log(`[${dataset}] Fallback concept created: "${fallbackLabel}"`);
    }
    
    // If all retries failed for other reasons, return error
    if (!rawResult && lastError) {
      const errorMessage = lastError.message || String(lastError);
      console.error(`[${dataset}] All ${MAX_RETRIES} attempts failed:`, errorMessage);
      
      return new Response(JSON.stringify({
        success: false,
        error: errorMessage,
        dataset,
        elementCount: elements.length,
        concepts: [],
        new_concepts: [],
        existing_concepts: [],
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process response based on mode
    if (isContextAwareMode) {
      // CONTEXT-AWARE MODE: Return new simplified structure
      const newConcepts = rawResult.new_concepts || [];
      const existingConceptIds = rawResult.existing_concepts || [];
      
      console.log(`[${dataset}] Context-aware result: ${newConcepts.length} new concepts, ${existingConceptIds.length} existing refs`);

      return new Response(JSON.stringify({
        success: true,
        contextAware: true,
        new_concepts: newConcepts,
        existing_concepts: existingConceptIds,
        dataset,
        elementCount: elements.length,
        totalContentChars,
        totalEstimatedTokens,
        model: selectedModel,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // LEGACY MODE: Return concepts array with elementIds
      let concepts_raw = rawResult.concepts || [];
      
      // Filter out concepts with no assigned elements
      const beforeFilter = concepts_raw.length;
      const concepts = concepts_raw.filter((c: ExtractedConcept) => c.elementIds && c.elementIds.length > 0);
      if (concepts.length < beforeFilter) {
        console.log(`[${dataset}] Filtered out ${beforeFilter - concepts.length} concepts with 0 elements`);
      }
      
      console.log(`[${dataset}] Extracted ${concepts.length} concepts (after filtering)`);

      return new Response(JSON.stringify({
        success: true,
        contextAware: false,
        concepts,
        dataset,
        elementCount: elements.length,
        totalContentChars,
        totalEstimatedTokens,
        model: selectedModel,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Concept extraction error:", errMsg, error);
    
    return new Response(JSON.stringify({
      success: false,
      error: errMsg,
      concepts: [],
      new_concepts: [],
      existing_concepts: [],
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
