import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CanvasNodeType {
  id: string;
  system_name: string;
  display_label: string;
  description: string;
  category: string;
  icon: string;
  color_class: string;
  order_score: number;
  is_active: boolean;
  is_legacy: boolean;
}

// Dynamic helper functions
function buildXPositions(nodeTypes: CanvasNodeType[]): Record<string, number> {
  const result: Record<string, number> = {};
  nodeTypes.forEach(nt => {
    result[nt.system_name] = nt.order_score + Math.floor(nt.order_score * 0.5);
  });
  return result;
}

function buildNodeTypePrompt(nodeTypes: CanvasNodeType[]): string {
  const activeTypes = nodeTypes.filter(nt => nt.is_active && !nt.is_legacy);
  const legacyTypes = nodeTypes.filter(nt => nt.is_legacy);
  
  let prompt = 'NODE TYPES (use exact values):\n';
  activeTypes.forEach(nt => {
    prompt += `- ${nt.system_name}: ${nt.description || nt.display_label}\n`;
  });
  
  if (legacyTypes.length > 0) {
    prompt += `\nLEGACY TYPES (avoid using for new nodes): ${legacyTypes.map(lt => lt.system_name).join(', ')}\n`;
  }
  
  return prompt;
}

function buildPositioningPrompt(nodeTypes: CanvasNodeType[]): string {
  const groups = new Map<number, { types: string[], xPos: number }>();
  
  nodeTypes.filter(nt => nt.is_active).forEach(nt => {
    const rank = Math.floor(nt.order_score / 100);
    const xPos = nt.order_score + Math.floor(nt.order_score * 0.5);
    if (!groups.has(rank)) groups.set(rank, { types: [], xPos });
    groups.get(rank)!.types.push(nt.system_name);
    groups.get(rank)!.xPos = xPos; // Use last one in group
  });
  
  let prompt = 'POSITIONING RULES:\n';
  prompt += '- X-axis positions by node type:\n';
  
  Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .forEach(([rank, data]) => {
      prompt += `  * ${data.types.join(', ')}: x=${data.xPos}\n`;
    });
  
  prompt += '- Y-axis (vertical): Layer by function, most public at top (y=50), most private at bottom (y=600+)\n';
  prompt += '- Spacing: 150px vertically between nodes of the same type\n';
  
  return prompt;
}

function buildFlowHierarchyPrompt(nodeTypes: CanvasNodeType[]): string {
  const groups = new Map<number, string[]>();
  nodeTypes.filter(nt => nt.is_active && !nt.is_legacy).forEach(nt => {
    const rank = Math.floor(nt.order_score / 100);
    if (!groups.has(rank)) groups.set(rank, []);
    groups.get(rank)!.push(nt.system_name);
  });
  
  let prompt = 'FLOW HIERARCHY (all edges must flow left to right):\n';
  Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .forEach(([rank, types]) => {
      const xPos = rank * 100 + Math.floor(rank * 50);
      prompt += `Level ${rank} (x=${xPos}): ${types.join(', ')}\n`;
    });
  
  return prompt;
}

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    // ========== PROJECT ACCESS VALIDATION ==========
    if (projectId) {
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

    // Fetch node types from database for dynamic configuration
    const { data: nodeTypesData, error: nodeTypesError } = await supabase.rpc('get_canvas_node_types', {
      p_include_legacy: true
    });

    if (nodeTypesError) {
      console.error('[ai-architect] Failed to fetch node types:', nodeTypesError);
      throw new Error('Failed to fetch node types configuration');
    }

    const nodeTypes: CanvasNodeType[] = nodeTypesData || [];
    console.log(`[ai-architect] Loaded ${nodeTypes.length} node types from database`);

    // Build dynamic X_POSITIONS from database
    const X_POSITIONS = buildXPositions(nodeTypes);
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Generating architecture for:', description);

    // Build dynamic prompts from database
    const positioningPrompt = buildPositioningPrompt(nodeTypes);
    const nodeTypePrompt = buildNodeTypePrompt(nodeTypes);
    const flowHierarchyPrompt = buildFlowHierarchyPrompt(nodeTypes);

    const systemPrompt = `You are an expert software architect. Generate a comprehensive application architecture based on the user's description.

${positioningPrompt}

${nodeTypePrompt}

${flowHierarchyPrompt}

${drawEdges ? `EDGES: Define connections between nodes. All edges must flow LEFT to RIGHT (lower level to higher level).
Valid connection patterns:
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
      "type": "${nodeTypes.filter(nt => nt.is_active && !nt.is_legacy).map(nt => nt.system_name).join('|')}",
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
      if (attachedContext.databases?.length) {
        const dbTypes = attachedContext.databases.reduce((acc: Record<string, number>, d: any) => {
          acc[d.type] = (acc[d.type] || 0) + 1;
          return acc;
        }, {});
        const dbSummary = Object.entries(dbTypes).map(([t, c]) => `${c} ${t}s`).join(', ');
        contextParts.push(`DATABASE SCHEMAS: ${attachedContext.databases.length} items (${dbSummary})`);
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

    // Post-process nodes to ensure correct X positions using dynamic lookup
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
