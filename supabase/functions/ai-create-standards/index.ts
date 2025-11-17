import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { input, categoryId } = await req.json();
    console.log('AI Create Standards - Category:', categoryId);

    if (!input || !categoryId) {
      throw new Error('Input text and category ID are required');
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get existing standards in this category to avoid duplicates
    const { data: existingStandards } = await supabase
      .from('standards')
      .select('code, title')
      .eq('category_id', categoryId);

    const existingCodes = existingStandards?.map(s => s.code) || [];
    const existingTitles = existingStandards?.map(s => s.title) || [];

    console.log('Calling Lovable AI for standards generation...');

    // Create comprehensive prompt for AI - limit input size if needed
    const maxInputLength = 15000; // Reduced to prevent provider timeouts
    const truncatedInput = input.length > maxInputLength 
      ? input.substring(0, maxInputLength) + "\n\n[Content truncated - processing first 15000 characters]"
      : input;

    const prompt = `You are a standards architect. Analyze the following content and create hierarchical standards.

INPUT CONTENT:
${truncatedInput}

INSTRUCTIONS:
1. Extract or create logical standards from this content
2. Organize hierarchically with parent standards and child standards (max 2 levels deep)
3. Create clear, concise descriptions for each standard
4. Assign appropriate standard codes (e.g., SEC-001, SEC-001.1, SEC-001.2)
5. Avoid duplicating these existing codes: ${existingCodes.join(', ')}
6. Avoid duplicating these existing titles: ${existingTitles.join(', ')}
7. Limit to maximum 8 top-level standards with up to 4 children each
8. Keep descriptions focused and under 300 characters

Generate a well-structured hierarchy of standards based on this content.`;

    // Call Lovable AI with tool calling for structured output
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a standards architect that creates comprehensive, hierarchical standards." },
          { role: "user", content: prompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_standards",
              description: "Generate a hierarchical structure of standards",
              parameters: {
                type: "object",
                properties: {
                  standards: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        code: { type: "string", description: "Unique standard code (e.g., SEC-001)" },
                        title: { type: "string", description: "Standard title (max 100 chars)" },
                        description: { type: "string", description: "Brief description (max 300 chars)" },
                        content: { type: "string", description: "Detailed content (max 1000 chars)" },
                        children: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              code: { type: "string" },
                              title: { type: "string" },
                              description: { type: "string" },
                              content: { type: "string" }
                            },
                            required: ["code", "title", "description", "content"]
                          }
                        }
                      },
                      required: ["code", "title", "description", "content"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["standards"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "create_standards" } },
        max_completion_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      if (aiResponse.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }
      if (aiResponse.status === 402) {
        throw new Error("Payment required. Please add credits to your Lovable AI workspace.");
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    
    console.log('AI Response received, parsing...');

    // Check for AI gateway errors
    if (aiData.error) {
      console.error('AI gateway returned error:', JSON.stringify(aiData.error));
      if (aiData.error.code === 502) {
        throw new Error('AI provider temporarily unavailable. Please try again with a smaller document or simpler request.');
      }
      throw new Error(`AI gateway error: ${aiData.error.message || 'Unknown error'}`);
    }

    // Extract structured output from tool call
    let standardsData;
    try {
      if (!aiData.choices || !aiData.choices[0]) {
        console.error('AI response missing choices:', JSON.stringify(aiData, null, 2).substring(0, 1000));
        throw new Error('Invalid AI response format');
      }

      const toolCall = aiData.choices[0].message.tool_calls?.[0];
      if (!toolCall || toolCall.function.name !== 'create_standards') {
        throw new Error('AI did not use the create_standards tool');
      }
      
      const functionArgs = JSON.parse(toolCall.function.arguments);
      standardsData = functionArgs.standards;
      
      if (!Array.isArray(standardsData)) {
        throw new Error('Standards output is not an array');
      }
      
      console.log(`Parsed ${standardsData.length} top-level standards`);
    } catch (parseError) {
      console.error('Tool call parse error:', parseError);
      console.error('AI response:', JSON.stringify(aiData, null, 2).substring(0, 1000));
      throw new Error('Failed to parse AI tool call response');
    }

    // Insert standards into database
    let createdCount = 0;

    const insertStandard = async (standard: any, parentId: string | null = null) => {
      const { data: insertedStandard, error: insertError } = await supabase
        .from('standards')
        .insert({
          category_id: categoryId,
          code: standard.code,
          title: standard.title,
          description: standard.description || null,
          content: standard.content || null,
          parent_id: parentId,
          order_index: createdCount
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error inserting standard:', insertError);
        return null;
      }

      createdCount++;
      console.log(`Created standard: ${standard.code} - ${standard.title}`);

      // Recursively insert children
      if (standard.children && Array.isArray(standard.children)) {
        for (const child of standard.children) {
          await insertStandard(child, insertedStandard.id);
        }
      }

      return insertedStandard;
    };

    // Insert all standards
    for (const standard of standardsData) {
      await insertStandard(standard);
    }

    console.log(`Successfully created ${createdCount} standards`);

    return new Response(
      JSON.stringify({
        success: true,
        createdCount,
        message: `Created ${createdCount} standards successfully`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in ai-create-standards function:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
