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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // CRITICAL: Use anon key, not service role - respects RLS policies
    // Get auth header for authenticated users
    const authHeader = req.headers.get('Authorization');
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });
    
    // Get user ID if authenticated
    let userId = null;
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id || null;
    }

    const { projectData, techStackIds, standardIds, requirementsText } = await req.json();
    
    console.log('[create-project] Starting project creation:', { 
      isAnonymous: !userId,
      projectName: projectData.name 
    });
    
    console.log('[create-project] User:', userId || 'anonymous');

    // Step 1: Create project using RPC (Exception: no token required for initial creation)
    const { data: project, error: projectError } = await supabase.rpc('insert_project_with_token', {
      p_name: projectData.name,
      p_org_id: projectData.org_id,
      p_description: projectData.description || null,
      p_organization: projectData.organization || null,
      p_budget: projectData.budget || null,
      p_scope: projectData.scope || null,
      p_status: projectData.status || 'DESIGN'
    });

    if (projectError) {
      console.error('[create-project] Project creation error:', projectError);
      throw projectError;
    }

    console.log('[create-project] Project created:', { 
      id: project.id, 
      shareToken: project.share_token,
      createdBy: userId || 'anonymous'
    });

    // Step 2: Use returned share_token for all subsequent operations
    const shareToken = project.share_token;

    // Step 3: Link tech stacks using token-based RPC
    if (techStackIds && techStackIds.length > 0) {
      console.log('[create-project] Linking tech stacks with token-based RPC');
      
      for (const techStackId of techStackIds) {
        const { error: techStackError } = await supabase.rpc('insert_project_tech_stack_with_token', {
          p_project_id: project.id,
          p_token: shareToken,
          p_tech_stack_id: techStackId
        });

        if (techStackError) {
          console.error('[create-project] Tech stack linking error:', techStackError);
        }
      }
      
      console.log('[create-project] Tech stacks linked:', techStackIds.length);
    }

    // Step 4: Link standards using token-based RPC
    if (standardIds && standardIds.length > 0) {
      console.log('[create-project] Linking standards with token-based RPC');
      
      for (const standardId of standardIds) {
        const { error: standardError } = await supabase.rpc('insert_project_standard_with_token', {
          p_project_id: project.id,
          p_token: shareToken,
          p_standard_id: standardId
        });

        if (standardError) {
          console.error('[create-project] Standards linking error:', standardError);
        }
      }
      
      console.log('[create-project] Standards linked:', standardIds.length);
    }

    // Step 5: Process requirements if provided (pass share_token to AI decomposition)
    if (requirementsText && requirementsText.trim()) {
      console.log('[create-project] Invoking requirements decomposition with share token');
      
      const { error: aiError } = await supabase.functions.invoke("decompose-requirements", {
        body: { 
          text: requirementsText.trim(), 
          projectId: project.id,
          shareToken: shareToken
        },
      });

      if (aiError) {
        console.error('[create-project] AI decomposition error:', aiError);
      } else {
        console.log('[create-project] Requirements decomposed successfully');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        project: {
          id: project.id,
          shareToken: project.share_token,
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('[create-project] Fatal error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
