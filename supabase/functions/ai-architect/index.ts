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
    const body = await req.json();
    const { 
      description, 
      existingNodes, 
      existingEdges, 
      drawEdges = true,
      standards,
      techStacks,
      requirements,
      projectDescription
    } = body;
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Generating architecture for:', description);

    const systemPrompt = `You are an expert software architect. Generate a comprehensive application architecture based on the user's description.

POSITIONING RULES:
- X-axis (horizontal): Frontend components (0-300), API Endpoints (400-700), Databases/External Services (800-1100)
- Y-axis (vertical): Layer by type, most public at top (y=50), most private at bottom (y=600+)
- Spacing: 200px between nodes horizontally, 150px vertically

NODE TYPES (use exact values):
- PROJECT: Root application node
- PAGE: User-facing pages/routes
- COMPONENT: UI components
- API: API endpoints
- DATABASE: Database tables/collections
- SERVICE: External services (auth, payment, etc.)
- WEBHOOK: Webhook handlers
- FIREWALL: Security/firewall rules
- SECURITY: Security controls
- REQUIREMENT: Requirements
- STANDARD: Standards
- TECH_STACK: Tech stack

VERTICAL LAYERING BY TYPE (top to bottom):
1. PROJECT (y=50)
2. PAGE (y=100-250, most public pages at top)
3. COMPONENT (y=300-450)
4. API (y=100-400)
5. DATABASE (y=150-350)
6. SERVICE (y=400-500)
7. WEBHOOK (y=450-550)
8. FIREWALL (y=50-150)
9. SECURITY (y=200-300)

${drawEdges ? `EDGES: Define connections between nodes. Include:
- source: source node label
- target: target node label
- relationship: brief description of connection` : 'DO NOT return any edges in your response. The user has disabled edge generation.'}

Return ONLY valid JSON with this structure:
{
  "nodes": [
    {
      "label": "Node Name",
      "type": "PAGE|COMPONENT|API|DATABASE|SERVICE|WEBHOOK|FIREWALL|SECURITY|PROJECT",
      "subtitle": "Brief subtitle",
      "description": "Detailed description",
      "x": 100,
      "y": 100
    }
  ]${drawEdges ? `,
  "edges": [
    {
      "source": "Source Node Label",
      "target": "Target Node Label",
      "relationship": "fetches data from"
    }
  ]` : ''}
}

Be comprehensive. Include all major components, pages, APIs, databases, and external services.
Use clear, descriptive names. Be specific about what each component does.`;

    // Build context string
    let contextInfo = '';
    
    if (existingNodes && existingNodes.length > 0) {
      const nodesList = existingNodes.map((n: any) => 
        `${n.data.label} (${n.data.type}): ${n.data.description || 'No description'}`
      ).join('\n');
      contextInfo += `\n\nEXISTING NODES (${existingNodes.length}):\n${nodesList}\n\n⚠️ CRITICAL: DO NOT recreate any of the existing nodes listed above. ONLY generate NEW nodes that complement and augment the existing architecture. If a node with similar functionality already exists, DO NOT create a duplicate. Focus on filling gaps and adding missing components.`;
    }

    if (existingEdges && existingEdges.length > 0) {
      const edgesList = existingEdges.map((e: any) => 
        `${e.source} → ${e.target}${e.data?.label ? ` (${e.data.label})` : ''}`
      ).join('\n');
      contextInfo += `\n\nEXISTING CONNECTIONS (${existingEdges.length}):\n${edgesList}`;
    }

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
      const requirementsList = requirements.map((r: any) => 
        `${r.code || ''}: ${r.title} (${r.type})${r.content ? ` - ${r.content}` : ''}`
      ).join('\n');
      contextInfo += `\n\nREQUIREMENTS:\n${requirementsList}`;
    }

    if (projectDescription) {
      contextInfo += `\n\nPROJECT DESCRIPTION:\n${projectDescription}`;
    }

    const userPrompt = `Generate a complete application architecture for: ${description}${contextInfo}`;

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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    console.log('AI response:', content);

    // Extract JSON from response (may be wrapped in markdown code blocks)
    let jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    let architecture;
    
    if (jsonMatch) {
      architecture = JSON.parse(jsonMatch[1]);
    } else {
      // Try to parse directly
      architecture = JSON.parse(content);
    }

    console.log('Parsed architecture:', architecture);

    return new Response(JSON.stringify(architecture), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-architect function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : undefined
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});