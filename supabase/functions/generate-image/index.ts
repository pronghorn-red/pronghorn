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
    const { selectedContent } = await req.json();

    if (!selectedContent) {
      return new Response(
        JSON.stringify({ error: 'selectedContent is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('🎨 Generating infographic from selected content');

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    // Build the prompt from selected content
    const projectTitle = selectedContent.projectMetadata?.name || 'Untitled Project';
    const projectDescription = selectedContent.projectMetadata?.description || 'No description provided';
    
    const requirementsList = selectedContent.requirements && selectedContent.requirements.length > 0 
      ? selectedContent.requirements.map((r: any) => `- ${r.title}: ${r.content || 'No details'}`).join('\n')
      : 'No requirements selected';

    const nodesList = selectedContent.canvasNodes && selectedContent.canvasNodes.length > 0
      ? selectedContent.canvasNodes.map((n: any) => `- ${n.data?.label || 'Unlabeled'} (${n.type})`).join('\n')
      : 'No canvas nodes selected';

    const artifactsList = selectedContent.artifacts && selectedContent.artifacts.length > 0
      ? selectedContent.artifacts.map((a: any) => `- ${a.ai_title || 'Untitled'}: ${a.ai_summary || a.content?.substring(0, 100)}`).join('\n')
      : '';

    const standardsList = selectedContent.standards && selectedContent.standards.length > 0
      ? selectedContent.standards.map((s: any) => `- ${s.title}: ${s.description || ''}`).join('\n')
      : '';

    const techStacksList = selectedContent.techStacks && selectedContent.techStacks.length > 0
      ? selectedContent.techStacks.map((t: any) => `- ${t.name}: ${t.description || ''}`).join('\n')
      : '';

    let prompt = `Create a professional, visually appealing infographic for this software project.

**Project Title:** ${projectTitle}

**Project Description:**
${projectDescription}

**Key Requirements:**
${requirementsList}

**Architecture Components:**
${nodesList}`;

    if (artifactsList) {
      prompt += `\n\n**Artifacts:**\n${artifactsList}`;
    }

    if (standardsList) {
      prompt += `\n\n**Standards:**\n${standardsList}`;
    }

    if (techStacksList) {
      prompt += `\n\n**Tech Stacks:**\n${techStacksList}`;
    }

    prompt += `

Design an infographic that:
1. Uses the project title as the main heading
2. Visually represents the architecture components and their relationships
3. Highlights key requirements and selected content
4. Uses a modern, professional color scheme
5. Is clear, informative, and suitable for stakeholder presentations
6. Includes icons or visual elements that represent different component types (databases, APIs, services, etc.)
7. Incorporates any standards and tech stack information if provided`;

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
