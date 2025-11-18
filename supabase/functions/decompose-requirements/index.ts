import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Received request body:", JSON.stringify(body));
    
    const { text, projectId, shareToken } = body;
    
    if (!text || !projectId) {
      console.error("Missing parameters - text:", !!text, "projectId:", !!projectId);
      throw new Error("Missing required parameters: text and projectId");
    }

    // Validate projectId is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      console.error("Invalid projectId format:", projectId);
      throw new Error(`Invalid projectId format. Received: ${projectId}. Expected a valid UUID.`);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Create Supabase client to store the requirements
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Get auth header for authenticated users
    const authHeader = req.headers.get('Authorization');
    
    // Create client with anon key (respects RLS)
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    // Set share token if provided (for anonymous users)
    if (shareToken) {
      const { error: tokenError } = await supabase.rpc('set_share_token', { token: shareToken });
      if (tokenError) {
        console.error('Error setting share token:', tokenError);
        throw new Error('Invalid share token');
      }
    }

    console.log("Decomposing requirements for project:", projectId);
    console.log("Input text length:", text.length);

    // Call Lovable AI to decompose the requirements
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert requirements analyst. Your task is to take unstructured text and decompose it into a hierarchical structure of requirements following this pattern:

Epic → Feature → User Story → Acceptance Criteria

Rules:
1. Create logical Epics that group related functionality
2. Break Epics into Features (specific capabilities)
3. Break Features into User Stories (user-facing functionality)
4. Break Stories into Acceptance Criteria (testable conditions)
5. Use clear, concise titles
6. Each level should have 2-5 children (avoid single children)
7. Return ONLY valid JSON, no markdown or additional text

Return format:
{
  "epics": [
    {
      "title": "Epic title",
      "description": "Epic description",
      "features": [
        {
          "title": "Feature title",
          "description": "Feature description",
          "stories": [
            {
              "title": "As a [role], I want to [action] so that [benefit]",
              "description": "Story details",
              "acceptanceCriteria": [
                {
                  "title": "Given [context], when [action], then [outcome]",
                  "description": "Criteria details"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}`
          },
          {
            role: "user",
            content: `Decompose the following text into structured requirements:\n\n${text}`
          }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your Lovable workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    console.log("AI response received, parsing...");
    
    // Parse the JSON response
    let requirements;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
      const jsonText = jsonMatch ? jsonMatch[1] : content;
      requirements = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      throw new Error("Failed to parse requirements structure from AI response");
    }

    // Insert requirements into database
    console.log("Inserting requirements into database...");

    let orderIndex = 0;
    for (const epic of requirements.epics) {
      const { data: epicData, error: epicError } = await supabase
        .from("requirements")
        .insert({
          project_id: projectId,
          type: "EPIC",
          title: epic.title,
          content: epic.description,
          order_index: orderIndex++,
        })
        .select()
        .single();

      if (epicError) {
        console.error("Error inserting epic:", epicError);
        throw epicError;
      }

      let featureOrder = 0;
      for (const feature of epic.features || []) {
        const { data: featureData, error: featureError } = await supabase
          .from("requirements")
          .insert({
            project_id: projectId,
            parent_id: epicData.id,
            type: "FEATURE",
            title: feature.title,
            content: feature.description,
            order_index: featureOrder++,
          })
          .select()
          .single();

        if (featureError) {
          console.error("Error inserting feature:", featureError);
          throw featureError;
        }

        let storyOrder = 0;
        for (const story of feature.stories || []) {
          const { data: storyData, error: storyError } = await supabase
            .from("requirements")
            .insert({
              project_id: projectId,
              parent_id: featureData.id,
              type: "STORY",
              title: story.title,
              content: story.description,
              order_index: storyOrder++,
            })
            .select()
            .single();

          if (storyError) {
            console.error("Error inserting story:", storyError);
            throw storyError;
          }

          let criteriaOrder = 0;
          for (const criteria of story.acceptanceCriteria || []) {
            const { error: criteriaError } = await supabase
              .from("requirements")
              .insert({
                project_id: projectId,
                parent_id: storyData.id,
                type: "ACCEPTANCE_CRITERIA",
                title: criteria.title,
                content: criteria.description,
                order_index: criteriaOrder++,
              });

            if (criteriaError) {
              console.error("Error inserting criteria:", criteriaError);
              throw criteriaError;
            }
          }
        }
      }
    }

    console.log("Requirements decomposition complete");

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Requirements decomposed and saved successfully",
        epicCount: requirements.epics.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in decompose-requirements:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
