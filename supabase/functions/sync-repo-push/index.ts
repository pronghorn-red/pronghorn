import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushRequest {
  repoId: string;
  projectId: string;
  shareToken: string;
  commitMessage?: string;
  filePaths?: string[]; // Optional: push only specific files
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

    const { repoId, projectId, shareToken, commitMessage, filePaths }: PushRequest = await req.json();

    console.log('Push request:', { repoId, projectId, filePaths: filePaths?.length || 'all' });

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

    // Get repo details
    const { data: repo, error: repoError } = await supabaseClient
      .from('project_repos')
      .select('*')
      .eq('id', repoId)
      .single();

    if (repoError || !repo) {
      console.error('Repo not found:', repoError);
      return new Response(JSON.stringify({ error: 'Repository not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get PAT (default or user-provided)
    let pat: string;
    if (repo.is_default) {
      // Use system PAT for default pronghorn-red repo
      pat = Deno.env.get('GITHUB_PAT') ?? '';
      if (!pat) {
        return new Response(JSON.stringify({ error: 'GitHub PAT not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      // Get user PAT from database (using service role to bypass RLS)
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

    // Get files to push
    const { data: files, error: filesError } = await supabaseClient
      .from('repo_files')
      .select('path, content')
      .eq('repo_id', repoId)
      .in('path', filePaths || []);

    if (filesError) {
      console.error('Error fetching files:', filesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch files' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If no specific files, get all files
    const filesToPush = filePaths
      ? files
      : (await supabaseClient
          .from('repo_files')
          .select('path, content')
          .eq('repo_id', repoId)).data || [];

    if (!filesToPush || filesToPush.length === 0) {
      return new Response(JSON.stringify({ error: 'No files to push' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Pushing ${filesToPush.length} files to ${repo.organization}/${repo.repo}`);

    // Get current branch ref
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
    const currentSha = refData.object.sha;

    // Get current commit
    const commitUrl = `https://api.github.com/repos/${repo.organization}/${repo.repo}/git/commits/${currentSha}`;
    const commitResponse = await fetch(commitUrl, {
      headers: {
        'Authorization': `token ${pat}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Pronghorn-Sync',
      },
    });

    if (!commitResponse.ok) {
      console.error('Failed to get commit:', await commitResponse.text());
      return new Response(JSON.stringify({ error: 'Failed to get current commit' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const commitData = await commitResponse.json();
    const baseTreeSha = commitData.tree.sha;

    // Create blobs for each file
    const tree = await Promise.all(
      filesToPush.map(async (file) => {
        const blobUrl = `https://api.github.com/repos/${repo.organization}/${repo.repo}/git/blobs`;
        const blobResponse = await fetch(blobUrl, {
          method: 'POST',
          headers: {
            'Authorization': `token ${pat}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Pronghorn-Sync',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: file.content,
            encoding: 'utf-8',
          }),
        });

        if (!blobResponse.ok) {
          throw new Error(`Failed to create blob for ${file.path}: ${await blobResponse.text()}`);
        }

        const blobData = await blobResponse.json();
        return {
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: blobData.sha,
        };
      })
    );

    // Create new tree
    const treeUrl = `https://api.github.com/repos/${repo.organization}/${repo.repo}/git/trees`;
    const treeResponse = await fetch(treeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `token ${pat}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Pronghorn-Sync',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: tree,
      }),
    });

    if (!treeResponse.ok) {
      console.error('Failed to create tree:', await treeResponse.text());
      return new Response(JSON.stringify({ error: 'Failed to create tree' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const treeData = await treeResponse.json();

    // Create new commit
    const newCommitUrl = `https://api.github.com/repos/${repo.organization}/${repo.repo}/git/commits`;
    const newCommitResponse = await fetch(newCommitUrl, {
      method: 'POST',
      headers: {
        'Authorization': `token ${pat}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Pronghorn-Sync',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: commitMessage || `Update ${filesToPush.length} file(s) via Pronghorn`,
        tree: treeData.sha,
        parents: [currentSha],
      }),
    });

    if (!newCommitResponse.ok) {
      console.error('Failed to create commit:', await newCommitResponse.text());
      return new Response(JSON.stringify({ error: 'Failed to create commit' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newCommitData = await newCommitResponse.json();

    // Update branch ref
    const updateRefUrl = `https://api.github.com/repos/${repo.organization}/${repo.repo}/git/refs/heads/${repo.branch}`;
    const updateRefResponse = await fetch(updateRefUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${pat}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Pronghorn-Sync',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sha: newCommitData.sha,
        force: false,
      }),
    });

    if (!updateRefResponse.ok) {
      console.error('Failed to update ref:', await updateRefResponse.text());
      return new Response(JSON.stringify({ error: 'Failed to update branch' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update last_commit_sha in database
    const { error: updateError } = await supabaseClient
      .from('repo_files')
      .update({ last_commit_sha: newCommitData.sha })
      .eq('repo_id', repoId)
      .in('path', filesToPush.map((f) => f.path));

    if (updateError) {
      console.error('Failed to update commit SHA in database:', updateError);
    }

    console.log(`Successfully pushed to ${repo.organization}/${repo.repo}: ${newCommitData.sha}`);

    return new Response(
      JSON.stringify({
        success: true,
        commitSha: newCommitData.sha,
        filesCount: filesToPush.length,
        commitUrl: newCommitData.html_url,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in sync-repo-push:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
