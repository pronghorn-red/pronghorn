import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EnhancedSortRequest {
  sessionId: string;
  projectId: string;
  shareToken: string;
  element: {
    id: string;
    label: string;
    content: string;
    dataset: "D1" | "D2";
  };
  currentConcepts: string[];
  availableConcepts: Array<{ id: string; label: string; description: string }>;
  allowedActions: {
    move: boolean;
    clone: boolean;
    create: boolean;
  };
}

interface SortAction {
  action: "no_action" | "move" | "clone" | "create";
  targetConcept?: string;
  newConcept?: { label: string; description: string };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { element, currentConcepts, availableConcepts, allowedActions } = await req.json() as EnhancedSortRequest;

    // Build allowed actions list for prompt
    const actions: string[] = ["no_action"];
    if (allowedActions.move) actions.push("move");
    if (allowedActions.clone) actions.push("clone");
    if (allowedActions.create) actions.push("create");

    // Build concept list text (compact)
    const conceptListText = availableConcepts
      .map((c, i) => `${i + 1}. "${c.label}"${c.description ? ` - ${c.description.slice(0, 60)}` : ""}`)
      .join("\n");

    // Truncate content to keep prompt small
    const contentPreview = element.content.slice(0, 600) + (element.content.length > 600 ? "..." : "");

    const prompt = `Review element categorization. Be BRIEF (<100 chars).

ELEMENT (${element.dataset}):
"${element.label}"
${contentPreview}

CURRENT: ${currentConcepts.length > 0 ? currentConcepts.join(", ") : "None"}

CATEGORIES:
${conceptListText}

ACTIONS: ${actions.join(", ")}

Is this well-placed? JSON only:
{"action":"no_action"} - well placed
{"action":"move","target":"Name"} - move to different
{"action":"clone","target":"Name"} - add to additional
{"action":"create","label":"Name","desc":"Brief"}`;

    // Use Gemini Flash for speed and cost efficiency
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      console.error("[enhanced-sort] Missing GEMINI_API_KEY");
      return new Response(JSON.stringify({ action: "no_action", error: "Missing API key" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { 
            maxOutputTokens: 100, 
            temperature: 0.1 
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[enhanced-sort] Gemini error: ${response.status}`, errorText);
      return new Response(JSON.stringify({ action: "no_action", error: `Gemini ${response.status}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '{"action":"no_action"}';
    
    // Parse JSON from response (handle markdown code blocks)
    let cleanText = text.trim();
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.slice(7);
    } else if (cleanText.startsWith("```")) {
      cleanText = cleanText.slice(3);
    }
    if (cleanText.endsWith("```")) {
      cleanText = cleanText.slice(0, -3);
    }
    
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    let parsed: SortAction = { action: "no_action" };
    
    if (jsonMatch) {
      try {
        const raw = JSON.parse(jsonMatch[0]);
        
        // Validate action
        const validActions = ["no_action", "move", "clone", "create"];
        if (validActions.includes(raw.action)) {
          parsed.action = raw.action;
          
          // Validate action is allowed
          if (parsed.action === "move" && !allowedActions.move) parsed.action = "no_action";
          if (parsed.action === "clone" && !allowedActions.clone) parsed.action = "no_action";
          if (parsed.action === "create" && !allowedActions.create) parsed.action = "no_action";
          
          // Extract target for move/clone
          if ((parsed.action === "move" || parsed.action === "clone") && raw.target) {
            parsed.targetConcept = raw.target;
          }
          
          // Extract new concept for create
          if (parsed.action === "create" && raw.label) {
            parsed.newConcept = {
              label: raw.label,
              description: raw.desc || raw.description || "",
            };
          }
        }
      } catch (e) {
        console.warn(`[enhanced-sort] JSON parse failed for "${element.label.slice(0, 30)}":`, e);
      }
    }

    console.log(`[enhanced-sort] ${element.label.slice(0, 30)} → ${parsed.action}${parsed.targetConcept ? ` (${parsed.targetConcept})` : ""}${parsed.newConcept ? ` (new: ${parsed.newConcept.label})` : ""}`);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[enhanced-sort] Error:", error);
    return new Response(JSON.stringify({ action: "no_action", error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 200, // Return no_action on error, don't break pipeline
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

