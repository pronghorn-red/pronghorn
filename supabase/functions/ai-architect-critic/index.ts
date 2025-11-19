import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      nodes, 
      edges,
      standards,
      techStacks,
      requirements,
      projectDescription
    } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Analyzing architecture:', { nodeCount: nodes?.length, edgeCount: edges?.length });

    const systemPrompt = `You are an expert software architect and systems analyst. Analyze the provided application architecture and provide detailed, constructive feedback.

Focus your analysis on:
1. **Architectural Patterns**: Identify the overall pattern (microservices, monolithic, layered, etc.) and assess its appropriateness
2. **Component Organization**: Evaluate how components, APIs, and services are structured and connected
3. **Separation of Concerns**: Check if responsibilities are properly divided between components
4. **Data Flow**: Analyze how data moves through the system and identify potential bottlenecks
5. **Security**: Identify potential security concerns or missing security layers
6. **Scalability**: Assess how well the architecture would scale
7. **Missing Components**: Identify critical components that might be missing (auth, logging, monitoring, etc.)
8. **Redundancy**: Spot any duplicate or redundant components
9. **Best Practices**: Compare against industry best practices for the technology stack

Provide specific, actionable recommendations for improvement. Be constructive and prioritize the most impactful changes.`;

    const nodesSummary = nodes.map((n: any) => 
      `${n.data.label} (${n.data.type}): ${n.data.description || 'No description'}`
    ).join('\n');

    const edgesSummary = edges.map((e: any) => 
      `${e.source} → ${e.target}${e.data?.label ? ` (${e.data.label})` : ''}`
    ).join('\n');

    // Build context string
    let contextInfo = '';
    
    if (standards && standards.length > 0) {
      const standardsList = standards.map((s: any) => 
        `${s.code}: ${s.title} - ${s.description || ''}`
      ).join('\n');
      contextInfo += `\n\nPROJECT STANDARDS:\n${standardsList}`;
    }

    if (techStacks && techStacks.length > 0) {
      const techStacksList = techStacks.map((ts: any) => 
        `${ts.name}: ${ts.description || ''}`
      ).join('\n');
      contextInfo += `\n\nTECH STACKS:\n${techStacksList}`;
    }

    if (requirements && requirements.length > 0) {
      const reqsList = requirements.map((r: any) => 
        `${r.code}: ${r.title} (${r.type}) - ${r.content || ''}`
      ).join('\n');
      contextInfo += `\n\nREQUIREMENTS:\n${reqsList}`;
    }

    if (projectDescription) {
      contextInfo += `\n\nPROJECT DESCRIPTION:\n${projectDescription}`;
    }

    const userPrompt = `Analyze this application architecture:

NODES (${nodes.length}):
${nodesSummary}

CONNECTIONS (${edges.length}):
${edgesSummary}
${contextInfo}

Provide a comprehensive critique with specific recommendations for improvement.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    // Return the streaming response directly
    return new Response(response.body, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error in ai-architect-critic function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : undefined
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
