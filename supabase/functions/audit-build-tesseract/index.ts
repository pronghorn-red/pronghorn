// Audit Pipeline Phase 3: Build Tesseract cells
// Analyzes each concept from the graph for D1-D2 alignment
// Receives concepts with their linked D1/D2 element content already gathered

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

      const { sessionId, projectId, shareToken, concepts }: TesseractRequest = await req.json();
      
      const totalConcepts = concepts.length;
      console.log(`[tesseract] Received ${totalConcepts} concepts for analysis`);
      
      await sendSSE("progress", { 
        phase: "tesseract", 
        message: `Analyzing ${totalConcepts} concepts for alignment...`, 
        progress: 0,
        total: totalConcepts,
        current: 0
      });

      if (totalConcepts === 0) {
        console.warn("[tesseract] No concepts to analyze!");
        await sendSSE("progress", { phase: "tesseract", message: "No concepts found in graph", progress: 100 });
        await sendSSE("result", { cells: [], avgPolarity: 0 });
        await sendSSE("done", { success: true });
        await writer.close();
        return;
      }

      const tesseractCells: TesseractCell[] = [];

      // Process each concept individually
      for (let i = 0; i < concepts.length; i++) {
        const concept = concepts[i];
        const progressPercent = Math.round(((i + 1) / totalConcepts) * 100);

        console.log(`[tesseract] Analyzing concept ${i + 1}/${totalConcepts}: ${concept.conceptLabel}`);
        console.log(`[tesseract] - D1 elements: ${concept.d1Elements.length}, D2 elements: ${concept.d2Elements.length}`);

        await sendSSE("progress", { 
          phase: "tesseract", 
          message: `Analyzing: ${concept.conceptLabel} (${i + 1}/${totalConcepts})`, 
          progress: progressPercent,
          current: i + 1,
          total: totalConcepts,
          conceptLabel: concept.conceptLabel
        });

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
  "rationale": "Detailed explanation of why you gave this polarity score. What is well covered? What is missing?",
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
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                  temperature: 0.3,
                  maxOutputTokens: 2048,
                  responseMimeType: "application/json",
                },
              }),
            }
          );

          if (!response.ok) {
            console.error(`[tesseract] Gemini error for concept ${concept.conceptLabel}:`, await response.text());
            continue;
          }

          const result = await response.json();
          const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

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
              continue;
            }
          }

          const cell: TesseractCell = {
            conceptId: concept.conceptId,
            conceptLabel: concept.conceptLabel,
            polarity: Math.max(-1, Math.min(1, parsed.polarity || 0)),
            rationale: parsed.rationale || "",
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
            p_evidence_summary: cell.rationale,
            p_evidence_refs: { 
              gaps: cell.gaps, 
              d1Coverage: cell.d1Coverage, 
              d2Implementation: cell.d2Implementation,
              d1Count: concept.d1Elements.length,
              d2Count: concept.d2Elements.length
            },
            p_contributing_agents: ["tesseract_analyzer"],
          });

          console.log(`[tesseract] Saved cell for ${concept.conceptLabel}: polarity=${cell.polarity.toFixed(2)}`);

          await sendSSE("cell", { 
            conceptLabel: cell.conceptLabel,
            polarity: cell.polarity,
            rationale: cell.rationale.slice(0, 200),
            gapCount: cell.gaps.length
          });

        } catch (err) {
          console.error(`[tesseract] Error analyzing concept ${concept.conceptLabel}:`, err);
        }
      }

      // Write summary to blackboard
      const avgPolarity = tesseractCells.length > 0 
        ? tesseractCells.reduce((sum, c) => sum + c.polarity, 0) / tesseractCells.length 
        : 0;

      console.log(`[tesseract] Complete: ${tesseractCells.length} cells, avgPolarity=${avgPolarity.toFixed(2)}`);

      await supabase.rpc("insert_audit_blackboard_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: "tesseract_analyzer",
        p_entry_type: "tesseract_complete",
        p_content: `Tesseract Analysis Complete:\n- Concepts analyzed: ${tesseractCells.length}\n- Average polarity: ${avgPolarity.toFixed(2)}\n- High alignment (>0.5): ${tesseractCells.filter(c => c.polarity >= 0.5).length}\n- Partial alignment (0-0.5): ${tesseractCells.filter(c => c.polarity >= 0 && c.polarity < 0.5).length}\n- Poor alignment (<0): ${tesseractCells.filter(c => c.polarity < 0).length}`,
        p_iteration: 3,
        p_confidence: 0.9,
        p_evidence: null,
        p_target_agent: null,
      });

      await supabase.rpc("insert_audit_activity_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: "tesseract_analyzer",
        p_activity_type: "tesseract_complete",
        p_title: `Tesseract Analysis Complete`,
        p_content: `Analyzed ${tesseractCells.length} concepts, average polarity: ${avgPolarity.toFixed(2)}`,
        p_metadata: { 
          cellCount: tesseractCells.length, 
          avgPolarity,
          highAlignment: tesseractCells.filter(c => c.polarity >= 0.5).length,
          lowAlignment: tesseractCells.filter(c => c.polarity < 0).length
        },
      });

      await sendSSE("progress", { phase: "tesseract", message: "Tesseract analysis complete", progress: 100 });
      await sendSSE("result", { cells: tesseractCells, avgPolarity });
      await sendSSE("done", { success: true });

    } catch (error: unknown) {
      console.error("[tesseract] Error:", error);
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
