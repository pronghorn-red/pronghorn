import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RENDER_API_KEY = Deno.env.get("RENDER_API_KEY");
    const RENDER_ID = Deno.env.get("RENDER_ID");

    if (!RENDER_API_KEY) {
      return new Response(JSON.stringify({ error: "RENDER_API_KEY not set" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Query Render /v1/owners to find valid owner IDs for this API key
    const response = await fetch("https://api.render.com/v1/owners?limit=20", {
      method: "GET",
      headers: { "Authorization": `Bearer ${RENDER_API_KEY}` },
    });

    const body = await response.text();

    return new Response(JSON.stringify({
      renderApiStatus: response.status,
      currentRenderId: RENDER_ID ? `${RENDER_ID.substring(0, 8)}...` : "NOT SET",
      renderIdLength: RENDER_ID?.length || 0,
      owners: response.ok ? JSON.parse(body) : body,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});