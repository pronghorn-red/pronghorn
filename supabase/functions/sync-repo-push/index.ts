import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushRequest {
  repoId: string;
  projectId: string;
  shareToken: string;
  branch: string; // Target branch for push
  commitMessage?: string;
  filePaths?: string[]; // Optional: push only specific files
  forcePush?: boolean; // Force push flag
}

interface RepoFile {
  path: string;
  content: string;
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

    const { repoId, projectId, shareToken, branch, commitMessage, filePaths, forcePush = false }: PushRequest = await req.json();

    console.log('Push request:', { repoId, projectId, branch, filePaths: filePaths?.length || 'all', forcePush });

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

    // Get files to push using RPC with token validation
    const { data: filesToPush, error: filesError } = await supabaseClient.rpc('get_repo_files_with_token', {
      p_repo_id: repoId,
      p_token: shareToken || null,
      p_file_paths: filePaths && filePaths.length > 0 ? filePaths : null,
    });

    if (filesError) {
      console.error('Error fetching files:', filesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch files' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!filesToPush || filesToPush.length === 0) {
      return new Response(JSON.stringify({ error: 'No files to push' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Pushing ${filesToPush.length} files to ${repo.organization}/${repo.repo} on branch ${branch}`);

    // Check if target branch exists
    const targetBranchUrl = `https://api.github.com/repos/${repo.organization}/${repo.repo}/git/refs/heads/${branch}`;
    const targetBranchResponse = await fetch(targetBranchUrl, {
      headers: {
        'Authorization': `token ${pat}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Pronghorn-Sync',
      },
    });

    let currentSha: string;

    if (!targetBranchResponse.ok) {
      // Branch doesn't exist, create it from main
      console.log(`Branch ${branch} doesn't exist, creating from main`);
      
      const mainRefUrl = `https://api.github.com/repos/${repo.organization}/${repo.repo}/git/refs/heads/main`;
      const mainRefResponse = await fetch(mainRefUrl, {
        headers: {
          'Authorization': `token ${pat}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Pronghorn-Sync',
        },
      });

      if (!mainRefResponse.ok) {
        console.error('Failed to get main branch:', await mainRefResponse.text());
        return new Response(JSON.stringify({ error: 'Failed to get main branch for creating new branch' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const mainRefData = await mainRefResponse.json();
      currentSha = mainRefData.object.sha;

      // Create new branch
      const createBranchUrl = `https://api.github.com/repos/${repo.organization}/${repo.repo}/git/refs`;
      const createBranchResponse = await fetch(createBranchUrl, {
        method: 'POST',
        headers: {
          'Authorization': `token ${pat}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Pronghorn-Sync',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha: currentSha,
        }),
      });

      if (!createBranchResponse.ok) {
        console.error('Failed to create branch:', await createBranchResponse.text());
        return new Response(JSON.stringify({ error: `Failed to create branch ${branch}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Successfully created branch ${branch} from main`);
    } else {
      const refData = await targetBranchResponse.json();
      currentSha = refData.object.sha;
    }

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

    // Get the current tree to identify deletions
    const currentTreeUrl = `https://api.github.com/repos/${repo.organization}/${repo.repo}/git/trees/${baseTreeSha}?recursive=1`;
    const currentTreeResponse = await fetch(currentTreeUrl, {
      headers: {
        'Authorization': `token ${pat}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Pronghorn-Sync',
      },
    });

    if (!currentTreeResponse.ok) {
      console.error('Failed to get current tree:', await currentTreeResponse.text());
    }

    const currentTreeData = await currentTreeResponse.json();
    // Only track actual files (blobs), not folders (trees)
    const currentFiles = new Set(
      currentTreeData.tree
        ?.filter((item: any) => item.type === 'blob')
        .map((item: any) => item.path) || []
    );
    const dbFilePaths = new Set(filesToPush.map((f: RepoFile) => f.path));

    // Create blobs for each file
    const tree = await Promise.all(
      filesToPush.map(async (file: RepoFile) => {
        // Detect if content is base64 (binary file) by checking if it's valid base64 and substantial length
        const isBase64 = /^[A-Za-z0-9+/\n\r]+=*$/.test(file.content.replace(/\s/g, '')) && file.content.length > 100;
        
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
            encoding: isBase64 ? 'base64' : 'utf-8',
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

    // Handle deletions: mark files that are in GitHub but not in DB for removal
    const deletions = Array.from(currentFiles).filter(path => !dbFilePaths.has(path as string));
    deletions.forEach(path => {
      tree.push({
        path: path as string,
        mode: '100644',
        type: 'blob',
        sha: null, // null sha means delete this file
      });
    });

    if (deletions.length > 0) {
      console.log(`Deleting ${deletions.length} files from GitHub:`, deletions);
    }

    // Create new tree based on the current Git tree so GitHub can compute a proper diff
    // We use base_tree and send all DB-backed files plus explicit deletions
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
        tree,
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

    // Update branch ref (with force push support)
    const updateRefUrl = `https://api.github.com/repos/${repo.organization}/${repo.repo}/git/refs/heads/${branch}`;
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
        force: forcePush, // Use force push flag from request
      }),
    });

    if (!updateRefResponse.ok) {
      console.error('Failed to update ref:', await updateRefResponse.text());
      return new Response(JSON.stringify({ error: 'Failed to update branch' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Successfully pushed to ${repo.organization}/${repo.repo} (branch: ${branch}): ${newCommitData.sha}`);

    // Log commit to database
    try {
      await supabaseClient.rpc('log_repo_commit_with_token', {
        p_repo_id: repoId,
        p_token: shareToken,
        p_branch: branch,
        p_commit_sha: newCommitData.sha,
        p_commit_message: commitMessage || `Update ${filesToPush.length} file(s) via Pronghorn`,
        p_files_changed: filesToPush.length,
      });
    } catch (logError) {
      console.error('Failed to log commit:', logError);
      // Don't fail the entire operation if logging fails
    }


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
