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
    const { standardId, useGemini = true } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const grokKey = Deno.env.get('GROK_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the standard and its context
    const { data: standard, error: stdError } = await supabase
      .from('standards')
      .select('*, category_id')
      .eq('id', standardId)
      .single();

    if (stdError || !standard) {
      throw new Error('Standard not found');
    }

    // Fetch all standards in the same category for context
    const { data: allStandards } = await supabase
      .from('standards')
      .select('*')
      .eq('category_id', standard.category_id)
      .order('created_at');

    // Build context for AI
    const treeContext = buildTreeContext(allStandards || [], standard.id);

    const prompt = `You are a standards development expert. Expand the following standard into detailed sub-standards.

STANDARD TO EXPAND:
Code: ${standard.code}
Title: ${standard.title}
Description: ${standard.description || 'No description'}
Content: ${standard.content || 'No detailed content'}

PARENT CONTEXT:
${treeContext}

INSTRUCTIONS:
1. Generate 3-7 logical sub-standards that break down this standard into more specific, actionable requirements
2. Each sub-standard should be:
   - Specific and measurable
   - Implementable and testable
   - Aligned with the parent standard's intent
3. Consider both functional and non-functional aspects where relevant
4. Ensure clear traceability to parent standard

Return your response as a JSON array of objects with this structure:
[
  {
    "title": "Sub-standard title",
    "description": "Brief description of the sub-standard",
    "content": "Detailed description and requirements"
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
      
      if (!geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid Gemini response');
      }

      const textResponse = geminiData.candidates[0].content.parts[0].text;
      const jsonMatch = textResponse.match(/\[[\s\S]*\]/);
      
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from Gemini response');
      }

      suggestions = JSON.parse(jsonMatch[0]);
    } else if (grokKey) {
      // Use Grok API
      const grokResponse = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${grokKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'grok-beta',
          messages: [
            { role: 'system', content: 'You are a standards development expert. Return only valid JSON arrays.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
        }),
      });

      const grokData = await grokResponse.json();
      
      if (!grokData.choices?.[0]?.message?.content) {
        throw new Error('Invalid Grok response');
      }

      const textResponse = grokData.choices[0].message.content;
      const jsonMatch = textResponse.match(/\[[\s\S]*\]/);
      
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from Grok response');
      }

      suggestions = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No AI API key configured');
    }

    // Generate sub-standards
    const newStandards = suggestions.map((suggestion: any, index: number) => ({
      category_id: standard.category_id,
      parent_id: standardId,
      title: suggestion.title,
      description: suggestion.description || null,
      content: suggestion.content || null,
      code: `${standard.code}-${String(index + 1).padStart(3, '0')}`,
      order_index: index,
    }));

    // Insert the new standards
    const { data: insertedStandards, error: insertError } = await supabase
      .from('standards')
      .insert(newStandards)
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      throw insertError;
    }

    return new Response(
      JSON.stringify({ standards: insertedStandards }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Expand standard error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

function buildTreeContext(allStandards: any[], currentId: string): string {
  const current = allStandards.find((s: any) => s.id === currentId);
  if (!current) return 'No context available';

  let context = `Current Standard: ${current.code} - ${current.title}\n`;

  if (current.parent_id) {
    const parent = allStandards.find((s: any) => s.id === current.parent_id);
    if (parent) {
      context += `Parent: ${parent.code} - ${parent.title}\n`;
    }
  }

  const siblings = allStandards.filter((s: any) => s.parent_id === current.parent_id && s.id !== currentId);
  if (siblings.length > 0) {
    context += `\nSiblings:\n${siblings.map((s: any) => `  - ${s.code}: ${s.title}`).join('\n')}`;
  }

  const children = allStandards.filter((s: any) => s.parent_id === currentId);
  if (children.length > 0) {
    context += `\n\nExisting Children:\n${children.map((s: any) => `  - ${s.code}: ${s.title}`).join('\n')}`;
  }

  return context;
}
