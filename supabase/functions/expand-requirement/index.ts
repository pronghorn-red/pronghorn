import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { requirementId, projectId, useGemini = true, shareToken: clientToken } = await req.json();
    
    if (!projectId) {
      throw new Error('Project ID is required');
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const grokKey = Deno.env.get('GROK_API_KEY');
    
    // Get auth header for authenticated users
    const authHeader = req.headers.get('Authorization');
    
    // Create client with anon key (respects RLS)
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    // Step 1: Get the project's share token (for authenticated users who don't have it in URL)
    let shareToken = clientToken;
    if (!shareToken && authHeader) {
      const { data: project } = await supabase
        .from('projects')
        .select('share_token')
        .eq('id', projectId)
        .single();
      
      if (project?.share_token) {
        shareToken = project.share_token;
      }
    }

    // Validate share token is present
    if (!shareToken) {
      throw new Error('Share token is required for requirement expansion');
    }

    // Step 2: Fetch all project requirements using token-based RPC
    const { data: allRequirements, error: reqError } = await supabase.rpc('get_requirements_with_token', {
      p_project_id: projectId,
      p_token: shareToken
    });

    if (reqError) {
      console.error('Error fetching requirements:', reqError);
      throw new Error('Failed to fetch requirements');
    }

    const requirement = allRequirements?.find((r: any) => r.id === requirementId);
    if (!requirement) {
      throw new Error('Requirement not found');
    }

    // Step 3: Fetch linked standards using token-based RPC
    const { data: linkedStandards, error: linkedError } = await supabase.rpc('get_requirement_standards_with_token', {
      p_requirement_id: requirementId,
      p_token: shareToken
    });

    if (linkedError) {
      console.error('Error fetching linked standards:', linkedError);
    }

    // Fetch full standard details for context
    const standardDetails = [];
    if (linkedStandards && linkedStandards.length > 0) {
      for (const ls of linkedStandards) {
        const { data: standard } = await supabase
          .from('standards')
          .select('code, title, description, content')
          .eq('id', ls.standard_id)
          .single();
        
        if (standard) {
          standardDetails.push(standard);
        }
      }
    }

    // Build context for AI
    const standardsContext = standardDetails.map((std: any) => {
      return `${std.code}: ${std.title}\n${std.description || ''}`;
    }).join('\n\n') || 'No standards linked yet.';

    const treeContext = buildTreeContext(allRequirements || [], requirement.id);

    const prompt = `You are a requirements engineering expert. Expand the following requirement into detailed sub-requirements.

REQUIREMENT TO EXPAND:
Code: ${requirement.code}
Type: ${requirement.type}
Title: ${requirement.title}
Content: ${requirement.content || 'No detailed content'}

PARENT CONTEXT:
${treeContext}

LINKED STANDARDS:
${standardsContext}

INSTRUCTIONS:
1. Generate 3-7 logical sub-requirements based on the requirement type:
   - If EPIC: generate FEATURE sub-requirements
   - If FEATURE: generate STORY (user story) sub-requirements
   - If STORY: generate ACCEPTANCE_CRITERIA sub-requirements
   - If ACCEPTANCE_CRITERIA: suggest refinements or edge cases

2. Consider the linked standards and ensure compliance in your suggestions
3. Make each sub-requirement specific, measurable, and actionable
4. Include both functional and non-functional aspects where relevant
5. Ensure traceability to parent requirement

Return your response as a JSON array of objects with this structure:
[
  {
    "title": "Sub-requirement title",
    "content": "Detailed description of the sub-requirement",
    "type": "FEATURE | STORY | ACCEPTANCE_CRITERIA"
  }
]

IMPORTANT: Return ONLY the JSON array, no additional text or explanation.`;

    let suggestions = [];

    if (useGemini && geminiKey) {
      // Use Gemini API
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048,
            }
          })
        }
      );

      const geminiData = await geminiResponse.json();
      const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Extract JSON from response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    } else if (grokKey) {
      // Use Grok API
      const grokResponse = await fetch(
        'https://api.x.ai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${grokKey}`
          },
          body: JSON.stringify({
            model: 'grok-2-latest',
            messages: [
              { role: 'system', content: 'You are a requirements engineering expert. Always respond with valid JSON only.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7
          })
        }
      );

      const grokData = await grokResponse.json();
      const responseText = grokData.choices?.[0]?.message?.content || '';
      
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    }

    // Step 4: Determine child type based on parent type
    const childType = getChildType(requirement.type);

    // Step 5: Insert new requirements via token-based RPC (loop, not bulk)
    const inserted = [];
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      const { data: newReq, error: insertError } = await supabase.rpc('insert_requirement_with_token', {
        p_project_id: projectId,
        p_token: shareToken,
        p_parent_id: requirementId,
        p_type: childType,
        p_title: s.title
      });

      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }

      // Update content separately since insert RPC may not support it
      if (s.content && newReq) {
        const { error: updateError } = await supabase.rpc('update_requirement_with_token', {
          p_id: newReq.id,
          p_token: shareToken,
          p_title: s.title,
          p_content: s.content
        });

        if (updateError) {
          console.error('Update error:', updateError);
        }
      }

      if (newReq) {
        inserted.push(newReq);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        requirements: inserted,
        count: inserted?.length || 0
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Expand requirement error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

function buildTreeContext(allReqs: any[], currentId: string): string {
  const current = allReqs.find(r => r.id === currentId);
  if (!current || !current.parent_id) return 'Root requirement';
  
  const parent = allReqs.find(r => r.id === current.parent_id);
  if (!parent) return 'No parent context';
  
  return `Parent: ${parent.code} - ${parent.title}\n${parent.content || ''}`;
}

function getChildType(parentType: string): string {
  switch (parentType) {
    case 'EPIC': return 'FEATURE';
    case 'FEATURE': return 'STORY';
    case 'STORY': return 'ACCEPTANCE_CRITERIA';
    case 'ACCEPTANCE_CRITERIA': return 'ACCEPTANCE_CRITERIA';
    default: return 'STORY';
  }
}
