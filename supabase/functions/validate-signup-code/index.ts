import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();
    const validCode = Deno.env.get("SIGNUP_CODE");

    if (!validCode) {
      // If no code is configured, allow all signups
      return new Response(JSON.stringify({ valid: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    const isValid = code && code.trim().toUpperCase() === validCode.trim().toUpperCase();

    if (!isValid) {
      return new Response(JSON.stringify({ valid: false, error: "Invalid signup code" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    return new Response(JSON.stringify({ valid: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
});
