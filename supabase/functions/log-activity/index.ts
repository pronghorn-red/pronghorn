import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ActivityLogRequest {
  projectId: string;
  shareToken?: string;
  type: string;
  message: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

interface BatchActivityLogRequest {
  projectId: string;
  shareToken?: string;
  logs: Array<{
    type: string;
    message: string;
    status?: string;
    metadata?: Record<string, unknown>;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    
    // Use service role for inserting logs (bypasses RLS)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Use anon client with auth for validation
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const body = await req.json();
    
    // Determine if single or batch request
    const isBatch = 'logs' in body && Array.isArray(body.logs);
    const projectId = body.projectId;
    const shareToken = body.shareToken || null;

    if (!projectId) {
      throw new Error('projectId is required');
    }

    // Validate access - require at least viewer role to log activities
    const { data: role, error: roleError } = await supabase.rpc('authorize_project_access', {
      p_project_id: projectId,
      p_token: shareToken,
    });

    if (roleError) {
      console.error('[log-activity] Access validation failed:', roleError);
      throw new Error('Access denied');
    }

    console.log(`[log-activity] User role: ${role}, logging for project: ${projectId}`);

    if (isBatch) {
      // Batch insert
      const batchBody = body as BatchActivityLogRequest;
      const logsToInsert = batchBody.logs.map(log => ({
        project_id: projectId,
        type: log.type,
        message: log.message,
        status: log.status || 'info',
        metadata: log.metadata || null,
      }));

      const { error: insertError } = await supabaseAdmin
        .from('activity_logs')
        .insert(logsToInsert);

      if (insertError) {
        console.error('[log-activity] Batch insert error:', insertError);
        throw new Error(`Failed to insert activity logs: ${insertError.message}`);
      }

      console.log(`[log-activity] Inserted ${logsToInsert.length} activity logs`);
      
      return new Response(JSON.stringify({ success: true, count: logsToInsert.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // Single insert
      const singleBody = body as ActivityLogRequest;
      
      if (!singleBody.type || !singleBody.message) {
        throw new Error('type and message are required');
      }

      const { error: insertError } = await supabaseAdmin
        .from('activity_logs')
        .insert({
          project_id: projectId,
          type: singleBody.type,
          message: singleBody.message,
          status: singleBody.status || 'info',
          metadata: singleBody.metadata || null,
        });

      if (insertError) {
        console.error('[log-activity] Insert error:', insertError);
        throw new Error(`Failed to insert activity log: ${insertError.message}`);
      }

      console.log(`[log-activity] Inserted activity log: ${singleBody.type} - ${singleBody.message}`);
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[log-activity] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
