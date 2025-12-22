import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Default OCR extraction prompt
const DEFAULT_EXTRACTION_PROMPT = `You are an expert document OCR and analysis system. Analyze this image and extract ALL content.

## Instructions:
1. Extract all visible text exactly as it appears, maintaining formatting in Markdown
2. For tables, use Markdown table syntax
3. For lists, use appropriate Markdown list formatting
4. For headings, use Markdown heading levels (# ## ###)

## Non-Text Elements:
For any non-text elements, provide detailed descriptions in this format:

[IMAGE: Description of photograph or illustration]
[CHART: Type of chart, title, key data points, axes labels]
[DIAGRAM: Type of diagram, components, relationships shown]
[GRAPH: Type of graph, what it represents, trends shown]
[MAP: Geographic area, features shown, legend items]
[FLOWCHART: Process name, steps, decision points]
[TABLE: If complex table that can't be represented in Markdown]

## Output:
Return the content in reading order (top-to-bottom, left-to-right for Western documents).
Preserve paragraph breaks and formatting as much as possible.`;

// Process single image with Gemini Vision API (direct REST call)
async function processImageWithGemini(
  apiKey: string,
  modelName: string,
  imageData: { mimeType: string; data: string },
  prompt: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: imageData.mimeType,
            data: imageData.data
          }
        }
      ]
    }],
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Gemini API error: ${response.status}`, errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const result = await response.json();
  
  if (result.candidates && result.candidates[0]?.content?.parts?.[0]?.text) {
    return result.candidates[0].content.parts[0].text;
  }
  
  throw new Error('No text content in response');
}

// Helper: Fetch image and convert to base64
async function fetchImageAsBase64(imageUrl: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(`Failed to fetch image: ${imageUrl}, status: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    
    return {
      mimeType: contentType,
      data: base64
    };
  } catch (error) {
    console.error(`Error fetching image ${imageUrl}:`, error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      // Mode 1: Process artifacts by ID (database mode)
      artifactIds, 
      projectId, 
      shareToken,
      // Mode 2: Process direct images (inline mode - no DB updates)
      images, // Array of { id, base64, mimeType, existingText? }
      // Common options
      model = 'gemini-2.5-flash',
      prompt, // Custom prompt (optional)
      mode = 'replace' // 'replace' or 'augment'
    } = await req.json();

    console.log('visual-recognition REQUEST:', { 
      artifactIds: artifactIds?.length,
      images: images?.length,
      projectId,
      model,
      mode,
      hasCustomPrompt: !!prompt
    });

    // Validate model - use correct Gemini model names
    const validModels = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    const selectedModel = validModels.includes(model) ? model : 'gemini-2.5-flash';

    // Get API key
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const effectivePrompt = prompt || DEFAULT_EXTRACTION_PROMPT;

    // Mode 2: Direct image processing (no DB, returns results directly)
    if (images && Array.isArray(images) && images.length > 0) {
      console.log(`Processing ${images.length} direct images with model ${selectedModel}`);

      // Set up streaming response
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Send initial status
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'start', 
              total: images.length 
            })}\n\n`));

            let processed = 0;
            const allResults: Array<{ id: string; success: boolean; content?: string; error?: string }> = [];

            // Process images in parallel (batches of 5)
            const BATCH_SIZE = 5;
            for (let i = 0; i < images.length; i += BATCH_SIZE) {
              const batch = images.slice(i, i + BATCH_SIZE);
              
              // Send progress
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'progress', 
                processed,
                total: images.length,
                currentBatch: batch.map((img: { id: string }) => img.id)
              })}\n\n`));

              const batchResults = await Promise.allSettled(
                batch.map(async (img: { id: string; base64: string; mimeType: string; existingText?: string }) => {
                  try {
                    const extractedText = await processImageWithGemini(
                      apiKey,
                      selectedModel,
                      { mimeType: img.mimeType, data: img.base64 },
                      effectivePrompt
                    );

                    // Apply mode (replace or augment)
                    let finalContent = extractedText;
                    if (mode === 'augment' && img.existingText) {
                      finalContent = `${img.existingText}\n\n---\n\n## Visual Recognition Extract:\n\n${extractedText}`;
                    }

                    return { id: img.id, success: true, content: finalContent };
                  } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    console.error(`Error processing image ${img.id}:`, error);
                    return { id: img.id, success: false, error: errorMessage };
                  }
                })
              );

              // Stream results back
              for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                  allResults.push(result.value);
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(result.value)}\n\n`));
                } else {
                  const errorResult = { id: 'unknown', success: false, error: String(result.reason) };
                  allResults.push(errorResult);
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorResult)}\n\n`));
                }
              }

              processed += batch.length;
            }

            // Send completion
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'complete', 
              processed: allResults.length,
              successful: allResults.filter(r => r?.success).length,
              failed: allResults.filter(r => r && !r.success).length
            })}\n\n`));
            
            controller.close();
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Stream processing error:', error);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'error', 
              error: errorMessage 
            })}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Mode 1: Artifact-based processing (original flow)
    if (!artifactIds || !Array.isArray(artifactIds) || artifactIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Either artifactIds or images array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: 'projectId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    // Validate access
    const { data: accessData, error: accessError } = await supabase.rpc('validate_project_access', {
      p_project_id: projectId,
      p_token: shareToken || null
    });

    if (accessError || !accessData) {
      console.error('Access validation failed:', accessError);
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch artifacts with images
    const { data: artifacts, error: artifactsError } = await supabase.rpc('get_artifacts_with_token', {
      p_project_id: projectId,
      p_token: shareToken || null
    });

    if (artifactsError) {
      console.error('Error fetching artifacts:', artifactsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch artifacts' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter to only requested artifacts with images
    const artifactsToProcess = artifacts
      .filter((a: { id: string; image_url: string | null; content?: string }) => artifactIds.includes(a.id) && a.image_url)
      .map((a: { id: string; image_url: string; content?: string }) => ({ id: a.id, image_url: a.image_url, content: a.content }));

    if (artifactsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid artifacts with images found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${artifactsToProcess.length} artifacts with model ${selectedModel}`);

    // Set up streaming response
    const encoder = new TextEncoder();
    const BATCH_SIZE = 5;
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial status
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'start', 
            total: artifactsToProcess.length 
          })}\n\n`));

          let processed = 0;
          const allResults: Array<{ id: string; success: boolean; content?: string; error?: string }> = [];

          // Process in batches
          for (let i = 0; i < artifactsToProcess.length; i += BATCH_SIZE) {
            const batch = artifactsToProcess.slice(i, i + BATCH_SIZE);
            
            // Send batch progress
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'progress', 
              processed,
              total: artifactsToProcess.length,
              currentBatch: batch.map((a: { id: string }) => a.id)
            })}\n\n`));

            const batchResults = await Promise.allSettled(
              batch.map(async (artifact: { id: string; image_url: string; content?: string }) => {
                try {
                  const imageData = await fetchImageAsBase64(artifact.image_url);
                  if (!imageData) {
                    throw new Error('Failed to fetch image');
                  }
                  
                  const extractedText = await processImageWithGemini(apiKey, selectedModel, imageData, effectivePrompt);
                  
                  // Apply mode
                  let finalContent = extractedText;
                  if (mode === 'augment' && artifact.content) {
                    finalContent = `${artifact.content}\n\n---\n\n## Visual Recognition Extract:\n\n${extractedText}`;
                  }
                  
                  return { id: artifact.id, success: true, content: finalContent };
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                  console.error(`Error processing artifact ${artifact.id}:`, error);
                  return { id: artifact.id, success: false, error: errorMessage };
                }
              })
            );

            // Stream results back
            for (const result of batchResults) {
              const value = result.status === 'fulfilled' ? result.value : { success: false, error: result.reason };
              allResults.push(value);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
            }

            processed += batch.length;
          }

          // Update artifacts in database with extracted content
          for (const result of allResults) {
            if (result && result.success && result.content) {
              const { error: updateError } = await supabase.rpc('update_artifact_with_token', {
                p_artifact_id: result.id,
                p_token: shareToken || null,
                p_content: result.content
              });
              
              if (updateError) {
                console.error(`Failed to update artifact ${result.id}:`, updateError);
              }
            }
          }

          // Send completion
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'complete', 
            processed: allResults.length,
            successful: allResults.filter(r => r?.success).length,
            failed: allResults.filter(r => r && !r.success).length
          })}\n\n`));
          
          controller.close();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('Stream processing error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            error: errorMessage 
          })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('visual-recognition Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
