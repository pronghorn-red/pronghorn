import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RENDER_API_URL = 'https://api.render.com/v1';

interface RenderServiceRequest {
  action: 'create' | 'deploy' | 'start' | 'stop' | 'restart' | 'status' | 'delete' | 'logs' | 'updateEnvVars';
  deploymentId: string;
  shareToken?: string;
  // For create action
  name?: string;
  projectType?: string;
  branch?: string;
  buildCommand?: string;
  startCommand?: string;
  envVars?: Record<string, string>;
  // For deploy action
  commitId?: string;
  // For updateEnvVars action
  newEnvVars?: Array<{key: string, value: string}>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RENDER_API_KEY = Deno.env.get('RENDER_API_KEY');
    if (!RENDER_API_KEY) {
      throw new Error('RENDER_API_KEY not configured');
    }

    const RENDER_OWNER_ID = Deno.env.get('RENDER_ID');
    if (!RENDER_OWNER_ID) {
      throw new Error('RENDER_ID (owner ID) not configured');
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const body: RenderServiceRequest = await req.json();
    const { action, deploymentId, shareToken } = body;

    console.log(`[render-service] Action: ${action}, DeploymentId: ${deploymentId}`);

    // Validate access and get deployment details
    const { data: deployment, error: deploymentError } = await supabase.rpc(
      'get_deployment_with_secrets_with_token',
      { p_deployment_id: deploymentId, p_token: shareToken || null }
    );

    if (deploymentError) {
      console.error('[render-service] Deployment fetch error:', deploymentError);
      throw new Error(deploymentError.message);
    }

    if (!deployment) {
      throw new Error('Deployment not found or access denied');
    }

    const renderHeaders = {
      'Authorization': `Bearer ${RENDER_API_KEY}`,
      'Content-Type': 'application/json',
    };

    let result: any;

    switch (action) {
      case 'create':
        result = await createRenderService(deployment, body, renderHeaders, supabase, shareToken, RENDER_OWNER_ID);
        break;
      case 'deploy':
        result = await deployRenderService(deployment, body, renderHeaders, supabase, shareToken);
        break;
      case 'start':
        result = await startRenderService(deployment, renderHeaders, supabase, shareToken);
        break;
      case 'stop':
        result = await stopRenderService(deployment, renderHeaders, supabase, shareToken);
        break;
      case 'restart':
        result = await restartRenderService(deployment, renderHeaders);
        break;
      case 'status':
        result = await getServiceStatus(deployment, renderHeaders);
        break;
      case 'delete':
        result = await deleteRenderService(deployment, renderHeaders, supabase, shareToken);
        break;
      case 'logs':
        result = await getServiceLogs(deployment, renderHeaders);
        break;
      case 'updateEnvVars':
        result = await updateEnvVarsRenderService(deployment, body, renderHeaders);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Log the action
    await supabase.rpc('insert_deployment_log_with_token', {
      p_deployment_id: deploymentId,
      p_token: shareToken || null,
      p_log_type: action,
      p_message: `${action} action completed`,
      p_metadata: { result: result?.status || 'success' },
    });

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[render-service] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function createRenderService(
  deployment: any,
  body: RenderServiceRequest,
  headers: Record<string, string>,
  supabase: any,
  shareToken?: string,
  ownerId?: string
) {
  console.log('[render-service] Creating Render service...');

  // Get the repo details for GitHub connection
  // First try deployment-specific repo, then fall back to project's prime repo
  let repo = null;
  
  if (deployment.repo_id) {
    const { data: repoData } = await supabase.rpc('get_repo_by_id_with_token', {
      p_repo_id: deployment.repo_id,
      p_token: shareToken || null,
    });
    repo = repoData;
  }
  
  // Fall back to prime repo for the project if no specific repo
  if (!repo) {
    const { data: primeRepo } = await supabase.rpc('get_prime_repo_with_token', {
      p_project_id: deployment.project_id,
      p_token: shareToken || null,
    });
    repo = primeRepo;
  }
  
  if (!repo) {
    throw new Error('No repository found. Create a repository first before deploying.');
  }

  // Determine service type based on project type
  const isStaticSite = ['react', 'vue', 'tanstack'].includes(deployment.project_type?.toLowerCase() || '');
  
  // Build environment variables array
  const envVars = Object.entries(deployment.env_vars || {}).map(([key, value]) => ({
    key,
    value,
  }));

  // Add secrets to env vars
  const secrets = deployment.secrets || {};
  Object.entries(secrets).forEach(([key, value]) => {
    envVars.push({ key, value: value as string });
  });

  // Service name includes environment prefix: env-appname
  const serviceName = `${deployment.environment}-${deployment.name}`;

  const servicePayload: any = {
    name: serviceName,
    ownerId: ownerId,
    type: isStaticSite ? 'static_site' : 'web_service',
    autoDeploy: 'no', // We'll trigger deploys manually
    branch: deployment.branch || 'main',
    envVars,
  };

  // Set the GitHub repo URL
  servicePayload.repo = `https://github.com/${repo.organization}/${repo.repo}`;

  // Add serviceDetails based on service type (required by Render API)
  if (isStaticSite) {
    servicePayload.serviceDetails = {
      buildCommand: deployment.build_command || 'npm run build',
      publishPath: deployment.build_folder || 'dist',
    };
  } else {
    // Web service requires serviceDetails with env, envSpecificDetails, and plan
    servicePayload.serviceDetails = {
      env: getRuntime(deployment.project_type), // 'node', 'python', 'go', etc.
      envSpecificDetails: {
        buildCommand: deployment.build_command || 'npm install',
        startCommand: deployment.run_command || 'npm start',
      },
      plan: 'starter', // Cannot use 'free' via API - 'starter' is cheapest paid plan
    };
  }

  console.log('[render-service] Service payload:', JSON.stringify(servicePayload, null, 2));

  const response = await fetch(`${RENDER_API_URL}/services`, {
    method: 'POST',
    headers,
    body: JSON.stringify(servicePayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[render-service] Create service error:', errorText);
    throw new Error(`Failed to create Render service: ${errorText}`);
  }

  const result = await response.json();
  console.log('[render-service] Service created:', result);

  // Update deployment with Render service ID
  await supabase.rpc('update_deployment_with_token', {
    p_deployment_id: deployment.id,
    p_token: shareToken || null,
    p_render_service_id: result.service?.id,
    p_status: 'pending',
    p_url: result.service?.serviceDetails?.url,
  });

  return result;
}

async function deployRenderService(
  deployment: any,
  body: RenderServiceRequest,
  headers: Record<string, string>,
  supabase: any,
  shareToken?: string
) {
  if (!deployment.render_service_id) {
    throw new Error('Service not yet created on Render');
  }

  console.log('[render-service] Triggering deploy for service:', deployment.render_service_id);

  // Trigger a deploy
  const response = await fetch(`${RENDER_API_URL}/services/${deployment.render_service_id}/deploys`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      clearCache: body.commitId ? 'do_not_clear' : 'clear',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[render-service] Deploy error:', errorText);
    throw new Error(`Failed to deploy: ${errorText}`);
  }

  const result = await response.json();
  console.log('[render-service] Deploy triggered:', result);

  // Update deployment status
  await supabase.rpc('update_deployment_with_token', {
    p_deployment_id: deployment.id,
    p_token: shareToken || null,
    p_status: 'deploying',
    p_render_deploy_id: result.deploy?.id,
  });

  return result;
}

async function startRenderService(
  deployment: any,
  headers: Record<string, string>,
  supabase: any,
  shareToken?: string
) {
  if (!deployment.render_service_id) {
    throw new Error('Service not yet created on Render');
  }

  console.log('[render-service] Resuming service:', deployment.render_service_id);

  const response = await fetch(`${RENDER_API_URL}/services/${deployment.render_service_id}/resume`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[render-service] Resume error:', errorText);
    throw new Error(`Failed to resume service: ${errorText}`);
  }

  // Update deployment status
  await supabase.rpc('update_deployment_with_token', {
    p_deployment_id: deployment.id,
    p_token: shareToken || null,
    p_status: 'running',
  });

  return { status: 'resumed' };
}

async function stopRenderService(
  deployment: any,
  headers: Record<string, string>,
  supabase: any,
  shareToken?: string
) {
  if (!deployment.render_service_id) {
    throw new Error('Service not yet created on Render');
  }

  console.log('[render-service] Suspending service:', deployment.render_service_id);

  const response = await fetch(`${RENDER_API_URL}/services/${deployment.render_service_id}/suspend`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[render-service] Suspend error:', errorText);
    throw new Error(`Failed to suspend service: ${errorText}`);
  }

  // Update deployment status
  await supabase.rpc('update_deployment_with_token', {
    p_deployment_id: deployment.id,
    p_token: shareToken || null,
    p_status: 'stopped',
  });

  return { status: 'suspended' };
}

async function getServiceStatus(deployment: any, headers: Record<string, string>) {
  if (!deployment.render_service_id) {
    return { status: 'not_created' };
  }

  console.log('[render-service] Getting status for service:', deployment.render_service_id);

  const response = await fetch(`${RENDER_API_URL}/services/${deployment.render_service_id}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[render-service] Status error:', errorText);
    throw new Error(`Failed to get status: ${errorText}`);
  }

  const result = await response.json();
  console.log('[render-service] Service status:', result);

  return {
    status: result.service?.suspended ? 'suspended' : 'running',
    url: result.service?.serviceDetails?.url,
    createdAt: result.service?.createdAt,
    updatedAt: result.service?.updatedAt,
    service: result.service,
  };
}

async function deleteRenderService(
  deployment: any,
  headers: Record<string, string>,
  supabase: any,
  shareToken?: string
) {
  if (!deployment.render_service_id) {
    // Just update status if no Render service exists
    await supabase.rpc('update_deployment_with_token', {
      p_deployment_id: deployment.id,
      p_token: shareToken || null,
      p_status: 'deleted',
    });
    return { status: 'deleted' };
  }

  console.log('[render-service] Deleting service:', deployment.render_service_id);

  const response = await fetch(`${RENDER_API_URL}/services/${deployment.render_service_id}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[render-service] Delete error:', errorText);
    throw new Error(`Failed to delete service: ${errorText}`);
  }

  // Update deployment status
  await supabase.rpc('update_deployment_with_token', {
    p_deployment_id: deployment.id,
    p_token: shareToken || null,
    p_status: 'deleted',
    p_render_service_id: null,
  });

  return { status: 'deleted' };
}

async function getServiceLogs(deployment: any, headers: Record<string, string>) {
  if (!deployment.render_service_id) {
    return { logs: [] };
  }

  console.log('[render-service] Getting logs for service:', deployment.render_service_id);

  // Get recent deploys to find log endpoints
  const deploysResponse = await fetch(
    `${RENDER_API_URL}/services/${deployment.render_service_id}/deploys?limit=5`,
    { method: 'GET', headers }
  );

  if (!deploysResponse.ok) {
    const errorText = await deploysResponse.text();
    console.error('[render-service] Logs error:', errorText);
    throw new Error(`Failed to get logs: ${errorText}`);
  }

  const deploysResult = await deploysResponse.json();
  
  // Get logs from the most recent deploy if available
  const recentDeploy = deploysResult[0];
  if (!recentDeploy) {
    return { logs: [], deploys: [] };
  }

  return {
    deploys: deploysResult.map((d: any) => ({
      id: d.deploy?.id,
      status: d.deploy?.status,
      createdAt: d.deploy?.createdAt,
      finishedAt: d.deploy?.finishedAt,
      commit: d.deploy?.commit,
    })),
    latestDeployId: recentDeploy.deploy?.id,
    latestStatus: recentDeploy.deploy?.status,
  };
}

async function restartRenderService(deployment: any, headers: Record<string, string>) {
  if (!deployment.render_service_id) {
    throw new Error('Service not yet created on Render');
  }

  console.log('[render-service] Restarting service:', deployment.render_service_id);

  const response = await fetch(`${RENDER_API_URL}/services/${deployment.render_service_id}/restart`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[render-service] Restart error:', errorText);
    throw new Error(`Failed to restart service: ${errorText}`);
  }

  return { status: 'restarted' };
}

async function updateEnvVarsRenderService(
  deployment: any,
  body: RenderServiceRequest,
  headers: Record<string, string>
) {
  if (!deployment.render_service_id) {
    throw new Error('Service not yet created on Render');
  }

  console.log('[render-service] Updating env vars for service:', deployment.render_service_id);

  const envVars = body.newEnvVars || [];

  const response = await fetch(`${RENDER_API_URL}/services/${deployment.render_service_id}/env-vars`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(envVars),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[render-service] Update env vars error:', errorText);
    throw new Error(`Failed to update env vars: ${errorText}`);
  }

  const result = await response.json();
  return { 
    status: 'env_vars_updated', 
    note: 'Deploy the service to apply changes',
    envVars: result,
  };
}

function getRuntime(projectType?: string): string {
  switch (projectType?.toLowerCase()) {
    case 'node':
      return 'node';
    case 'python':
      return 'python';
    case 'go':
      return 'go';
    default:
      return 'node';
  }
}
