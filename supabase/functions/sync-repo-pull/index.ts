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

// Configuration for two-phase sync
const SMALL_FILE_THRESHOLD = 3 * 1024 * 1024; // 3MB - files below this go in Phase 1
const MAX_BATCH_BYTES = 8 * 1024 * 1024; // 8MB per batch for small files
const MAX_FILES_PER_BATCH = 10; // Max concurrent fetches per batch

interface GitHubTreeFile {
  path: string;
  sha: string;
  size: number;
  type: string;
}

interface FailedFile {
  path: string;
  size: number;
  error: string;
}

// Binary file extensions - stored as base64 with is_binary flag
const binaryExtensions = [
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.svg',
  '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.webm',
  '.exe', '.dll', '.so', '.dylib',
  '.pyc', '.class', '.o', '.obj',
  '.lock', '.lockb'
];

function isBinaryFile(path: string): boolean {
  const ext = path.toLowerCase().substring(path.lastIndexOf('.'));
  return binaryExtensions.includes(ext);
}

// Group small files into size-based batches for memory efficiency
function createSizeBasedBatches(files: GitHubTreeFile[]): GitHubTreeFile[][] {
  const batches: GitHubTreeFile[][] = [];
  let currentBatch: GitHubTreeFile[] = [];
  let currentBatchSize = 0;

  // Sort files by size (smallest first) to optimize batch packing
  const sortedFiles = [...files].sort((a, b) => (a.size || 0) - (b.size || 0));

  for (const file of sortedFiles) {
    const fileSize = file.size || 0;

    // Would adding this file exceed EITHER limit?
    const wouldExceedSize = currentBatchSize + fileSize > MAX_BATCH_BYTES;
    const wouldExceedCount = currentBatch.length >= MAX_FILES_PER_BATCH;

    if ((wouldExceedSize || wouldExceedCount) && currentBatch.length > 0) {
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

// Process a single file with memory-safe handling
async function fetchAndProcessFile(
  file: GitHubTreeFile,
  repo: { organization: string; repo: string },
  pat: string,
  targetSha: string
): Promise<{ path: string; content: string; commit_sha: string; is_binary: boolean } | null> {
  const blobUrl = `https://api.github.com/repos/${repo.organization}/${repo.repo}/git/blobs/${file.sha}`;
  
  const blobResponse = await fetch(blobUrl, {
    headers: {
      'Authorization': `token ${pat}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Pronghorn-Sync',
    },
  });

  if (!blobResponse.ok) {
    const errorText = await blobResponse.text();
    throw new Error(`GitHub API error: ${blobResponse.status} - ${errorText.substring(0, 100)}`);
  }

  const isBinary = isBinaryFile(file.path);

  if (isBinary) {
    // For binary files: use streaming regex extraction to avoid full JSON parse memory spike
    // This is critical for large binary files where JSON.parse would create huge memory overhead
    const responseText = await blobResponse.text();
    
    // Extract content field using regex - avoids parsing entire JSON into memory
    const contentMatch = responseText.match(/"content"\s*:\s*"([^"]*)"/);
    if (!contentMatch) {
      throw new Error('Could not extract content from GitHub blob response');
    }
    
    // Remove newlines from base64 content (GitHub formats with line breaks)
    const base64Content = contentMatch[1].replace(/\\n/g, '');
    
    // Clear the large string immediately
    // @ts-ignore - intentional memory optimization
    responseText = null;
    
    return {
      path: file.path,
      content: base64Content,
      commit_sha: targetSha,
      is_binary: true,
    };
  } else {
    // For text files: parse JSON and decode
    const blobData = await blobResponse.json();
    
    let content = blobData.content;
    if (blobData.encoding === 'base64') {
      try {
        const base64Clean = blobData.content.replace(/\n/g, '');
        const bytes = Uint8Array.from(atob(base64Clean), c => c.charCodeAt(0));
        content = new TextDecoder('utf-8').decode(bytes);
      } catch (e) {
        // If decode fails, treat as binary and store as-is
        console.log(`Treating ${file.path} as binary due to decode error`);
        return {
          path: file.path,
          content: blobData.content.replace(/\n/g, ''),
          commit_sha: targetSha,
          is_binary: true,
        };
      }
    }

    return {
      path: file.path,
      content: content,
      commit_sha: targetSha,
      is_binary: false,
    };
  }
}

// Process a large file with isolated memory and error handling
async function processLargeFileSafely(
  file: GitHubTreeFile,
  repo: { organization: string; repo: string },
  pat: string,
  targetSha: string,
  supabaseClient: any,
  repoId: string,
  shareToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Large File] Processing: ${file.path} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    const fileData = await fetchAndProcessFile(file, repo, pat, targetSha);
    
    if (!fileData) {
      return { success: false, error: 'Failed to fetch file content' };
    }

    // Write single file to database immediately
    const { error: upsertError } = await supabaseClient.rpc(
      'upsert_files_batch_with_token',
      {
        p_repo_id: repoId,
        p_files: [fileData],
        p_token: shareToken,
      }
    );

    if (upsertError) {
      return { success: false, error: `Database error: ${upsertError.message}` };
    }

    console.log(`[Large File] Success: ${file.path}`);
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Large File] Failed: ${file.path} - ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
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

    // Filter for files only (not directories) and cast to typed interface
    const allFiles: GitHubTreeFile[] = treeData.tree.filter((item: any) => item.type === 'blob');
    
    // Release tree data early to free memory
    treeData.tree = null;

    // ============================================
    // TWO-PHASE SYNC: Separate small and large files
    // ============================================
    const smallFiles = allFiles.filter(f => (f.size || 0) < SMALL_FILE_THRESHOLD);
    const largeFiles = allFiles.filter(f => (f.size || 0) >= SMALL_FILE_THRESHOLD);

    const smallFilesSize = smallFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    const largeFilesSize = largeFiles.reduce((sum, f) => sum + (f.size || 0), 0);

    console.log(`=== TWO-PHASE SYNC ===`);
    console.log(`Phase 1: ${smallFiles.length} small files (${(smallFilesSize / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`Phase 2: ${largeFiles.length} large files (${(largeFilesSize / 1024 / 1024).toFixed(2)} MB)`);

    let totalFetched = 0;
    let totalUpdated = 0;
    const failedFiles: FailedFile[] = [];

    // ============================================
    // PHASE 1: Process small files in batches
    // ============================================
    console.log(`--- PHASE 1: Small files ---`);
    const batches = createSizeBasedBatches(smallFiles);
    console.log(`Created ${batches.length} batches for small files`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchBytes = batch.reduce((sum, f) => sum + (f.size || 0), 0);
      console.log(`Batch ${batchIndex + 1}/${batches.length}: ${batch.length} files, ${(batchBytes / 1024 / 1024).toFixed(2)} MB`);

      // Fetch all files in this batch concurrently
      const batchContents = await Promise.all(batch.map(async (file) => {
        try {
          return await fetchAndProcessFile(file, repo, pat, targetSha!);
        } catch (err) {
          console.error(`Failed to fetch ${file.path}:`, err);
          failedFiles.push({
            path: file.path,
            size: file.size,
            error: err instanceof Error ? err.message : 'Unknown error'
          });
          return null;
        }
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
          // Add all files in batch to failed list
          validBatch.forEach(f => {
            if (f) {
              failedFiles.push({
                path: f.path,
                size: 0,
                error: `Database upsert failed: ${upsertError.message}`
              });
            }
          });
        } else {
          totalUpdated += result?.[0]?.files_updated || validBatch.length;
          console.log(`Batch ${batchIndex + 1} written to DB (${validBatch.length} files)`);
        }
      }

      // Explicitly help GC by clearing references
      validBatch.length = 0;
    }

    console.log(`Phase 1 complete: ${totalFetched} files synced`);

    // ============================================
    // PHASE 2: Process large files one at a time
    // ============================================
    if (largeFiles.length > 0) {
      console.log(`--- PHASE 2: Large files (${largeFiles.length}) ---`);
      
      for (let i = 0; i < largeFiles.length; i++) {
        const file = largeFiles[i];
        console.log(`[${i + 1}/${largeFiles.length}] Processing large file: ${file.path}`);
        
        const result = await processLargeFileSafely(
          file,
          repo,
          pat,
          targetSha!,
          supabaseClient,
          repoId,
          shareToken
        );

        if (result.success) {
          totalFetched++;
          totalUpdated++;
        } else {
          failedFiles.push({
            path: file.path,
            size: file.size,
            error: result.error || 'Unknown error'
          });
        }
      }
      
      console.log(`Phase 2 complete: ${largeFiles.length - failedFiles.filter(f => largeFiles.some(lf => lf.path === f.path)).length} large files synced`);
    }

    console.log(`=== SYNC COMPLETE ===`);
    console.log(`Total fetched: ${totalFetched}, Updated: ${totalUpdated}, Failed: ${failedFiles.length}`);

    if (failedFiles.length > 0) {
      console.log('Failed files:');
      failedFiles.forEach(f => console.log(`  - ${f.path}: ${f.error}`));
    }

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
        success: failedFiles.length === 0,
        partialSuccess: failedFiles.length > 0 && totalFetched > 0,
        commitSha: targetSha,
        filesCount: totalFetched,
        filesUpdated: totalUpdated,
        smallFilesProcessed: smallFiles.length,
        largeFilesProcessed: largeFiles.length,
        failedFiles: failedFiles,
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
