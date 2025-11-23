import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { artifactId, shareToken } = await req.json();

    if (!artifactId || !shareToken) {
      throw new Error("Artifact ID and share token are required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get artifact via RPC
    const { data: artifacts, error: fetchError } = await supabase.rpc("get_artifacts_with_token", {
      p_project_id: artifactId, // Will filter by artifact
      p_token: shareToken,
    });

    if (fetchError) throw fetchError;

    const artifact = artifacts?.find((a: any) => a.id === artifactId);
    if (!artifact) throw new Error("Artifact not found");

    // Generate summary using Gemini
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Analyze the following text artifact and provide:\n1. A concise title (max 10 words)\n2. A brief summary (max 50 words)\n\nArtifact content:\n${artifact.content}\n\nRespond in JSON format: {"title": "...", "summary": "..."}`
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 200,
          }
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${error}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { title: "Untitled", summary: "" };

    // Update artifact via RPC
    const { error: updateError } = await supabase.rpc("update_artifact_with_token", {
      p_id: artifactId,
      p_token: shareToken,
      p_ai_title: result.title,
      p_ai_summary: result.summary,
    });

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ title: result.title, summary: result.summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
