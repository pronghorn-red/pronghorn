// Audit Pipeline Phase 3: Build Tesseract cells
// Analyzes each concept from the graph for D1-D2 alignment
// Uses project model settings instead of hardcoded model

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LinkedElement {
  id: string;
  label: string;
  content: string;
}

interface ConceptForTesseract {
  conceptId: string;
  conceptLabel: string;
  conceptDescription: string;
  d1Elements: LinkedElement[];
  d2Elements: LinkedElement[];
}

interface TesseractCell {
  conceptId: string;
  conceptLabel: string;
  polarity: number;
  rationale: string;
  d1Coverage: string;
  d2Implementation: string;
  gaps: string[];
}

interface TesseractRequest {
  sessionId: string;
  projectId: string;
  shareToken: string;
  concepts: ConceptForTesseract[];
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
  // Default to Gemini Flash for speed
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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const { sessionId, projectId, shareToken, concepts }: TesseractRequest = await req.json();

    // Get project settings for model configuration
    const { data: project } = await supabase.rpc("get_project_with_token", {
      p_project_id: projectId,
      p_token: shareToken,
    }) as { data: ProjectSettings | null };

    const selectedModel = project?.selected_model || "gemini-2.5-flash";
    const maxTokens = project?.max_tokens || 8192;
    const modelConfig = getModelConfig(selectedModel);

    console.log(`[tesseract] Using model: ${selectedModel}, maxTokens: ${maxTokens}`);
    
    const totalConcepts = concepts.length;
    console.log(`[tesseract] Received ${totalConcepts} concepts for analysis`);

    if (totalConcepts === 0) {
      console.warn("[tesseract] No concepts to analyze!");
      return new Response(JSON.stringify({ 
        success: true, 
        cells: [], 
        avgPolarity: 0,
        message: "No concepts to analyze" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tesseractCells: TesseractCell[] = [];
    const errors: string[] = [];

    // Process each concept individually (should only be 1 per call)
    for (let i = 0; i < concepts.length; i++) {
      const concept = concepts[i];

      console.log(`[tesseract] Analyzing concept ${i + 1}/${totalConcepts}: ${concept.conceptLabel}`);
      console.log(`[tesseract] - D1 elements: ${concept.d1Elements.length}, D2 elements: ${concept.d2Elements.length}`);

      // Format linked elements for the prompt
      const linkedD1s = concept.d1Elements.map(e => 
        `### ${e.label}\nID: ${e.id}\n${e.content || "(no content)"}`
      );

      const linkedD2s = concept.d2Elements.map(e => 
        `### ${e.label}\nID: ${e.id}\n${e.content || "(no content)"}`
      );

      const prompt = `Analyze alignment between D1 requirements and D2 implementation for this concept.

## Concept: ${concept.conceptLabel}
${concept.conceptDescription || "(no description)"}

## D1 Requirements (Source of Truth) - ${linkedD1s.length} items

${linkedD1s.join("\n\n---\n\n") || "(No D1 elements linked to this concept)"}

## D2 Implementation - ${linkedD2s.length} items

${linkedD2s.join("\n\n---\n\n") || "(No D2 elements linked to this concept)"}

## Your Task

Analyze whether the D2 implementation fully satisfies the D1 requirements for this concept.

Return a JSON object with this exact structure:
{
  "polarity": 0.7,
  "rationale": "A thorough explanation (at least 2-3 sentences) of why you gave this polarity score. What aspects are well covered? What is missing or incomplete? Be specific about the alignment quality.",
  "d1Coverage": "Summary of what D1 requirements exist",
  "d2Implementation": "Summary of what D2 provides",
  "gaps": ["Specific gap 1", "Specific gap 2"]
}

POLARITY SCALE:
- 1.0: Perfect alignment - D2 fully implements all D1 requirements
- 0.5 to 0.9: Good alignment - D2 implements most requirements with minor gaps
- 0.0 to 0.4: Partial alignment - D2 implements some requirements but significant gaps exist
- -0.5 to -0.1: Poor alignment - D2 barely addresses D1 requirements
- -1.0: No alignment or contradictory - D2 does not implement or conflicts with D1

If there are no D1 elements, return polarity -1.0 with rationale explaining no requirements exist.
If there are no D2 elements, return polarity -1.0 with rationale explaining no implementation exists.

Return ONLY the JSON object.`;

      try {
        const rawText = await callLLM(prompt, modelConfig, maxTokens);

        let parsed: { polarity: number; rationale: string; d1Coverage: string; d2Implementation: string; gaps: string[] };
        try {
          parsed = JSON.parse(rawText);
        } catch {
          const firstBrace = rawText.indexOf("{");
          const lastBrace = rawText.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
          } else {
            console.error(`[tesseract] Could not parse response for concept ${concept.conceptLabel}`);
            errors.push(`${concept.conceptLabel}: Failed to parse LLM response`);
            continue;
          }
        }

        const cell: TesseractCell = {
          conceptId: concept.conceptId,
          conceptLabel: concept.conceptLabel,
          polarity: Math.max(-1, Math.min(1, parsed.polarity || 0)),
          rationale: parsed.rationale || "", // Full rationale, no truncation
          d1Coverage: parsed.d1Coverage || "",
          d2Implementation: parsed.d2Implementation || "",
          gaps: parsed.gaps || [],
        };

        tesseractCells.push(cell);

        // Save to database
        await supabase.rpc("upsert_audit_tesseract_cell_with_token", {
          p_session_id: sessionId,
          p_token: shareToken,
          p_x_index: i,
          p_x_element_id: concept.conceptId,
          p_x_element_type: "concept",
          p_x_element_label: concept.conceptLabel,
          p_y_step: 1,
          p_y_step_label: "D1-D2 Alignment",
          p_z_polarity: cell.polarity,
          p_z_criticality: cell.polarity >= 0.5 ? "info" : cell.polarity >= 0 ? "minor" : cell.polarity >= -0.5 ? "major" : "critical",
          p_evidence_summary: cell.rationale, // Full rationale saved
          p_evidence_refs: { 
            gaps: cell.gaps, 
            d1Coverage: cell.d1Coverage, 
            d2Implementation: cell.d2Implementation,
            d1Count: concept.d1Elements.length,
            d2Count: concept.d2Elements.length,
            model: selectedModel
          },
          p_contributing_agents: ["tesseract_analyzer"],
        });

        console.log(`[tesseract] Saved cell for ${concept.conceptLabel}: polarity=${cell.polarity.toFixed(2)}`);

      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[tesseract] Error analyzing concept ${concept.conceptLabel}:`, errMsg);
        errors.push(`${concept.conceptLabel}: ${errMsg}`);
      }
    }

    // Calculate average polarity
    const avgPolarity = tesseractCells.length > 0 
      ? tesseractCells.reduce((sum, c) => sum + c.polarity, 0) / tesseractCells.length 
      : 0;

    console.log(`[tesseract] Complete: ${tesseractCells.length} cells, avgPolarity=${avgPolarity.toFixed(2)}, model=${selectedModel}`);

    // Write summary to blackboard (only if we processed cells)
    if (tesseractCells.length > 0) {
      await supabase.rpc("insert_audit_blackboard_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: "tesseract_analyzer",
        p_entry_type: "tesseract_cell",
        p_content: `Analyzed: ${tesseractCells[0].conceptLabel} → polarity ${tesseractCells[0].polarity.toFixed(2)} (using ${selectedModel})\n${tesseractCells[0].rationale}`,
        p_iteration: 3,
        p_confidence: 0.9,
        p_evidence: null,
        p_target_agent: null,
      });

      await supabase.rpc("insert_audit_activity_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: "tesseract_analyzer",
        p_activity_type: "tesseract_cell",
        p_title: `Tesseract: ${tesseractCells[0].conceptLabel}`,
        p_content: `Polarity: ${tesseractCells[0].polarity.toFixed(2)} - ${tesseractCells[0].rationale.slice(0, 100)}...`,
        p_metadata: { 
          conceptLabel: tesseractCells[0].conceptLabel,
          polarity: tesseractCells[0].polarity,
          gapCount: tesseractCells[0].gaps.length,
          model: selectedModel
        },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      cells: tesseractCells, // Full cells with complete rationale
      avgPolarity,
      errors: errors.length > 0 ? errors : undefined,
      message: `Analyzed ${tesseractCells.length} concept(s) using ${selectedModel}`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("[tesseract] Error:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errMsg,
      cells: [],
      avgPolarity: 0
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
