import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PullRequest {
  repoId: string;
  projectId: string;
  shareToken: string;
  commitSha?: string; // Optional: pull specific commit (for rollback)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { repoId, projectId, shareToken, commitSha }: PullRequest = await req.json();

    console.log('Pull request:', { repoId, projectId, commitSha: commitSha || 'latest' });

    // Validate project access
    const { error: accessError } = await supabaseClient.rpc('validate_project_access', {
      p_project_id: projectId,
      p_token: shareToken,
    });

    if (accessError) {
      console.error('Access validation error:', accessError);
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get repo details using RPC with token validation
    const { data: repoData, error: repoError } = await supabaseClient.rpc('get_repo_by_id_with_token', {
      p_repo_id: repoId,
      p_token: shareToken || null,
    });

    const repo = repoData && repoData.length > 0 ? repoData[0] : null;

    if (repoError || !repo) {
      console.error('Repo not found:', repoError);
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get PAT
    let pat: string;
    if (repo.is_default) {
      pat = Deno.env.get('GITHUB_PAT') ?? '';
      if (!pat) {
        return new Response(JSON.stringify({ error: 'GitHub PAT not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const { data: patData, error: patError } = await supabaseAdmin
        .from('repo_pats')
        .select('pat')
        .eq('repo_id', repoId)
        .single();

      if (patError || !patData) {
        return new Response(JSON.stringify({ error: 'PAT required for this repository' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      pat = patData.pat;
    }

    // Get commit SHA to pull from
    let targetSha = commitSha;
    if (!targetSha) {
      // Get latest commit on branch
      const refUrl = `https://api.github.com/repos/${repo.organization}/${repo.repo}/git/refs/heads/${repo.branch}`;
      const refResponse = await fetch(refUrl, {
        headers: {
          'Authorization': `token ${pat}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Pronghorn-Sync',
        },
      });

      if (!refResponse.ok) {
        console.error('Failed to get branch ref:', await refResponse.text());
        return new Response(JSON.stringify({ error: 'Failed to get branch reference' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const refData = await refResponse.json();
      targetSha = refData.object.sha;
    }

    console.log(`Pulling from ${repo.organization}/${repo.repo} at ${targetSha}`);

    // Get commit tree
    const commitUrl = `https://api.github.com/repos/${repo.organization}/${repo.repo}/git/commits/${targetSha}`;
    const commitResponse = await fetch(commitUrl, {
      headers: {
        'Authorization': `token ${pat}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Pronghorn-Sync',
      },
    });

    if (!commitResponse.ok) {
      console.error('Failed to get commit:', await commitResponse.text());
      return new Response(JSON.stringify({ error: 'Failed to get commit' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const commitData = await commitResponse.json();
    const treeSha = commitData.tree.sha;

    // Get tree contents recursively
    const treeUrl = `https://api.github.com/repos/${repo.organization}/${repo.repo}/git/trees/${treeSha}?recursive=1`;
    const treeResponse = await fetch(treeUrl, {
      headers: {
        'Authorization': `token ${pat}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Pronghorn-Sync',
      },
    });

    if (!treeResponse.ok) {
      console.error('Failed to get tree:', await treeResponse.text());
      return new Response(JSON.stringify({ error: 'Failed to get tree' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const treeData = await treeResponse.json();

    // Filter for files only (not directories)
    const files = treeData.tree.filter((item: any) => item.type === 'blob');

    console.log(`Found ${files.length} files to pull (including binary files)`);

    // Fetch content for each file
    const fileContents = await Promise.all(
      files.map(async (file: any) => {
        const blobUrl = `https://api.github.com/repos/${repo.organization}/${repo.repo}/git/blobs/${file.sha}`;
        const blobResponse = await fetch(blobUrl, {
          headers: {
            'Authorization': `token ${pat}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Pronghorn-Sync',
          },
        });

        if (!blobResponse.ok) {
          console.error(`Failed to get blob for ${file.path}`);
          return null;
        }

        const blobData = await blobResponse.json();
        
        // Store content as-is (base64 for binary files, plain text for text files)
        // Database will store base64 strings for binary files
        const content = blobData.encoding === 'base64' ? blobData.content : blobData.content;

        return {
          path: file.path,
          content: content,
          commit_sha: targetSha,
        };
      })
    );

    // Filter out null results (failed fetches)
    const validFiles = fileContents.filter((f) => f !== null);

    console.log(`Successfully fetched ${validFiles.length} files`);

    // Batch upsert files to database
    const { data: result, error: upsertError } = await supabaseClient.rpc(
      'upsert_files_batch_with_token',
      {
        p_repo_id: repoId,
        p_files: validFiles,
        p_token: shareToken,
      }
    );

    if (upsertError) {
      console.error('Failed to upsert files:', upsertError);
      return new Response(JSON.stringify({ error: 'Failed to update database' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Successfully pulled and synced ${validFiles.length} files`);

    return new Response(
      JSON.stringify({
        success: true,
        commitSha: targetSha,
        filesCount: validFiles.length,
        filesUpdated: result[0]?.files_updated || 0,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in sync-repo-pull:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
