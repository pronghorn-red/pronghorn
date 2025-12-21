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

    const { 
      sourceProjectId, 
      shareToken, 
      newName,
      cloneChat = false,
      cloneArtifacts = false,
      cloneRequirements = true,
      cloneStandards = true,
      cloneSpecifications = false,
      cloneCanvas = true,
      cloneRepoFiles = false,
      cloneRepoStaging = false
    } = await req.json();
    
    console.log('[clone-project] Starting project clone:', { 
      sourceProjectId,
      newName,
      options: { cloneChat, cloneArtifacts, cloneRequirements, cloneStandards, cloneSpecifications, cloneCanvas, cloneRepoFiles, cloneRepoStaging }
    });

    if (!sourceProjectId) {
      throw new Error('sourceProjectId is required');
    }

    if (!newName || !newName.trim()) {
      throw new Error('newName is required');
    }

    // Call the clone RPC function
    const { data: cloneResult, error: cloneError } = await supabase.rpc('clone_project_with_token', {
      p_source_project_id: sourceProjectId,
      p_token: shareToken || null,
      p_new_name: newName.trim(),
      p_clone_chat: cloneChat,
      p_clone_artifacts: cloneArtifacts,
      p_clone_requirements: cloneRequirements,
      p_clone_standards: cloneStandards,
      p_clone_specifications: cloneSpecifications,
      p_clone_canvas: cloneCanvas,
      p_clone_repo_files: cloneRepoFiles,
      p_clone_repo_staging: cloneRepoStaging
    });

    if (cloneError) {
      console.error('[clone-project] Clone RPC error:', cloneError);
      throw cloneError;
    }

    // RPC returns array from TABLE return type
    const result = Array.isArray(cloneResult) ? cloneResult[0] : cloneResult;
    
    if (!result || !result.id || !result.share_token) {
      console.error('[clone-project] Invalid clone result:', cloneResult);
      throw new Error('Failed to clone project - invalid response from database');
    }

    console.log('[clone-project] Project cloned successfully:', { 
      newProjectId: result.id, 
      newShareToken: result.share_token 
    });

    return new Response(
      JSON.stringify({
        success: true,
        project: {
          id: result.id,
          shareToken: result.share_token,
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('[clone-project] Fatal error:', error);
    
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
