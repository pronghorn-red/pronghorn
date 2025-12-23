import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImageInput {
  base64: string;
  mimeType: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { images, prompt } = await req.json() as {
      images: ImageInput[];
      prompt: string;
    };

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const imageCount = images?.length || 0;
    console.log(`🎨 ${imageCount > 0 ? 'Enhancing' : 'Creating'} image with ${imageCount} source image(s) and prompt: "${prompt.substring(0, 100)}..."`);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    // Build content parts: text prompt + all images (if any)
    const parts: any[] = [{ text: prompt }];

    if (images && images.length > 0) {
      for (const image of images) {
        parts.push({
          inline_data: {
            mime_type: image.mimeType,
            data: image.base64,
          },
        });
      }
    }

    const requestBody = {
      contents: [{
        parts,
      }],
      generationConfig: {
        responseModalities: ["IMAGE"],
      },
    };

    console.log('🔄 Calling Gemini 3 Pro Image Preview API...');

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
      console.error('Gemini API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('✅ Image enhancement completed');

    const candidates = data.candidates;
    if (!candidates || candidates.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No image generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find the image part in the response
    const responseParts = candidates[0]?.content?.parts || [];
    let imageData = null;
    let mimeType = 'image/png';
    let textDescription = null;

    for (const part of responseParts) {
      const inlineData = part.inline_data || part.inlineData;
      if (inlineData && inlineData.data) {
        imageData = inlineData.data;
        mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';
      }
      if (part.text) {
        textDescription = part.text;
      }
    }

    if (!imageData) {
      return new Response(
        JSON.stringify({ error: 'No image data in response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const imageUrl = `data:${mimeType};base64,${imageData}`;

    return new Response(
      JSON.stringify({
        imageUrl,
        description: textDescription || 'Enhanced image',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Enhance Image Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
