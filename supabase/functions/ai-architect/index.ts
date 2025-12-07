import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// X positions for node types based on flow hierarchy
const X_POSITIONS: Record<string, number> = {
  PROJECT: 100, REQUIREMENT: 100, STANDARD: 100, TECH_STACK: 100, SECURITY: 100,
  PAGE: 250,
  WEB_COMPONENT: 400, COMPONENT: 400,
  HOOK_COMPOSABLE: 550,
  API_SERVICE: 700, AGENT: 700, OTHER: 700, API: 700,
  API_ROUTER: 850, API_MIDDLEWARE: 850,
  API_CONTROLLER: 1000, API_UTIL: 1000, WEBHOOK: 1000,
  EXTERNAL_SERVICE: 1150, SERVICE: 1150, FIREWALL: 1150,
  DATABASE: 1300,
  SCHEMA: 1450,
  TABLE: 1600,
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
      attachedContext,
      projectId,
      shareToken
    } = body;

    // ========== PROJECT ACCESS VALIDATION ==========
    // Validate project access if projectId is provided
    if (projectId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const authHeader = req.headers.get('Authorization');
      
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: authHeader ? { Authorization: authHeader } : {} },
      });

      const { data: project, error: accessError } = await supabase.rpc('get_project_with_token', {
        p_project_id: projectId,
        p_token: shareToken || null
      });

      if (accessError || !project) {
        console.error('[ai-architect] Access denied:', accessError);
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.log('[ai-architect] Access validated for project:', projectId);
    }
    // ========== END VALIDATION ==========
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Generating architecture for:', description);

    const systemPrompt = `You are an expert software architect. Generate a comprehensive application architecture based on the user's description.

POSITIONING RULES:
- X-axis positions by node type (use these exact values):
  * PROJECT, REQUIREMENT, STANDARD, TECH_STACK, SECURITY: x=100
  * PAGE: x=250
  * WEB_COMPONENT: x=400
  * HOOK_COMPOSABLE: x=550
  * API_SERVICE, AGENT, OTHER: x=700
  * API_ROUTER, API_MIDDLEWARE: x=850
  * API_CONTROLLER, API_UTIL, WEBHOOK: x=1000
  * EXTERNAL_SERVICE, FIREWALL: x=1150
  * DATABASE: x=1300
  * SCHEMA: x=1450
  * TABLE: x=1600
- Y-axis (vertical): Layer by function, most public at top (y=50), most private at bottom (y=600+)
- Spacing: 150px vertically between nodes of the same type

NODE TYPES (use exact values):
- PROJECT: Root application node
- PAGE: User-facing pages/routes
- WEB_COMPONENT: Frontend UI components (React/Vue components)
- HOOK_COMPOSABLE: Frontend hooks or composables for API interaction
- API_SERVICE: API service entry point (label starts with /api/v1/)
- API_ROUTER: API routing layer
- API_MIDDLEWARE: Middleware handlers (auth, logging, etc.)
- API_CONTROLLER: Business logic controllers
- API_UTIL: Utility functions
- DATABASE: Database container
- SCHEMA: Database schema
- TABLE: Database tables
- EXTERNAL_SERVICE: Third-party services (LLM, payment, etc.)
- WEBHOOK: Webhook handlers
- FIREWALL: Security/firewall rules
- SECURITY: Security controls
- REQUIREMENT: Requirements
- STANDARD: Standards
- TECH_STACK: Tech stack
- AGENT: AI Agent components
- OTHER: Miscellaneous components

LEGACY TYPES (avoid using for new nodes): COMPONENT, API, SERVICE

FLOW HIERARCHY (all edges must flow left to right):
Level 1 (x=100): PROJECT, REQUIREMENT, STANDARD, TECH_STACK, SECURITY
Level 2 (x=250): PAGE
Level 3 (x=400): WEB_COMPONENT
Level 4 (x=550): HOOK_COMPOSABLE
Level 5 (x=700): API_SERVICE, AGENT, OTHER
Level 6 (x=850): API_ROUTER, API_MIDDLEWARE
Level 7 (x=1000): API_CONTROLLER, API_UTIL, WEBHOOK
Level 8 (x=1150): EXTERNAL_SERVICE, FIREWALL
Level 9 (x=1300): DATABASE
Level 10 (x=1450): SCHEMA
Level 11 (x=1600): TABLE

${drawEdges ? `EDGES: Define connections between nodes. All edges must flow LEFT to RIGHT (lower level to higher level).
Valid connections:
- PROJECT → PAGE, TECH_STACK, REQUIREMENT, STANDARD
- PAGE → WEB_COMPONENT
- WEB_COMPONENT → HOOK_COMPOSABLE
- HOOK_COMPOSABLE → API_SERVICE
- API_SERVICE → API_ROUTER
- API_ROUTER → API_MIDDLEWARE, API_CONTROLLER
- API_CONTROLLER → EXTERNAL_SERVICE, DATABASE
- DATABASE → SCHEMA
- SCHEMA → TABLE` : 'DO NOT return any edges in your response. The user has disabled edge generation.'}

Return ONLY valid JSON with this structure:
{
  "nodes": [
    {
      "label": "Node Name",
      "type": "PAGE|WEB_COMPONENT|HOOK_COMPOSABLE|API_SERVICE|API_ROUTER|API_MIDDLEWARE|API_CONTROLLER|API_UTIL|DATABASE|SCHEMA|TABLE|EXTERNAL_SERVICE|WEBHOOK|FIREWALL|SECURITY|PROJECT|REQUIREMENT|STANDARD|TECH_STACK|AGENT|OTHER",
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

    // Build enriched system prompt with attached context
    let enrichedSystemPrompt = systemPrompt;
    
    if (attachedContext) {
      const contextParts: string[] = [];

      if (attachedContext.projectMetadata) {
        contextParts.push("PROJECT METADATA: included");
      }
      if (attachedContext.artifacts?.length) {
        contextParts.push(`ARTIFACTS: ${attachedContext.artifacts.length} artifacts attached`);
      }
      if (attachedContext.chatSessions?.length) {
        contextParts.push(`CHAT SESSIONS: ${attachedContext.chatSessions.length} sessions attached`);
      }
      if (attachedContext.requirements?.length) {
        contextParts.push(`REQUIREMENTS: ${attachedContext.requirements.length} requirements attached`);
      }
      if (attachedContext.standards?.length) {
        contextParts.push(`STANDARDS: ${attachedContext.standards.length} standards attached`);
      }
      if (attachedContext.techStacks?.length) {
        contextParts.push(`TECH STACKS: ${attachedContext.techStacks.length} tech stacks attached`);
      }
      if (attachedContext.canvasNodes?.length) {
        contextParts.push(`CANVAS NODES: ${attachedContext.canvasNodes.length} nodes attached`);
      }
      if (attachedContext.canvasEdges?.length) {
        contextParts.push(`CANVAS EDGES: ${attachedContext.canvasEdges.length} edges attached`);
      }
      if (attachedContext.canvasLayers?.length) {
        contextParts.push(`CANVAS LAYERS: ${attachedContext.canvasLayers.length} layers attached`);
      }
      if (attachedContext.files?.length) {
        contextParts.push(`REPOSITORY FILES: ${attachedContext.files.length} files attached`);
      }

      if (contextParts.length > 0) {
        const jsonString = JSON.stringify(attachedContext, null, 2);
        const truncatedJson = jsonString.length > 50000
          ? jsonString.slice(0, 50000) + "\n...[truncated for length]"
          : jsonString;

        enrichedSystemPrompt = `${systemPrompt}\n\n===== ATTACHED PROJECT CONTEXT =====\n${contextParts.join("\n")}\n\n===== FULL CONTEXT DATA =====\n${truncatedJson}\n\nPlease use the above context to inform your architecture design. The context includes full object data with all properties and content.`;
      }
    }
    
    // Build context string for existing architecture
    let existingContextInfo = '';
    
    if (existingNodes && existingNodes.length > 0) {
      const nodesList = existingNodes.map((n: any) => 
        `${n.data.label} (${n.data.type}): ${n.data.description || 'No description'}`
      ).join('\n');
      existingContextInfo += `\n\nEXISTING NODES (${existingNodes.length}):\n${nodesList}\n\n⚠️ CRITICAL: DO NOT recreate any of the existing nodes listed above. ONLY generate NEW nodes that complement and augment the existing architecture. If a node with similar functionality already exists, DO NOT create a duplicate. Focus on filling gaps and adding missing components.`;
    }

    if (existingEdges && existingEdges.length > 0) {
      const edgesList = existingEdges.map((e: any) => 
        `${e.source} → ${e.target}${e.data?.label ? ` (${e.data.label})` : ''}`
      ).join('\n');
      existingContextInfo += `\n\nEXISTING CONNECTIONS (${existingEdges.length}):\n${edgesList}`;
    }

    const userPrompt = `Generate a complete application architecture for: ${description}${existingContextInfo}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: enrichedSystemPrompt },
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

    // Post-process nodes to ensure correct X positions
    if (architecture.nodes) {
      architecture.nodes = architecture.nodes.map((node: any) => ({
        ...node,
        x: X_POSITIONS[node.type] ?? node.x ?? 700,
      }));
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
