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
    const { selectedContent, generationType = 'infographic', style = 'modern' } = await req.json();

    if (!selectedContent) {
      return new Response(
        JSON.stringify({ error: 'selectedContent is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`🎨 Generating ${generationType} with ${style} style from selected content`);

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

    // Build style-specific prompt instructions
    let styleInstructions = '';
    let prompt = '';
    
    if (generationType === 'infographic') {
      const styleMap: Record<string, string> = {
        modern: 'Use a modern, professional design with clean lines, vibrant gradients, and contemporary iconography. Emphasize hierarchy and visual balance.',
        minimalist: 'Use a minimalist design with ample white space, simple geometric shapes, limited color palette (2-3 colors), and clean typography. Focus on essential elements only.',
        whiteboard: 'Create a whiteboard-style illustration with hand-drawn elements, sketchy lines, simple stick figures or icons, and a casual, brainstorming aesthetic.',
        flowchart: 'Design a structured flowchart-style diagram with clear boxes, arrows, decision diamonds, and process flow indicators. Use standard flowchart symbols and connectors.',
        cartoon: 'Use a playful cartoon style with rounded shapes, bright cheerful colors, friendly character illustrations, and a fun, approachable aesthetic.',
        photographic: 'Create a photorealistic composite with realistic textures, lighting, shadows, and 3D-rendered elements that look like physical objects or real environments.'
      };
      styleInstructions = styleMap[style] || styleMap.modern;

      prompt = `Create a professional ${style} infographic for this software project.

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
2. ${styleInstructions}
3. Visually represents the architecture components and their relationships
4. Highlights key requirements and selected content
5. Is clear, informative, and suitable for stakeholder presentations
6. Includes icons or visual elements that represent different component types (databases, APIs, services, etc.)
7. Incorporates any standards and tech stack information if provided`;

    } else if (generationType === 'web-mockup') {
      const styleMap: Record<string, string> = {
        material: 'Use Google Material Design principles with elevation shadows, floating action buttons, bold colors, and card-based layouts.',
        ios: 'Follow Apple iOS design guidelines with subtle shadows, rounded corners, system fonts, and clean navigation patterns.',
        flat: 'Use flat design with no shadows or gradients, bold solid colors, simple geometric shapes, and clear typography.',
        neumorphic: 'Apply neumorphic (soft UI) design with subtle shadows creating extruded or pressed effects, monochromatic palette, and soft 3D appearances.',
        glassmorphic: 'Create glassmorphism effects with frosted glass aesthetics, blur effects, translucent layers, and vibrant backgrounds.',
        corporate: 'Use professional corporate styling with conservative colors (blues, grays), formal typography, structured layouts, and business-appropriate imagery.'
      };
      styleInstructions = styleMap[style] || styleMap.material;

      prompt = `Create a professional desktop web application mockup in ${style} style for this software project.

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

Design a desktop web mockup that:
1. Shows a realistic browser window with the application interface
2. ${styleInstructions}
3. Displays key features and components based on requirements
4. Includes realistic UI elements: navigation bar, sidebar, main content area, buttons, forms
5. Represents the architecture components visually in the interface
6. Uses appropriate iconography and visual hierarchy
7. Looks like a production-ready web application
8. Maintains consistency with modern web design standards`;

    } else if (generationType === 'mobile-mockup') {
      const styleMap: Record<string, string> = {
        material: 'Use Google Material Design for mobile with bottom navigation, FABs, and card-based content.',
        ios: 'Follow iOS mobile design with tab bar, navigation bar, and iOS-specific UI patterns and gestures.',
        flat: 'Use flat mobile design with simple tap targets, clear icons, and minimal visual effects.',
        neumorphic: 'Apply neumorphic mobile design with soft shadows and subtle 3D button effects.',
        glassmorphic: 'Create mobile glassmorphism with frosted panels, translucent navigation, and blur effects.',
        corporate: 'Use professional mobile styling appropriate for enterprise or business applications.'
      };
      styleInstructions = styleMap[style] || styleMap.material;

      prompt = `Create a professional mobile application mockup in ${style} style for this software project.

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

Design a mobile app mockup that:
1. Shows a realistic smartphone frame with the application interface
2. ${styleInstructions}
3. Displays key features based on requirements in a mobile-optimized layout
4. Includes mobile UI elements: status bar, navigation, buttons, cards, lists
5. Represents the architecture components in a mobile context
6. Uses touch-friendly tap targets and mobile interaction patterns
7. Looks like a production-ready mobile application
8. Follows mobile design best practices (thumb-friendly zones, clear hierarchy)`;
    }

    console.log('🎨 Generating with Gemini 3 Pro Image Preview...');

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
