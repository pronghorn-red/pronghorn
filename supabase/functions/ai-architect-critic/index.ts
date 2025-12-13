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
function buildNodeTypeReference(nodeTypes: CanvasNodeType[]): string {
  const activeTypes = nodeTypes.filter(nt => nt.is_active && !nt.is_legacy);
  const legacyTypes = nodeTypes.filter(nt => nt.is_legacy);
  
  let prompt = 'NODE TYPE REFERENCE:\n';
  activeTypes.forEach(nt => {
    prompt += `- ${nt.system_name}: ${nt.description || nt.display_label}\n`;
  });
  
  if (legacyTypes.length > 0) {
    prompt += `- Legacy types (may appear): ${legacyTypes.map(lt => lt.system_name).join(', ')}\n`;
  }
  
  return prompt;
}

function buildFlowHierarchy(nodeTypes: CanvasNodeType[]): string {
  const groups = new Map<number, string[]>();
  nodeTypes.filter(nt => nt.is_active && !nt.is_legacy).forEach(nt => {
    const rank = Math.floor(nt.order_score / 100);
    if (!groups.has(rank)) groups.set(rank, []);
    groups.get(rank)!.push(nt.system_name);
  });
  
  let prompt = 'FLOW HIERARCHY (all edges should flow left to right):\n';
  Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .forEach(([rank, types]) => {
      prompt += `Level ${rank}: ${types.join(', ')}\n`;
    });
  
  return prompt;
}

function buildLegacyReplacements(nodeTypes: CanvasNodeType[]): string {
  const legacyTypes = nodeTypes.filter(nt => nt.is_legacy);
  if (legacyTypes.length === 0) return '';
  
  // Map legacy types to their modern replacements based on category/order
  const replacements: Record<string, string> = {
    'COMPONENT': 'WEB_COMPONENT',
    'API': 'API_SERVICE or API_ROUTER or API_CONTROLLER',
    'SERVICE': 'EXTERNAL_SERVICE',
  };
  
  let prompt = '- Legacy Types: Suggest replacing ';
  const suggestions = legacyTypes
    .filter(lt => replacements[lt.system_name])
    .map(lt => `${lt.system_name} with ${replacements[lt.system_name]}`);
  
  return suggestions.length > 0 ? prompt + suggestions.join(', ') : '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      nodes, 
      edges,
      attachedContext,
      projectId,
      shareToken
    } = await req.json();

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
        console.error('[ai-architect-critic] Access denied:', accessError);
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.log('[ai-architect-critic] Access validated for project:', projectId);
    }
    // ========== END VALIDATION ==========

    // Fetch node types from database for dynamic configuration
    const { data: nodeTypesData, error: nodeTypesError } = await supabase.rpc('get_canvas_node_types', {
      p_include_legacy: true
    });

    if (nodeTypesError) {
      console.error('[ai-architect-critic] Failed to fetch node types:', nodeTypesError);
      throw new Error('Failed to fetch node types configuration');
    }

    const nodeTypes: CanvasNodeType[] = nodeTypesData || [];
    console.log(`[ai-architect-critic] Loaded ${nodeTypes.length} node types from database`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Analyzing architecture:', { nodeCount: nodes?.length, edgeCount: edges?.length });

    // Build dynamic prompts from database
    const nodeTypeReference = buildNodeTypeReference(nodeTypes);
    const flowHierarchy = buildFlowHierarchy(nodeTypes);
    const legacyReplacements = buildLegacyReplacements(nodeTypes);

    const systemPrompt = `You are an expert software architect and systems analyst. Analyze the provided application architecture and provide detailed, constructive feedback.

${nodeTypeReference}

${flowHierarchy}

Focus your analysis on:
1. **Architectural Patterns**: Identify the overall pattern (microservices, monolithic, layered, etc.) and assess its appropriateness
2. **Component Organization**: Evaluate how WEB_COMPONENTs, HOOK_COMPOSABLEs, API layers, and services are structured
3. **Separation of Concerns**: Check if responsibilities are properly divided between frontend and backend layers
4. **Data Flow**: Analyze how data moves through HOOK_COMPOSABLE → API_SERVICE → API_ROUTER → API_CONTROLLER → DATABASE
5. **Security**: Identify missing SECURITY, FIREWALL, or API_MIDDLEWARE nodes for auth/authz
6. **Database Design**: Check if DATABASE → SCHEMA → TABLE hierarchy is properly structured
7. **Missing Components**: Identify critical components that might be missing (auth middleware, logging, monitoring)
${legacyReplacements ? `8. ${legacyReplacements}` : ''}
9. **Edge Direction**: Flag any edges that flow right-to-left (violating the hierarchy)

Provide specific, actionable recommendations for improvement. Be constructive and prioritize the most impactful changes.`;

    const nodesSummary = nodes.map((n: any) => 
      `${n.data.label} (${n.data.type}): ${n.data.description || 'No description'}`
    ).join('\n');

    const edgesSummary = edges.map((e: any) => 
      `${e.source} → ${e.target}${e.data?.label ? ` (${e.data.label})` : ''}`
    ).join('\n');

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

        enrichedSystemPrompt = `${systemPrompt}\n\n===== ATTACHED PROJECT CONTEXT =====\n${contextParts.join("\n")}\n\n===== FULL CONTEXT DATA =====\n${truncatedJson}\n\nPlease use the above context to inform your critique. The context includes full object data with all properties and content.`;
      }
    }

    const userPrompt = `Analyze this application architecture:

NODES (${nodes.length}):
${nodesSummary}

CONNECTIONS (${edges.length}):
${edgesSummary}

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
          { role: 'system', content: enrichedSystemPrompt },
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
