import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeleteProjectRequest {
  projectId: string;
  shareToken?: string;
  deleteGitHubRepos?: boolean;
  deleteDeployments?: boolean;
  deleteDatabases?: boolean;
}

interface DeletionResult {
  category: string;
  success: boolean;
  count?: number;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });
    
    // Admin client for operations that need to bypass RLS
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body: DeleteProjectRequest = await req.json();
    const { projectId, shareToken, deleteGitHubRepos, deleteDeployments, deleteDatabases } = body;

    console.log(`[delete-project] Starting deletion for project: ${projectId}`);
    console.log(`[delete-project] Options - GitHub: ${deleteGitHubRepos}, Deployments: ${deleteDeployments}, Databases: ${deleteDatabases}`);

    if (!projectId) {
      throw new Error('projectId is required');
    }

    // Validate owner access - this will throw if not owner
    const { data: role, error: roleError } = await supabase.rpc('require_role', {
      p_project_id: projectId,
      p_token: shareToken || null,
      p_min_role: 'owner',
    });

    if (roleError) {
      console.error('[delete-project] Access denied:', roleError);
      throw new Error('Access denied. Only project owners can delete projects.');
    }

    console.log(`[delete-project] Access validated, user role: ${role}`);

    const results: DeletionResult[] = [];
    const activityLogs: Array<{ type: string; message: string; status: string; metadata?: Record<string, unknown> }> = [];

    // Step 1: Delete GitHub repositories if requested
    if (deleteGitHubRepos) {
      console.log('[delete-project] Deleting GitHub repositories...');
      try {
        const { data: repos, error: reposError } = await supabase.rpc('get_repos_with_token', {
          p_project_id: projectId,
          p_token: shareToken || null,
        });

        if (reposError) throw reposError;

        const repoCount = repos?.length || 0;
        let deletedCount = 0;
        const errors: string[] = [];

        for (const repo of repos || []) {
          try {
            // Get PAT for this repo (need admin to read PATs)
            const { data: patData, error: patError } = await supabaseAdmin
              .from('repo_pats')
              .select('pat')
              .eq('repo_id', repo.id)
              .maybeSingle();

            if (patError || !patData?.pat) {
              console.log(`[delete-project] No PAT found for repo ${repo.organization}/${repo.repo}, skipping GitHub deletion`);
              errors.push(`No PAT for ${repo.organization}/${repo.repo}`);
              continue;
            }

            // Delete from GitHub
            const githubUrl = `https://api.github.com/repos/${repo.organization}/${repo.repo}`;
            const response = await fetch(githubUrl, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${patData.pat}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
              },
            });

            if (response.ok || response.status === 404) {
              deletedCount++;
              console.log(`[delete-project] Deleted GitHub repo: ${repo.organization}/${repo.repo}`);
            } else {
              const errorText = await response.text();
              console.error(`[delete-project] Failed to delete ${repo.organization}/${repo.repo}:`, errorText);
              errors.push(`Failed to delete ${repo.organization}/${repo.repo}: ${response.status}`);
            }
          } catch (repoError) {
            const msg = repoError instanceof Error ? repoError.message : String(repoError);
            errors.push(`Error deleting ${repo.organization}/${repo.repo}: ${msg}`);
          }
        }

        results.push({
          category: 'github_repos',
          success: errors.length === 0,
          count: deletedCount,
          error: errors.length > 0 ? errors.join('; ') : undefined,
        });

        if (deletedCount > 0) {
          activityLogs.push({
            type: 'delete',
            message: `Deleted ${deletedCount} GitHub repositories`,
            status: 'success',
            metadata: { category: 'github_repos', count: deletedCount },
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[delete-project] GitHub deletion error:', msg);
        results.push({ category: 'github_repos', success: false, error: msg });
      }
    }

    // Step 2: Delete Render deployments if requested
    if (deleteDeployments) {
      console.log('[delete-project] Deleting cloud deployments...');
      try {
        const { data: deployments, error: deploymentsError } = await supabase.rpc('get_deployments_with_token', {
          p_project_id: projectId,
          p_token: shareToken || null,
        });

        if (deploymentsError) throw deploymentsError;

        let deletedCount = 0;
        const errors: string[] = [];

        for (const deployment of deployments || []) {
          if (deployment.render_service_id) {
            try {
              // Call render-service edge function to delete
              const { data: deleteResult, error: deleteError } = await supabase.functions.invoke('render-service', {
                body: {
                  action: 'delete',
                  deploymentId: deployment.id,
                  shareToken: shareToken || null,
                },
              });

              if (deleteError) {
                errors.push(`Failed to delete deployment ${deployment.name}: ${deleteError.message}`);
              } else {
                deletedCount++;
                console.log(`[delete-project] Deleted deployment: ${deployment.name}`);
              }
            } catch (depError) {
              const msg = depError instanceof Error ? depError.message : String(depError);
              errors.push(`Error deleting ${deployment.name}: ${msg}`);
            }
          }
        }

        results.push({
          category: 'deployments',
          success: errors.length === 0,
          count: deletedCount,
          error: errors.length > 0 ? errors.join('; ') : undefined,
        });

        if (deletedCount > 0) {
          activityLogs.push({
            type: 'delete',
            message: `Deleted ${deletedCount} cloud deployments`,
            status: 'success',
            metadata: { category: 'deployments', count: deletedCount },
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[delete-project] Deployment deletion error:', msg);
        results.push({ category: 'deployments', success: false, error: msg });
      }
    }

    // Step 3: Delete Render databases if requested
    if (deleteDatabases) {
      console.log('[delete-project] Deleting cloud databases...');
      try {
        const { data: databases, error: databasesError } = await supabase.rpc('get_databases_with_token', {
          p_project_id: projectId,
          p_token: shareToken || null,
        });

        if (databasesError) throw databasesError;

        let deletedCount = 0;
        const errors: string[] = [];

        for (const database of databases || []) {
          if (database.render_postgres_id) {
            try {
              // Call render-database edge function to delete
              const { data: deleteResult, error: deleteError } = await supabase.functions.invoke('render-database', {
                body: {
                  action: 'delete',
                  databaseId: database.id,
                  shareToken: shareToken || null,
                },
              });

              if (deleteError) {
                errors.push(`Failed to delete database ${database.name}: ${deleteError.message}`);
              } else {
                deletedCount++;
                console.log(`[delete-project] Deleted database: ${database.name}`);
              }
            } catch (dbError) {
              const msg = dbError instanceof Error ? dbError.message : String(dbError);
              errors.push(`Error deleting ${database.name}: ${msg}`);
            }
          }
        }

        results.push({
          category: 'databases',
          success: errors.length === 0,
          count: deletedCount,
          error: errors.length > 0 ? errors.join('; ') : undefined,
        });

        if (deletedCount > 0) {
          activityLogs.push({
            type: 'delete',
            message: `Deleted ${deletedCount} cloud databases`,
            status: 'success',
            metadata: { category: 'databases', count: deletedCount },
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[delete-project] Database deletion error:', msg);
        results.push({ category: 'databases', success: false, error: msg });
      }
    }

    // Log activities before final deletion (since activity_logs will be deleted too)
    if (activityLogs.length > 0) {
      try {
        await supabase.functions.invoke('log-activity', {
          body: {
            projectId,
            shareToken: shareToken || null,
            logs: activityLogs,
          },
        });
      } catch (logError) {
        console.error('[delete-project] Failed to log activities:', logError);
        // Continue with deletion even if logging fails
      }
    }

    // Step 4: Delete project and all database records
    console.log('[delete-project] Deleting project and all database records...');
    const { error: deleteError } = await supabase.rpc('delete_project_with_token', {
      p_project_id: projectId,
      p_token: shareToken || null,
    });

    if (deleteError) {
      console.error('[delete-project] Project deletion failed:', deleteError);
      throw new Error(`Failed to delete project: ${deleteError.message}`);
    }

    results.push({
      category: 'project_data',
      success: true,
    });

    console.log('[delete-project] Project deletion completed successfully');

    return new Response(JSON.stringify({
      success: true,
      results,
      message: 'Project deleted successfully',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[delete-project] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
