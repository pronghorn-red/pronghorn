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
    const { key } = await req.json();
    const ADMIN_KEY = Deno.env.get("ADMIN_KEY");

    if (!ADMIN_KEY) {
      throw new Error("ADMIN_KEY not configured");
    }

    const valid = key === ADMIN_KEY;

    return new Response(JSON.stringify({ valid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in verify-admin:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage, valid: false }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
