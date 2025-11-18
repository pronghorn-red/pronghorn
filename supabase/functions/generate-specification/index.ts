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
    const { projectId, shareToken } = await req.json();
    console.log('Generating specification for project:', projectId);

    if (!projectId) {
      throw new Error('Project ID is required');
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration missing");
    }

    // Get auth header for authenticated users
    const authHeader = req.headers.get('Authorization');
    
    // Create client with anon key (respects RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

    // Fetch all project data
    console.log('Fetching project data...');
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError) throw projectError;

    // Fetch requirements
    const { data: requirements, error: reqError } = await supabase
      .from('requirements')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index');

    if (reqError) throw reqError;

    // Fetch canvas nodes
    const { data: canvasNodes, error: nodesError } = await supabase
      .from('canvas_nodes')
      .select('*')
      .eq('project_id', projectId);

    if (nodesError) throw nodesError;

    // Fetch canvas edges
    const { data: canvasEdges, error: edgesError } = await supabase
      .from('canvas_edges')
      .select('*')
      .eq('project_id', projectId);

    if (edgesError) throw edgesError;

    // Fetch linked tech stacks
    const { data: projectTechStacks, error: techError } = await supabase
      .from('project_tech_stacks')
      .select(`
        tech_stack_id,
        tech_stacks (
          id,
          name,
          description,
          metadata
        )
      `)
      .eq('project_id', projectId);

    if (techError) throw techError;

    // Fetch requirement standards (linked standards)
    const { data: reqStandards, error: stdError } = await supabase
      .from('requirement_standards')
      .select(`
        requirement_id,
        standard_id,
        standards (
          id,
          title,
          code,
          description,
          content
        )
      `)
      .in('requirement_id', requirements?.map(r => r.id) || []);

    if (stdError) throw stdError;

    // Build context for AI
    const nodesByType = canvasNodes?.reduce((acc: any, node: any) => {
      if (!acc[node.type]) acc[node.type] = [];
      acc[node.type].push(node);
      return acc;
    }, {}) || {};

    const context = {
      project: {
        name: project.name,
        description: project.description,
        organization: project.organization,
        budget: project.budget,
        scope: project.scope,
        priority: project.priority,
        timeline_start: project.timeline_start,
        timeline_end: project.timeline_end,
        tags: project.tags,
        status: project.status
      },
      requirements: requirements || [],
      canvas: {
        nodes: canvasNodes || [],
        edges: canvasEdges || [],
        nodesByType: nodesByType,
        statistics: {
          totalNodes: canvasNodes?.length || 0,
          totalEdges: canvasEdges?.length || 0,
          nodeTypeBreakdown: Object.keys(nodesByType).reduce((acc: any, type: string) => {
            acc[type] = nodesByType[type].length;
            return acc;
          }, {})
        }
      },
      techStacks: projectTechStacks?.map((pts: any) => pts.tech_stacks) || [],
      standards: reqStandards || []
    };

    console.log('Context prepared, calling AI...');

    // Create comprehensive prompt for AI
    const prompt = `You are a technical specification writer. Generate a comprehensive, professional specification document for the following project.

PROJECT INFORMATION:
${JSON.stringify(context.project, null, 2)}

REQUIREMENTS (${context.requirements.length} total):
${context.requirements.map((r: any) => `- [${r.code}] ${r.title}: ${r.content || 'No description'}`).join('\n')}

ARCHITECTURE CANVAS:
- Total Nodes: ${context.canvas.statistics.totalNodes}
- Total Connections: ${context.canvas.statistics.totalEdges}
- Node Types: ${JSON.stringify(context.canvas.statistics.nodeTypeBreakdown, null, 2)}

Detailed Canvas Nodes:
${context.canvas.nodes.map((n: any) => `- ${n.type}: ${n.data?.label || 'Unlabeled'} (${n.data?.description || 'No description'})`).join('\n')}

TECHNOLOGY STACKS:
${context.techStacks.map((ts: any) => `- ${ts.name}: ${ts.description || 'No description'}`).join('\n')}

LINKED STANDARDS (${context.standards.length} total):
${context.standards.map((rs: any) => `- [${rs.standards?.code}] ${rs.standards?.title}: ${rs.standards?.description || 'No description'}`).join('\n')}

Please generate a comprehensive specification document that includes:
1. Executive Summary
2. Project Overview (name, organization, scope, budget, timeline, priority)
3. Requirements Analysis (organized by hierarchy: epics > features > stories)
4. Architecture Overview (describing the canvas structure and all components)
5. Technology Stack (detailed breakdown of selected technologies)
6. Standards & Compliance (all linked standards with explanations)
7. Component Inventory (pages, services, APIs, databases, etc. from canvas)
8. Integration Points (based on canvas edges/connections)
9. Recommendations and Next Steps

Format the output in clear, professional markdown with proper headings, bullet points, and sections.`;

    // Call Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a professional technical specification writer. Generate comprehensive, well-structured documentation." },
          { role: "user", content: prompt }
        ],
        max_completion_tokens: 65535,
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
    const generatedSpec = aiData.choices[0].message.content;

    console.log('Specification generated successfully');

    // Return both generated spec and raw data
    return new Response(
      JSON.stringify({
        generatedSpecification: generatedSpec,
        rawData: context
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in generate-specification function:', error);
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
