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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Use service role to bypass RLS for project creation
    // This is safe because we're handling the creation logic server-side
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    
    // Get user from auth header if present for attribution
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    if (authHeader) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: { Authorization: authHeader },
        },
      });
      const { data: { user } } = await userClient.auth.getUser();
      userId = user?.id || null;
    }

    const { projectData, techStackIds, standardIds, requirementsText } = await req.json();
    
    console.log('[create-project] Starting project creation:', { 
      isAnonymous: !userId,
      projectName: projectData.name 
    });
    
    console.log('[create-project] User:', userId || 'anonymous');

    // Create the project (using service role to bypass RLS)
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        ...projectData,
        created_by: userId,
      })
      .select('id, share_token')
      .single();

    if (projectError) {
      console.error('[create-project] Project creation error:', projectError);
      throw projectError;
    }

    console.log('[create-project] Project created:', { 
      id: project.id, 
      shareToken: project.share_token,
      createdBy: userId || 'anonymous'
    });

    // Link tech stacks
    if (techStackIds && techStackIds.length > 0) {
      const techStackLinks = techStackIds.map((techStackId: string) => ({
        project_id: project.id,
        tech_stack_id: techStackId
      }));

      const { error: techStackError } = await supabase
        .from('project_tech_stacks')
        .insert(techStackLinks);

      if (techStackError) {
        console.error('[create-project] Tech stack linking error:', techStackError);
      } else {
        console.log('[create-project] Tech stacks linked:', techStackIds.length);
      }
    }

    // Link standards
    if (standardIds && standardIds.length > 0) {
      const standardLinks = standardIds.map((standardId: string) => ({
        project_id: project.id,
        standard_id: standardId
      }));

      const { error: standardError } = await supabase
        .from('project_standards')
        .insert(standardLinks);

      if (standardError) {
        console.error('[create-project] Standards linking error:', standardError);
      } else {
        console.log('[create-project] Standards linked:', standardIds.length);
      }
    }

    // Process requirements if provided
    if (requirementsText && requirementsText.trim()) {
      console.log('[create-project] Invoking requirements decomposition');
      
      const { error: aiError } = await supabase.functions.invoke("decompose-requirements", {
        body: { 
          text: requirementsText.trim(), 
          projectId: project.id,
          shareToken: project.share_token 
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
