import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, organization, repo, branch, pat, shareToken } = await req.json();

    // Allow null tokens for authenticated users (shareToken !== undefined)
    if (!projectId || !organization || !repo || !branch || shareToken === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Validate project access AND check role - must be editor or owner
    const { data: role, error: roleError } = await supabase.rpc('authorize_project_access', {
      p_project_id: projectId,
      p_token: shareToken
    });

    if (roleError || !role) {
      console.error('[link-existing-repo] Access denied:', roleError);
      throw new Error('Access denied');
    }

    // Check for editor role (owner has higher privileges than editor)
    if (role !== 'owner' && role !== 'editor') {
      console.error('[link-existing-repo] Insufficient permissions:', role);
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions: editor role required to link repositories' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify repository exists and is accessible
    const testPat = pat || Deno.env.get('GITHUB_PAT');
    if (!testPat) {
      throw new Error('GitHub PAT required for accessing repository');
    }

    const repoCheckResponse = await fetch(`https://api.github.com/repos/${organization}/${repo}`, {
      headers: {
        'Authorization': `token ${testPat}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!repoCheckResponse.ok) {
      throw new Error('Repository not found or not accessible');
    }

    const repoData = await repoCheckResponse.json();

    // Verify branch exists
    const branchCheckResponse = await fetch(`https://api.github.com/repos/${organization}/${repo}/branches/${branch}`, {
      headers: {
        'Authorization': `token ${testPat}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!branchCheckResponse.ok) {
      throw new Error(`Branch '${branch}' not found in repository`);
    }

    // Link repository to project
    const { data: newRepo, error: repoError } = await supabase.rpc('create_project_repo_with_token', {
      p_project_id: projectId,
      p_token: shareToken,
      p_organization: organization,
      p_repo: repo,
      p_branch: branch,
      p_is_default: false, // User repos are not default
      p_is_prime: false // User-linked repos are not prime by default
    });

    if (repoError) {
      console.error('Error linking repository:', repoError);
      throw new Error('Failed to link repository to project');
    }

    // Store PAT if provided (encrypted in database)
    if (pat) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Authentication required to store PAT');
      }

      const { error: patError } = await supabaseAdmin
        .from('repo_pats')
        .insert({
          user_id: user.id,
          repo_id: newRepo.id,
          pat: pat
        });

      if (patError) {
        console.error('Error storing PAT:', patError);
        // Non-fatal - repo is linked, just can't store PAT
      }
    }

    // Pull files from the repository into database
    const { error: pullError } = await supabase.functions.invoke('sync-repo-pull', {
      body: {
        projectId,
        repoId: newRepo.id,
        shareToken
      }
    });

    if (pullError) {
      console.error('Error pulling repository files:', pullError);
      // Non-fatal - repo is linked, just log the error
    }

    console.log(`Linked existing repository: ${organization}/${repo}#${branch}`);

    // Broadcast repos_refresh event for realtime sync
    try {
      await supabase.channel(`project_repos-${projectId}`).send({
        type: 'broadcast',
        event: 'repos_refresh',
        payload: { repoId: newRepo.id }
      });
    } catch (broadcastError) {
      console.log('[link-existing-repo] Broadcast failed (non-fatal):', broadcastError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        repo: newRepo,
        githubUrl: repoData.html_url
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in link-existing-repo:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
