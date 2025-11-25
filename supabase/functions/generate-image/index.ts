import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { projectId, shareToken } = await req.json();

    if (!projectId || !shareToken) {
      return new Response(
        JSON.stringify({ error: 'projectId and shareToken are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('🎨 Generating infographic for project:', projectId);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY is not configured');
    }

    // Create Supabase client with anon key (respects RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Fetch project details
    const { data: project, error: projectError } = await supabase.rpc('get_project_with_token', {
      p_project_id: projectId,
      p_token: shareToken
    });

    if (projectError) {
      console.error('Error fetching project:', projectError);
      throw new Error('Failed to fetch project details');
    }

    // Fetch requirements
    const { data: requirements, error: reqError } = await supabase.rpc('get_requirements_with_token', {
      p_project_id: projectId,
      p_token: shareToken
    });

    if (reqError) {
      console.error('Error fetching requirements:', reqError);
      throw new Error('Failed to fetch requirements');
    }

    // Fetch canvas nodes
    const { data: canvasNodes, error: nodesError } = await supabase.rpc('get_canvas_nodes_with_token', {
      p_project_id: projectId,
      p_token: shareToken
    });

    if (nodesError) {
      console.error('Error fetching canvas nodes:', nodesError);
      throw new Error('Failed to fetch canvas nodes');
    }

    // Build the prompt
    const projectTitle = project.name || 'Untitled Project';
    const projectDescription = project.description || 'No description provided';
    
    const requirementsList = requirements && requirements.length > 0 
      ? requirements.map((r: any) => `- ${r.title}: ${r.content || 'No details'}`).join('\n')
      : 'No requirements defined';

    const nodesList = canvasNodes && canvasNodes.length > 0
      ? canvasNodes.map((n: any) => `- ${n.data?.label || 'Unlabeled'} (${n.type})`).join('\n')
      : 'No canvas nodes defined';

    const prompt = `Create a professional, visually appealing infographic for this software project.

**Project Title:** ${projectTitle}

**Project Description:**
${projectDescription}

**Key Requirements:**
${requirementsList}

**Architecture Components:**
${nodesList}

Design an infographic that:
1. Uses the project title as the main heading
2. Visually represents the architecture components and their relationships
3. Highlights key requirements
4. Uses a modern, professional color scheme
5. Is clear, informative, and suitable for stakeholder presentations
6. Includes icons or visual elements that represent different component types (databases, APIs, services, etc.)`;

    console.log('🎨 Generating infographic with Gemini 3 Pro Image Preview...');

    // Prepare request body for Gemini image generation
    const requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        responseModalities: ["IMAGE"]
      }
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini Imagen API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Failed to generate infographic: ${response.status}` }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const data = await response.json();
    console.log('✅ Infographic generated successfully');

    const candidates = data.candidates;
    if (!candidates || candidates.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No image generated' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Find the image part in the response
    const parts = candidates[0]?.content?.parts || [];
    let imageData = null;
    let mimeType = 'image/png';

    for (const part of parts) {
      const inlineData = part.inline_data || part.inlineData;
      if (inlineData && inlineData.data) {
        imageData = inlineData.data;
        mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';
        break;
      }
    }

    if (!imageData) {
      return new Response(
        JSON.stringify({ error: 'No image data in response' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const imageUrl = `data:${mimeType};base64,${imageData}`;

    return new Response(
      JSON.stringify({ 
        imageUrl,
        description: `Infographic for ${projectTitle}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Generate Infographic Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
