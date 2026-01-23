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
    const { projectId, shareToken, canvasId } = await req.json();
    console.log('Generating specification for project:', projectId, 'canvasId:', canvasId || 'default');

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

    if (!shareToken) {
      throw new Error('Share token is required');
    }

    // Fetch all project data using token-based RPC functions
    console.log('Fetching project data with token...');
    
    // Fetch project
    const { data: project, error: projectError } = await supabase.rpc('get_project_with_token', {
      p_project_id: projectId,
      p_token: shareToken
    });

    if (projectError) {
      console.error('Project fetch error:', projectError);
      throw projectError;
    }

    if (!project) {
      throw new Error('Project not found or access denied');
    }

    // Fetch requirements
    const { data: requirements, error: reqError } = await supabase.rpc('get_requirements_with_token', {
      p_project_id: projectId,
      p_token: shareToken
    });

    if (reqError) {
      console.error('Requirements fetch error:', reqError);
    }

    // Fetch canvas nodes
    const { data: canvasNodes, error: nodesError } = await supabase.rpc('get_canvas_nodes_with_token', {
      p_project_id: projectId,
      p_token: shareToken,
      p_canvas_id: canvasId || null
    });

    if (nodesError) {
      console.error('Canvas nodes fetch error:', nodesError);
    }

    // Fetch canvas edges
    const { data: canvasEdges, error: edgesError } = await supabase.rpc('get_canvas_edges_with_token', {
      p_project_id: projectId,
      p_token: shareToken,
      p_canvas_id: canvasId || null
    });

    if (edgesError) {
      console.error('Canvas edges fetch error:', edgesError);
    }

    // Fetch project tech stacks
    const { data: projectTechStacksRaw, error: techError } = await supabase.rpc('get_project_tech_stacks_with_token', {
      p_project_id: projectId,
      p_token: shareToken
    });

    if (techError) {
      console.error('Project tech stacks fetch error:', techError);
    }

    // Now fetch the full tech stack details for each linked tech stack
    let projectTechStacks: any[] = [];
    if (projectTechStacksRaw && projectTechStacksRaw.length > 0) {
      const techStackIds = projectTechStacksRaw.map((pts: any) => pts.tech_stack_id);
      const { data: techStacks } = await supabase
        .from('tech_stacks')
        .select('*')
        .in('id', techStackIds);
      
      if (techStacks) {
        projectTechStacks = projectTechStacksRaw.map((pts: any) => ({
          tech_stack_id: pts.tech_stack_id,
          tech_stacks: techStacks.find((ts: any) => ts.id === pts.tech_stack_id)
        }));
      }
    }

    // Fetch project standards
    const { data: projectStandardsRaw, error: standardsError } = await supabase.rpc('get_project_standards_with_token', {
      p_project_id: projectId,
      p_token: shareToken
    });

    if (standardsError) {
      console.error('Project standards fetch error:', standardsError);
    }

    // Fetch full standard details for each linked standard
    let projectStandards: any[] = [];
    if (projectStandardsRaw && projectStandardsRaw.length > 0) {
      const standardIds = projectStandardsRaw.map((ps: any) => ps.standard_id);
      const { data: standards } = await supabase
        .from('standards')
        .select('*')
        .in('id', standardIds);
      
      if (standards) {
        projectStandards = projectStandardsRaw.map((ps: any) => ({
          id: ps.id,
          standards: standards.find((s: any) => s.id === ps.standard_id)
        }));
      }
    }

    // Fetch requirement standards (linked standards) - only if we have requirements
    let reqStandards: any[] = [];
    if (requirements && requirements.length > 0) {
      for (const req of requirements) {
        const { data: stdData, error: stdError } = await supabase.rpc('get_requirement_standards_with_token', {
          p_requirement_id: req.id,
          p_token: shareToken
        });

        if (stdError) {
          console.error(`Requirement standards fetch error for ${req.id}:`, stdError);
        } else if (stdData && stdData.length > 0) {
          // Fetch the full standard details
          const standardIds = stdData.map((rs: any) => rs.standard_id);
          const { data: standards } = await supabase
            .from('standards')
            .select('*')
            .in('id', standardIds);
          
          if (standards) {
            const enrichedStandards = stdData.map((rs: any) => ({
              id: rs.id,
              requirement_id: rs.requirement_id,
              standard_id: rs.standard_id,
              notes: rs.notes,
              standards: standards.find((s: any) => s.id === rs.standard_id)
            }));
            reqStandards.push(...enrichedStandards);
          }
        }
      }
    }

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
      projectStandards: projectStandards || [],
      requirementStandards: reqStandards || []
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

PROJECT-LEVEL STANDARDS (${context.projectStandards.length} total):
${context.projectStandards.map((ps: any) => `- [${ps.standards?.code}] ${ps.standards?.title}: ${ps.standards?.description || 'No description'}`).join('\n')}

REQUIREMENT-LINKED STANDARDS (${context.requirementStandards.length} total):
${context.requirementStandards.map((rs: any) => `- [${rs.standards?.code}] ${rs.standards?.title} (linked to requirement: ${rs.requirement_id}): ${rs.standards?.description || 'No description'}`).join('\n')}

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
    const aiGeneratedText = aiData.choices[0].message.content;

    console.log('Specification generated successfully');

    // Save specification to database
    console.log('Saving specification to database...');
    try {
      const { error: saveError } = await supabase.rpc('save_project_specification_with_token', {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_generated_spec: aiGeneratedText,
        p_raw_data: context
      });

      if (saveError) {
        console.error('Error saving specification:', saveError);
        // Don't throw, just log - we still want to return the spec to the user
      } else {
        console.log('Specification saved successfully');
        
        // Broadcast specification_refresh for multi-user sync
        try {
          await supabase.channel(`specifications-${projectId}`).send({
            type: 'broadcast',
            event: 'specification_refresh',
            payload: { projectId }
          });
        } catch (broadcastError) {
          console.warn('Failed to broadcast specification_refresh:', broadcastError);
        }
      }
    } catch (saveErr) {
      console.error('Exception saving specification:', saveErr);
      // Continue anyway
    }

    // Return both generated spec and raw data
    return new Response(
      JSON.stringify({
        generatedSpecification: aiGeneratedText,
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
