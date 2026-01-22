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

// Configuration for size-based batching
const MAX_BATCH_BYTES = 25 * 1024 * 1024; // 25MB per batch
const LARGE_FILE_THRESHOLD = 25 * 1024 * 1024; // Files >= 25MB processed individually

interface GitHubTreeFile {
  path: string;
  sha: string;
  size: number;
  type: string;
}

// Group files into size-based batches for memory efficiency
function createSizeBasedBatches(files: GitHubTreeFile[]): GitHubTreeFile[][] {
  const batches: GitHubTreeFile[][] = [];
  let currentBatch: GitHubTreeFile[] = [];
  let currentBatchSize = 0;

  // Sort files by size (smallest first) to optimize batch packing
  const sortedFiles = [...files].sort((a, b) => (a.size || 0) - (b.size || 0));

  for (const file of sortedFiles) {
    const fileSize = file.size || 0;

    // Large files get their own batch
    if (fileSize >= LARGE_FILE_THRESHOLD) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentBatchSize = 0;
      }
      batches.push([file]); // Single-file batch
      continue;
    }

    // Would adding this file exceed the limit?
    if (currentBatchSize + fileSize > MAX_BATCH_BYTES && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchSize = 0;
    }

    currentBatch.push(file);
    currentBatchSize += fileSize;
  }

  // Don't forget the last batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
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

    // Filter for files only (not directories) and cast to typed interface
    const files: GitHubTreeFile[] = treeData.tree.filter((item: any) => item.type === 'blob');

    console.log(`Found ${files.length} files to pull`);

    // Calculate total size for logging
    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    console.log(`Total repo size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

    // Create size-based batches for memory efficiency
    const batches = createSizeBasedBatches(files);
    console.log(`Created ${batches.length} size-based batches`);

    let totalFetched = 0;
    let totalUpdated = 0;

    // Process each batch: fetch files, immediately write to DB, then release memory
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchBytes = batch.reduce((sum, f) => sum + (f.size || 0), 0);
      console.log(`Processing batch ${batchIndex + 1}/${batches.length}: ${batch.length} files, ${(batchBytes / 1024 / 1024).toFixed(2)} MB`);

      // Fetch all files in this batch concurrently (safe because we sized it)
      const batchContents = await Promise.all(batch.map(async (file) => {
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
      }));

      // Filter out failed fetches
      const validBatch = batchContents.filter((f) => f !== null);
      totalFetched += validBatch.length;

      // IMMEDIATELY write this batch to database to free memory
      if (validBatch.length > 0) {
        const { data: result, error: upsertError } = await supabaseClient.rpc(
          'upsert_files_batch_with_token',
          {
            p_repo_id: repoId,
            p_files: validBatch,
            p_token: shareToken,
          }
        );

        if (upsertError) {
          console.error('Failed to upsert batch:', upsertError);
          throw new Error(`Database upsert failed for batch ${batchIndex + 1}: ${upsertError.message}`);
        }

        totalUpdated += result?.[0]?.files_updated || validBatch.length;
        console.log(`Batch ${batchIndex + 1} written to DB (${validBatch.length} files)`);
      }

      // Memory is freed here as batchContents goes out of scope
    }

    console.log(`Successfully pulled ${totalFetched} files, updated ${totalUpdated}`);

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
        filesCount: totalFetched,
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
