// Audit Pipeline Phase 4: Generate Venn diagram results
// Synthesizes all data into final Venn analysis
// Uses graph structure + tesseract scores to determine overlap

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface D1Concept {
  label: string;
  description: string;
  d1Ids?: string[];
  elementIds?: string[]; // Client may send this instead
}

interface D2Concept {
  label: string;
  description: string;
  d2Ids?: string[];
  elementIds?: string[]; // Client may send this instead
}

interface MergedConcept {
  mergedLabel: string;
  mergedDescription: string;
  d1Ids: string[];
  d2Ids: string[];
}

interface TesseractCell {
  conceptLabel: string;
  polarity: number;
  rationale?: string;
  gaps?: string[];
  d1ElementIds?: string[];
  d2ElementIds?: string[];
}

interface VennRequest {
  sessionId: string;
  projectId: string;
  shareToken: string;
  mergedConcepts: MergedConcept[];
  unmergedD1Concepts: D1Concept[];
  unmergedD2Concepts: D2Concept[];
  tesseractCells: TesseractCell[];
}

interface VennItem {
  id: string;
  label: string;
  category: string;
  criticality: string;
  evidence: string;
  sourceElement: string;
  polarity: number;
  description: string;
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

      const { 
        sessionId, projectId, shareToken, 
        mergedConcepts, unmergedD1Concepts, unmergedD2Concepts,
        tesseractCells 
      }: VennRequest = await req.json();
      
      console.log("[venn] Received request:", {
        mergedConcepts: mergedConcepts?.length || 0,
        unmergedD1: unmergedD1Concepts?.length || 0,
        unmergedD2: unmergedD2Concepts?.length || 0,
        tesseractCells: tesseractCells?.length || 0,
      });
      
      await sendSSE("progress", { phase: "venn", message: "Generating Venn diagram...", progress: 0 });

      // Create tesseract lookup by concept label
      const tesseractMap = new Map((tesseractCells || []).map(c => [c.conceptLabel, c]));

      // Build Venn categories
      const uniqueToD1: VennItem[] = [];
      const aligned: VennItem[] = [];
      const uniqueToD2: VennItem[] = [];

      // Track merged concept labels to avoid duplicates when processing tesseract
      const mergedLabels = new Set(mergedConcepts.map(c => c.mergedLabel));

      await sendSSE("progress", { phase: "venn", message: "Processing unmerged D1 concepts (gaps)...", progress: 20 });

      // Unmerged D1 concepts = unique to D1 (gaps - requirements not met)
      for (const concept of (unmergedD1Concepts || [])) {
        const ids = concept.d1Ids || concept.elementIds || [];
        uniqueToD1.push({
          id: crypto.randomUUID(),
          label: concept.label,
          category: "unique_d1",
          criticality: "major", // Gaps are major issues
          evidence: concept.description,
          sourceElement: ids[0] || "",
          polarity: -1, // No D2 match
          description: `D1 requirement not implemented: ${concept.description}`,
        });
      }

      await sendSSE("progress", { phase: "venn", message: "Processing merged concepts (aligned)...", progress: 50 });

      // Merged concepts = aligned (but quality varies by tesseract polarity)
      for (const concept of mergedConcepts) {
        const tesseractData = tesseractMap.get(concept.mergedLabel);
        const polarity = tesseractData?.polarity ?? 0.5;
        
        // Determine criticality based on polarity
        let criticality = "info";
        if (polarity < 0) criticality = "critical";
        else if (polarity < 0.3) criticality = "major";
        else if (polarity < 0.7) criticality = "minor";

        aligned.push({
          id: crypto.randomUUID(),
          label: concept.mergedLabel,
          category: "aligned",
          criticality,
          evidence: tesseractData?.rationale || concept.mergedDescription,
          sourceElement: concept.d1Ids[0] || concept.d2Ids[0] || "",
          polarity,
          description: `${concept.d1Ids.length} D1 requirements matched with ${concept.d2Ids.length} D2 implementations. ${tesseractData?.gaps?.length ? `Gaps: ${tesseractData.gaps.join(", ")}` : ""}`,
        });
      }

      await sendSSE("progress", { phase: "venn", message: "Processing unmerged D2 concepts (orphans)...", progress: 70 });

      // Unmerged D2 concepts = unique to D2 (orphans - implementation without requirements)
      for (const concept of (unmergedD2Concepts || [])) {
        const ids = concept.d2Ids || concept.elementIds || [];
        uniqueToD2.push({
          id: crypto.randomUUID(),
          label: concept.label,
          category: "unique_d2",
          criticality: "info", // Orphans are informational (extra work, but not necessarily bad)
          evidence: concept.description,
          sourceElement: ids[0] || "",
          polarity: 0, // No D1 match
          description: `D2 implementation without corresponding D1 requirement: ${concept.description}`,
        });
      }

      // Also check tesseract cells for D2-only concepts (concepts with D2 elements but no D1 elements)
      // These represent implementation that the Tesseract identified as unmatched
      for (const cell of (tesseractCells || [])) {
        const d1Count = cell.d1ElementIds?.length || 0;
        const d2Count = cell.d2ElementIds?.length || 0;
        
        // If concept has D2 elements but no D1 elements, it's unique to D2
        if (d2Count > 0 && d1Count === 0 && !mergedLabels.has(cell.conceptLabel)) {
          // Check if already in uniqueToD2
          const alreadyExists = uniqueToD2.some(item => item.label === cell.conceptLabel);
          if (!alreadyExists) {
            uniqueToD2.push({
              id: crypto.randomUUID(),
              label: cell.conceptLabel,
              category: "unique_d2",
              criticality: "info",
              evidence: cell.rationale || "",
              sourceElement: cell.d2ElementIds?.[0] || "",
              polarity: 0,
              description: `D2 implementation identified by Tesseract with no matching D1 requirements`,
            });
          }
        }
      }

      await sendSSE("progress", { phase: "venn", message: "Calculating coverage statistics...", progress: 85 });

      // Calculate summary statistics
      const totalD1Concepts = mergedConcepts.length + (unmergedD1Concepts?.length || 0);
      const totalD2Concepts = mergedConcepts.length + uniqueToD2.length; // Use uniqueToD2 which includes tesseract-identified orphans
      
      const d1Coverage = totalD1Concepts > 0 ? (mergedConcepts.length / totalD1Concepts) * 100 : 0;
      const d2Coverage = totalD2Concepts > 0 ? (mergedConcepts.length / totalD2Concepts) * 100 : 0;
      
      const avgPolarity = aligned.length > 0 
        ? aligned.reduce((sum, a) => sum + a.polarity, 0) / aligned.length 
        : 0;

      // Alignment score: prioritize aligned count, with polarity as secondary factor
      // New formula: (aligned / max(totalD1, totalD2)) * 100 * (0.5 + avgPolarity * 0.5)
      // This gives a more intuitive percentage where high alignment = high score
      const maxTotal = Math.max(totalD1Concepts, totalD2Concepts);
      const baseAlignmentRatio = maxTotal > 0 ? (aligned.length / maxTotal) * 100 : 0;
      const polarityBonus = avgPolarity > 0 ? (0.5 + avgPolarity * 0.5) : 0.5;
      const alignmentScore = baseAlignmentRatio * polarityBonus;

      const vennResult = {
        unique_to_d1: uniqueToD1,
        aligned,
        unique_to_d2: uniqueToD2,
        summary: {
          total_d1_coverage: d1Coverage,
          total_d2_coverage: d2Coverage,
          alignment_score: alignmentScore,
          gaps: uniqueToD1.length,
          orphans: uniqueToD2.length,
          aligned: aligned.length,
          avg_polarity: avgPolarity,
        },
        generatedAt: new Date().toISOString(),
      };

      await sendSSE("progress", { phase: "venn", message: "Saving Venn results...", progress: 95 });

      // Save to session
      await supabase.rpc("update_audit_session_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_venn_result: vennResult,
        p_status: "completed",
        p_phase: "completed",
      });

      // Write final summary to blackboard
      await supabase.rpc("insert_audit_blackboard_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: "venn_generator",
        p_entry_type: "venn_complete",
        p_content: `VENN ANALYSIS COMPLETE\n\n` +
          `📊 Coverage Summary:\n` +
          `- D1 Coverage: ${d1Coverage.toFixed(1)}%\n` +
          `- D2 Coverage: ${d2Coverage.toFixed(1)}%\n` +
          `- Alignment Score: ${alignmentScore.toFixed(1)}\n` +
          `- Average Polarity: ${avgPolarity.toFixed(2)}\n\n` +
          `📈 Breakdown:\n` +
          `- Unique to D1 (Gaps): ${uniqueToD1.length}\n` +
          `- Aligned (Shared): ${aligned.length}\n` +
          `- Unique to D2 (Orphans): ${uniqueToD2.length}\n\n` +
          `🔴 Critical Gaps:\n${uniqueToD1.slice(0, 5).map(g => `  • ${g.label}`).join("\n") || "  None"}\n\n` +
          `🟢 Best Alignments:\n${aligned.filter(a => a.polarity >= 0.7).slice(0, 5).map(a => `  • ${a.label} (${(a.polarity * 100).toFixed(0)}%)`).join("\n") || "  None"}`,
        p_iteration: 4,
        p_confidence: 0.95,
        p_evidence: null,
        p_target_agent: null,
      });

      // Log activity
      await supabase.rpc("insert_audit_activity_with_token", {
        p_session_id: sessionId,
        p_token: shareToken,
        p_agent_role: "venn_generator",
        p_activity_type: "venn_complete",
        p_title: `Audit Complete - Venn Analysis Generated`,
        p_content: `D1 Coverage: ${d1Coverage.toFixed(1)}%, D2 Coverage: ${d2Coverage.toFixed(1)}%, Alignment: ${alignmentScore.toFixed(1)}`,
        p_metadata: vennResult.summary,
      });

      await sendSSE("progress", { phase: "venn", message: "Venn analysis complete!", progress: 100 });
      await sendSSE("result", vennResult);
      await sendSSE("done", { success: true });

    } catch (error: unknown) {
      console.error("Venn generation error:", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      await sendSSE("error", { message: errMsg });
    } finally {
      await writer.close();
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
