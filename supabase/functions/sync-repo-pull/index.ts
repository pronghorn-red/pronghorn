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

// Process items in batches to avoid memory limits
async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${batch.length} items)`);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
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

    // Validate project access using new RBAC pattern - requires viewer role for pull
    const { data: accessRole, error: accessError } = await supabaseClient.rpc('authorize_project_access', {
      p_project_id: projectId,
      p_token: shareToken || null,
    });

    if (accessError || !accessRole) {
      console.error('Access validation error:', accessError);
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pull requires editor role since it overwrites repo_files
    const roleHierarchy = { 'viewer': 1, 'editor': 2, 'owner': 3 };
    if (roleHierarchy[accessRole as keyof typeof roleHierarchy] < roleHierarchy['editor']) {
      return new Response(JSON.stringify({ error: 'Editor role required for pull operations' }), {
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

    // Binary file extensions - stored as base64 with is_binary flag
    const binaryExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp',
      '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
      '.woff', '.woff2', '.ttf', '.eot', '.otf',
      '.mp3', '.mp4', '.wav', '.avi', '.mov', '.webm',
      '.exe', '.dll', '.so', '.dylib',
      '.pyc', '.class', '.o', '.obj',
      '.lock', '.lockb'
    ];

    // Filter for files only (not directories)
    const files = treeData.tree.filter((item: any) => item.type === 'blob');

    console.log(`Found ${files.length} files to pull`);

    // Fetch content for each file in batches to avoid memory limits
    const FETCH_BATCH_SIZE = 15; // Process 15 files at a time
    console.log(`Fetching ${files.length} files in batches of ${FETCH_BATCH_SIZE}`);

    const fileContents = await processBatches(files, FETCH_BATCH_SIZE, async (file: any) => {
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
      
      // Check if file is binary by extension
      const ext = file.path.toLowerCase().substring(file.path.lastIndexOf('.'));
      const isBinary = binaryExtensions.includes(ext);
      
      let content = blobData.content;
      if (blobData.encoding === 'base64') {
        if (isBinary) {
          // Keep binary files as base64 encoded
          content = blobData.content.replace(/\n/g, '');
        } else {
          // Decode text files to plain text with proper UTF-8 handling
          try {
            const base64Clean = blobData.content.replace(/\n/g, '');
            const bytes = Uint8Array.from(atob(base64Clean), c => c.charCodeAt(0));
            content = new TextDecoder('utf-8').decode(bytes);
          } catch (e) {
            // If decode fails, treat as binary
            console.log(`Treating ${file.path} as binary due to decode error`);
            return {
              path: file.path,
              content: blobData.content.replace(/\n/g, ''),
              commit_sha: targetSha,
              is_binary: true,
            };
          }
        }
      }

      return {
        path: file.path,
        content: content,
        commit_sha: targetSha,
        is_binary: isBinary,
      };
    });

    // Filter out null results (failed fetches)
    const validFiles = fileContents.filter((f) => f !== null);

    console.log(`Successfully fetched ${validFiles.length} files`);

    // Batch upsert files to database (in chunks of 100 for very large repos)
    const DB_BATCH_SIZE = 100;
    let totalUpdated = 0;

    for (let i = 0; i < validFiles.length; i += DB_BATCH_SIZE) {
      const batch = validFiles.slice(i, i + DB_BATCH_SIZE);
      console.log(`Upserting DB batch ${Math.floor(i / DB_BATCH_SIZE) + 1}/${Math.ceil(validFiles.length / DB_BATCH_SIZE)} (${batch.length} files)`);
      
      const { data: result, error: upsertError } = await supabaseClient.rpc(
        'upsert_files_batch_with_token',
        {
          p_repo_id: repoId,
          p_files: batch,
          p_token: shareToken,
        }
      );

      if (upsertError) {
        console.error('Failed to upsert files batch:', upsertError);
        return new Response(JSON.stringify({ error: 'Failed to update database' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      totalUpdated += result?.[0]?.files_updated || batch.length;
    }

    console.log(`Successfully pulled and synced ${validFiles.length} files`);

    // Broadcast files_refresh event after successful pull
    try {
      console.log(`Broadcasting files_refresh for repo: ${repoId}`);
      const filesChannel = supabaseClient.channel(`repo-files-${repoId}`);
      await filesChannel.subscribe();
      await filesChannel.send({
        type: "broadcast",
        event: "files_refresh",
        payload: { repoId, action: "pull", timestamp: Date.now() },
      });
      await supabaseClient.removeChannel(filesChannel);
    } catch (broadcastError) {
      console.error("Failed to broadcast files_refresh event:", broadcastError);
      // Don't fail the operation if broadcast fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        commitSha: targetSha,
        filesCount: validFiles.length,
        filesUpdated: totalUpdated,
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