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
    const { requirementId, useGemini = true, shareToken } = await req.json();
    
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

    // Set share token if provided (for anonymous users)
    if (shareToken) {
      const { error: tokenError } = await supabase.rpc('set_share_token', { token: shareToken });
      if (tokenError) {
        console.error('Error setting share token:', tokenError);
        throw new Error('Invalid share token');
      }
    }

    // Fetch the requirement and its context
    const { data: requirement, error: reqError } = await supabase
      .from('requirements')
      .select('*, project_id')
      .eq('id', requirementId)
      .single();

    if (reqError || !requirement) {
      throw new Error('Requirement not found');
    }

    // Fetch all project requirements for context
    const { data: allRequirements } = await supabase
      .from('requirements')
      .select('*')
      .eq('project_id', requirement.project_id)
      .order('created_at');

    // Fetch linked standards for context
    const { data: linkedStandards } = await supabase
      .from('requirement_standards')
      .select('standard_id, standards(code, title, description, content)')
      .eq('requirement_id', requirementId);

    // Build context for AI
    const standardsContext = linkedStandards?.map((ls: any) => {
      const std = ls.standards;
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

    // Determine child type based on parent type
    const childType = getChildType(requirement.type);

    // Insert new requirements
    const newRequirements = suggestions.map((s: any, index: number) => ({
      project_id: requirement.project_id,
      parent_id: requirementId,
      type: childType,
      title: s.title,
      content: s.content,
      order_index: index
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('requirements')
      .insert(newRequirements)
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      throw insertError;
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
