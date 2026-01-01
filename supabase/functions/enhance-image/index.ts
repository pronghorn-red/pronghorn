import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImageInput {
  base64: string;
  mimeType: string;
}

// Available Gemini image models
const AVAILABLE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { images, prompt, model } = await req.json() as {
      images: ImageInput[];
      prompt: string;
      model?: string;
    };

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use provided model or default to gemini-2.5-flash-image
    const selectedModel = model && AVAILABLE_MODELS.includes(model) 
      ? model 
      : 'gemini-2.5-flash-image';

    const imageCount = images?.length || 0;
    console.log(`🎨 ${imageCount > 0 ? 'Enhancing' : 'Creating'} image with ${imageCount} source image(s)`);
    console.log(`📝 Prompt: "${prompt.substring(0, 150)}..."`);
    console.log(`🤖 Model: ${selectedModel}`);

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
        responseModalities: ["TEXT", "IMAGE"],
      },
    };

    console.log('🔄 Calling Gemini API...');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`,
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
      console.error('❌ Gemini API error:', response.status, errorText);
      
      // Parse error for better messaging
      let errorMessage = `Gemini API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        // Use default error message
      }
      
      return new Response(
        JSON.stringify({ error: errorMessage, details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    // Log full response structure for debugging
    console.log('📦 Response structure:', JSON.stringify({
      candidatesCount: data.candidates?.length || 0,
      hasContent: !!data.candidates?.[0]?.content,
      partsCount: data.candidates?.[0]?.content?.parts?.length || 0,
      partTypes: data.candidates?.[0]?.content?.parts?.map((p: any) => 
        p.text ? 'text' : p.inline_data ? 'image' : p.inlineData ? 'image' : 'unknown'
      ),
      finishReason: data.candidates?.[0]?.finishReason,
      promptFeedback: data.promptFeedback,
    }, null, 2));

    const candidates = data.candidates;
    if (!candidates || candidates.length === 0) {
      console.error('❌ No candidates in response');
      console.error('📦 Full response:', JSON.stringify(data, null, 2));
      
      // Check for safety/blocking issues
      const blockReason = data.promptFeedback?.blockReason;
      const safetyRatings = data.promptFeedback?.safetyRatings;
      
      if (blockReason) {
        return new Response(
          JSON.stringify({ 
            error: `Request blocked: ${blockReason}`,
            safetyRatings,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'No response generated - model may have rejected the request' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check finish reason for issues
    const finishReason = candidates[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      console.warn(`⚠️ Finish reason: ${finishReason}`);
    }

    // Find the image part in the response
    const responseParts = candidates[0]?.content?.parts || [];
    let imageData = null;
    let mimeType = 'image/png';
    let textDescription = null;

    console.log(`🔍 Processing ${responseParts.length} response parts...`);

    for (const part of responseParts) {
      const inlineData = part.inline_data || part.inlineData;
      if (inlineData && inlineData.data) {
        imageData = inlineData.data;
        mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';
        console.log(`✅ Found image data, mimeType: ${mimeType}, dataLength: ${imageData.length}`);
      }
      if (part.text) {
        textDescription = part.text;
        console.log(`📝 Found text: "${part.text.substring(0, 100)}..."`);
      }
    }

    if (!imageData) {
      console.error('❌ No image data in response parts');
      console.error('📦 Response parts:', JSON.stringify(responseParts, null, 2));
      
      // Return more helpful error with text response if available
      const errorDetails = {
        error: 'No image data in response',
        textResponse: textDescription,
        finishReason,
        partsCount: responseParts.length,
        hint: textDescription 
          ? 'The model returned text instead of an image. Try a different prompt or model.'
          : 'The model did not generate an image. Try simplifying your prompt or using a different model.',
      };
      
      return new Response(
        JSON.stringify(errorDetails),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const imageUrl = `data:${mimeType};base64,${imageData}`;
    console.log('✅ Image enhancement completed successfully');

    return new Response(
      JSON.stringify({
        imageUrl,
        description: textDescription || 'Enhanced image',
        model: selectedModel,
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
