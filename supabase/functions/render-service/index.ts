import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RENDER_API_URL = 'https://api.render.com/v1';

// Runtime mapping based on project type
const RUNTIME_MAP: Record<string, string> = {
  node: 'node',
  python: 'python',
  go: 'go',
  ruby: 'ruby',
  rust: 'rust',
  elixir: 'elixir',
  docker: 'docker',
  react_vite: 'node',
  vue_vite: 'node',
};

// Project types that should be deployed as static sites
const STATIC_SITE_TYPES = ['static', 'tanstack'];

interface RenderServiceRequest {
  action: 'create' | 'deploy' | 'start' | 'stop' | 'restart' | 'status' | 'delete' | 'logs' | 'updateEnvVars' | 'getEnvVars' | 'getEvents' | 'syncEnvVars' | 'updateServiceConfig';
  deploymentId: string;
  shareToken?: string;
  // For create action - client passes full key:value pairs
  envVars?: Array<{key: string, value: string}>;
  // For deploy action
  commitId?: string;
  // For updateEnvVars/syncEnvVars action
  newEnvVars?: Array<{key: string, value: string}>;
  keysToDelete?: string[];
  clearExisting?: boolean;
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
        result = await getServiceStatus(deployment, renderHeaders, supabase, shareToken);
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
      case 'getEnvVars':
        result = await getEnvVarsRenderService(deployment, renderHeaders);
        break;
      case 'getEvents':
        result = await getEventsRenderService(deployment, renderHeaders);
        break;
      case 'syncEnvVars':
        result = await syncEnvVarsRenderService(deployment, body, renderHeaders);
        break;
      case 'updateServiceConfig':
        result = await updateServiceConfigRenderService(deployment, renderHeaders);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Log the action (skip for read-only actions)
    if (!['status', 'logs', 'getEnvVars', 'getEvents'].includes(action)) {
      await supabase.rpc('insert_deployment_log_with_token', {
        p_deployment_id: deploymentId,
        p_token: shareToken || null,
        p_log_type: action,
        p_message: `${action} action completed`,
        p_metadata: { result: result?.status || 'success' },
      });
    }

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

function getRuntime(projectType?: string): string {
  const type = projectType?.toLowerCase() || 'node';
  return RUNTIME_MAP[type] || 'node';
}

function isStaticSiteType(projectType?: string): boolean {
  return STATIC_SITE_TYPES.includes(projectType?.toLowerCase() || '');
}

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
    const { data: primeRepoData } = await supabase.rpc('get_prime_repo_with_token', {
      p_project_id: deployment.project_id,
      p_token: shareToken || null,
    });
    repo = Array.isArray(primeRepoData) ? primeRepoData[0] : primeRepoData;
  }
  
  if (!repo) {
    throw new Error('No repository found. Create a repository first before deploying.');
  }

  // Determine service type based on project type
  const isStaticSite = isStaticSiteType(deployment.project_type);
  const runtime = getRuntime(deployment.project_type);
  
  // Build environment variables array from client-provided values (NOT from DB)
  const envVars = body.envVars || [];

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
    autoDeploy: 'yes',
    branch: deployment.branch || 'main',
    envVars,
    repo: `https://github.com/${repo.organization}/${repo.repo}`,
  };

  // Add serviceDetails based on service type
  if (isStaticSite) {
    servicePayload.serviceDetails = {
      buildCommand: deployment.build_command || 'npm run build',
      publishPath: deployment.build_folder || 'dist',
    };
  } else {
    // Web service requires runtime and commands
    servicePayload.serviceDetails = {
      runtime: runtime,
      envSpecificDetails: {
        buildCommand: deployment.build_command || 'npm install',
        startCommand: deployment.run_command || 'npm start',
      },
      plan: 'starter',
    };

    // Add disk if enabled
    if (deployment.disk_enabled && deployment.disk_name) {
      servicePayload.serviceDetails.disk = {
        name: deployment.disk_name,
        mountPath: deployment.disk_mount_path || '/data',
        sizeGB: deployment.disk_size_gb || 1,
      };
    }
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
  console.log('[render-service] Service created:', JSON.stringify(result, null, 2));

  const renderServiceId = result.service?.id;
  const renderDeployId = result.deployId; // Render returns the initial deploy ID
  const serviceUrl = result.service?.serviceDetails?.url;

  if (!renderServiceId) {
    console.error('[render-service] CRITICAL: Render response missing service.id:', result);
    throw new Error('Render did not return a service ID');
  }

  console.log('[render-service] Saving to DB - render_service_id:', renderServiceId, 'render_deploy_id:', renderDeployId);

  // Update deployment with Render service ID - MUST succeed
  // Pass ALL parameters to avoid PostgreSQL function overload ambiguity (PGRST203)
  const { data: updateData, error: updateError } = await supabase.rpc('update_deployment_with_token', {
    p_deployment_id: deployment.id,
    p_token: shareToken || null,
    p_name: deployment.name,
    p_environment: deployment.environment,
    p_project_type: deployment.project_type,
    p_run_folder: deployment.run_folder,
    p_build_folder: deployment.build_folder,
    p_run_command: deployment.run_command,
    p_build_command: deployment.build_command,
    p_branch: deployment.branch,
    p_env_vars: deployment.env_vars || {},
    p_status: 'building', // Service was created, initial build starts immediately
    p_render_service_id: renderServiceId,
    p_render_deploy_id: renderDeployId || null,
    p_url: serviceUrl || null,
    p_disk_enabled: deployment.disk_enabled || false,
    p_disk_name: deployment.disk_name || null,
    p_disk_mount_path: deployment.disk_mount_path || '/data',
    p_disk_size_gb: deployment.disk_size_gb || 1,
  });

  if (updateError) {
    console.error('[render-service] CRITICAL: Failed to save render_service_id to database:', updateError);
    console.error('[render-service] Deployment ID:', deployment.id, 'Render Service ID:', renderServiceId);
    // Don't throw - the service was created on Render successfully, return success
    // but log prominently so we can debug
  } else {
    console.log('[render-service] Successfully saved render_service_id to database:', updateData);
  }

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

  await supabase.rpc('update_deployment_with_token', {
    p_deployment_id: deployment.id,
    p_token: shareToken || null,
    p_status: 'stopped',
  });

  return { status: 'suspended' };
}

async function getServiceStatus(
  deployment: any,
  headers: Record<string, string>,
  supabase?: any,
  shareToken?: string
) {
  if (!deployment.render_service_id) {
    console.log('[render-service] No render_service_id, returning not_created');
    return { status: 'not_created', message: 'Service has not been created on Render yet' };
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
  console.log('[render-service] Service status response:', JSON.stringify(result, null, 2));

  let mappedStatus = 'pending';
  const service = result.service;
  let latestDeploy: any = null;
  let deployLogs: string | null = null;
  
  if (service) {
    if (service.suspended === 'suspended') {
      mappedStatus = 'suspended';
    } else if (service.suspended === 'not_suspended') {
      mappedStatus = 'running';
    }
  }

  // Check latest deploy status
  try {
    const deploysResponse = await fetch(
      `${RENDER_API_URL}/services/${deployment.render_service_id}/deploys?limit=1`,
      { method: 'GET', headers }
    );
    
    if (deploysResponse.ok) {
      const deploysData = await deploysResponse.json();
      latestDeploy = deploysData[0]?.deploy;
      
      if (latestDeploy) {
        const deployStatus = latestDeploy.status;
        console.log('[render-service] Latest deploy status:', deployStatus, 'Deploy ID:', latestDeploy.id);
        
        if (deployStatus === 'build_in_progress' || deployStatus === 'update_in_progress') {
          mappedStatus = 'building';
        } else if (deployStatus === 'created') {
          mappedStatus = 'deploying';
        } else if (deployStatus === 'live') {
          mappedStatus = service?.suspended === 'suspended' ? 'suspended' : 'running';
        } else if (deployStatus === 'deactivated' || deployStatus === 'canceled') {
          mappedStatus = 'stopped';
        } else if (deployStatus === 'build_failed' || deployStatus === 'update_failed') {
          mappedStatus = 'failed';
          
          // Fetch deploy logs for failed builds
          try {
            console.log('[render-service] Fetching logs for failed deploy:', latestDeploy.id);
            const logsResponse = await fetch(
              `${RENDER_API_URL}/deploys/${latestDeploy.id}/logs`,
              { method: 'GET', headers }
            );
            
            if (logsResponse.ok) {
              const logsData = await logsResponse.json();
              // Logs are returned as array of log objects, extract last 50 lines
              if (Array.isArray(logsData)) {
                const lastLogs = logsData.slice(-50);
                deployLogs = lastLogs.map((log: any) => log.message || log.text || JSON.stringify(log)).join('\n');
                console.log('[render-service] Got deploy logs, length:', deployLogs.length);
              }
            } else {
              console.error('[render-service] Failed to fetch deploy logs:', await logsResponse.text());
            }
          } catch (logError) {
            console.error('[render-service] Error fetching deploy logs:', logError);
          }
        }
      }
    }
  } catch (e) {
    console.error('[render-service] Error checking deploy status:', e);
  }

  const serviceUrl = service?.serviceDetails?.url;

  // Update database with new status
  if (supabase && deployment.id) {
    console.log('[render-service] Updating deployment status in DB:', mappedStatus);
    const { error: updateError } = await supabase.rpc('update_deployment_with_token', {
      p_deployment_id: deployment.id,
      p_token: shareToken || null,
      p_status: mappedStatus,
      p_url: serviceUrl || null,
      p_render_deploy_id: latestDeploy?.id || null,
    });
    
    if (updateError) {
      console.error('[render-service] Failed to update status in DB:', updateError);
    }
  }

  return {
    status: mappedStatus,
    url: serviceUrl,
    createdAt: service?.createdAt,
    updatedAt: service?.updatedAt,
    service: service,
    latestDeploy: latestDeploy,
    deployLogs: deployLogs,
  };
}

async function deleteRenderService(
  deployment: any,
  headers: Record<string, string>,
  supabase: any,
  shareToken?: string
) {
  if (!deployment.render_service_id) {
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

  let envVarsToSend = body.newEnvVars || [];
  
  if (!body.clearExisting && envVarsToSend.length > 0) {
    const currentResponse = await fetch(
      `${RENDER_API_URL}/services/${deployment.render_service_id}/env-vars`,
      { method: 'GET', headers }
    );

    if (currentResponse.ok) {
      const currentVars = await currentResponse.json();
      console.log('[render-service] Current env vars count:', currentVars.length);
      
      const newVarsMap = new Map(envVarsToSend.map(v => [v.key, v.value]));
      const mergedVarsMap = new Map<string, string>();
      
      for (const v of currentVars) {
        if (v.envVar?.key && v.envVar?.value !== undefined) {
          mergedVarsMap.set(v.envVar.key, v.envVar.value);
        }
      }
      
      for (const [key, value] of newVarsMap) {
        mergedVarsMap.set(key, value);
      }
      
      envVarsToSend = Array.from(mergedVarsMap.entries()).map(([key, value]) => ({ key, value }));
      console.log('[render-service] Merged env vars count:', envVarsToSend.length);
    }
  }

  const response = await fetch(`${RENDER_API_URL}/services/${deployment.render_service_id}/env-vars`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(envVarsToSend),
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
    envVarsCount: result.length,
  };
}

async function getEnvVarsRenderService(
  deployment: any,
  headers: Record<string, string>
) {
  if (!deployment.render_service_id) {
    throw new Error('Service not yet created on Render');
  }

  console.log('[render-service] Getting env vars for service:', deployment.render_service_id);

  const response = await fetch(
    `${RENDER_API_URL}/services/${deployment.render_service_id}/env-vars`,
    { method: 'GET', headers }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[render-service] Get env vars error:', errorText);
    throw new Error(`Failed to get env vars: ${errorText}`);
  }

  const result = await response.json();
  
  const envVars = result.map((item: any) => ({
    key: item.envVar?.key || '',
    value: item.envVar?.value || '',
  }));

  return envVars;
}

async function getEventsRenderService(
  deployment: any,
  headers: Record<string, string>
) {
  if (!deployment.render_service_id) {
    return { events: [], deploys: [], latestDeploy: null };
  }

  console.log('[render-service] Getting events for service:', deployment.render_service_id);

  let events: any[] = [];
  try {
    const eventsResponse = await fetch(
      `${RENDER_API_URL}/services/${deployment.render_service_id}/events?limit=50`,
      { method: 'GET', headers }
    );

    if (eventsResponse.ok) {
      const eventsData = await eventsResponse.json();
      events = eventsData.map((item: any) => ({
        id: item.event?.id,
        type: item.event?.type,
        timestamp: item.event?.timestamp,
        details: item.event?.details,
        statusChange: item.event?.statusChange,
      }));
    }
  } catch (e) {
    console.error('[render-service] Error getting events:', e);
  }

  let deploys: any[] = [];
  let latestDeploy: any = null;
  try {
    const deploysResponse = await fetch(
      `${RENDER_API_URL}/services/${deployment.render_service_id}/deploys?limit=10`,
      { method: 'GET', headers }
    );

    if (deploysResponse.ok) {
      const deploysData = await deploysResponse.json();
      deploys = deploysData.map((item: any) => ({
        id: item.deploy?.id,
        status: item.deploy?.status,
        createdAt: item.deploy?.createdAt,
        finishedAt: item.deploy?.finishedAt,
        commit: item.deploy?.commit,
      }));
      
      if (deploys.length > 0) {
        latestDeploy = deploys[0];
      }
    }
  } catch (e) {
    console.error('[render-service] Error getting deploys:', e);
  }

  return { events, deploys, latestDeploy };
}

async function syncEnvVarsRenderService(
  deployment: any,
  body: RenderServiceRequest,
  headers: Record<string, string>
) {
  if (!deployment.render_service_id) {
    throw new Error('Service not yet created on Render');
  }

  console.log('[render-service] Syncing env vars for service:', deployment.render_service_id);

  const currentResponse = await fetch(
    `${RENDER_API_URL}/services/${deployment.render_service_id}/env-vars`,
    { method: 'GET', headers }
  );

  if (!currentResponse.ok) {
    const errorText = await currentResponse.text();
    throw new Error(`Failed to get current env vars: ${errorText}`);
  }

  const currentVars = await currentResponse.json();
  const currentVarsMap = new Map<string, string>();
  
  for (const v of currentVars) {
    if (v.envVar?.key) {
      currentVarsMap.set(v.envVar.key, v.envVar.value || '');
    }
  }

  console.log('[render-service] Current env vars count:', currentVarsMap.size);

  const keysToDelete = new Set(body.keysToDelete || []);
  for (const key of keysToDelete) {
    currentVarsMap.delete(key);
  }

  const newEnvVars = body.newEnvVars || [];
  for (const { key, value } of newEnvVars) {
    if (key && value) {
      currentVarsMap.set(key, value);
    }
  }

  const envVarsToSend = Array.from(currentVarsMap.entries()).map(([key, value]) => ({ key, value }));

  console.log('[render-service] Final env vars count:', envVarsToSend.length, 'Deleted:', keysToDelete.size);

  const response = await fetch(`${RENDER_API_URL}/services/${deployment.render_service_id}/env-vars`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(envVarsToSend),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to sync env vars: ${errorText}`);
  }

  const result = await response.json();
  return { 
    status: 'env_vars_synced', 
    note: 'Deploy the service to apply changes',
    envVarsCount: result.length,
    deletedCount: keysToDelete.size,
  };
}

async function updateServiceConfigRenderService(
  deployment: any,
  headers: Record<string, string>
) {
  if (!deployment.render_service_id) {
    throw new Error('Service not yet created on Render');
  }

  console.log('[render-service] Updating service config for:', deployment.render_service_id);

  const isStaticSite = isStaticSiteType(deployment.project_type);
  const serviceName = `${deployment.environment}-${deployment.name}`;

  const updatePayload: any = {
    name: serviceName,
    branch: deployment.branch || 'main',
    autoDeploy: 'no',
  };

  if (isStaticSite) {
    updatePayload.serviceDetails = {
      buildCommand: deployment.build_command || 'npm run build',
      publishPath: deployment.build_folder || 'dist',
    };
  } else {
    updatePayload.serviceDetails = {
      envSpecificDetails: {
        buildCommand: deployment.build_command || 'npm install',
        startCommand: deployment.run_command || 'npm start',
      },
    };

    // Add/update disk if enabled
    if (deployment.disk_enabled && deployment.disk_name) {
      updatePayload.serviceDetails.disk = {
        name: deployment.disk_name,
        mountPath: deployment.disk_mount_path || '/data',
        sizeGB: deployment.disk_size_gb || 1,
      };
    }
  }

  console.log('[render-service] Update payload:', JSON.stringify(updatePayload, null, 2));

  const response = await fetch(`${RENDER_API_URL}/services/${deployment.render_service_id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updatePayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[render-service] Update config error:', errorText);
    throw new Error(`Failed to update service config: ${errorText}`);
  }

  const result = await response.json();
  return { 
    status: 'config_updated', 
    note: 'Deploy the service to apply changes',
  };
}
