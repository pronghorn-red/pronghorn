import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HARD LIMIT: 15MB max for this function (150MB env / ~10x overhead = 15MB safe)
const MAX_FILE_SIZE = 15 * 1024 * 1024;

interface LargeFileRequest {
  repoId: string;
  projectId: string;
  shareToken: string;
  file: {
    path: string;
    size: number;
    rawUrl: string;
    commitSha: string;
  };
  pat: string;
}

// Binary file extensions
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

    const { repoId, projectId, shareToken, file, pat }: LargeFileRequest = await req.json();

    console.log(`[sync-large-file] Processing: ${file.path} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    // CHECK SIZE LIMIT FIRST - before any expensive operations
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      const limitMB = (MAX_FILE_SIZE / 1024 / 1024).toFixed(0);
      console.log(`[sync-large-file] SKIPPED: ${file.path} (${sizeMB}MB > ${limitMB}MB limit)`);
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          path: file.path,
          error: `File too large (${sizeMB}MB). Maximum supported size is ${limitMB}MB. Use local git clone for large binaries.`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate project access - requires editor role
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

    const roleHierarchy = { 'viewer': 1, 'editor': 2, 'owner': 3 };
    if (roleHierarchy[accessRole as keyof typeof roleHierarchy] < roleHierarchy['editor']) {
      return new Response(JSON.stringify({ error: 'Editor role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the file from GitHub Raw API
    console.log(`[MEMORY] Starting fetch: ${file.rawUrl}`);
    
    const response = await fetch(file.rawUrl, {
      headers: {
        'Authorization': `token ${pat}`,
        'User-Agent': 'Pronghorn-Sync',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub Raw API error: ${response.status} - ${errorText.substring(0, 100)}`);
    }

    const isBinary = isBinaryFile(file.path);
    let content: string;

    if (isBinary) {
      // STREAMING BASE64 ENCODING - Process in chunks to avoid OOM
      console.log(`[MEMORY] Starting STREAMING binary fetch: ${file.path}`);
      
      if (!response.body) {
        throw new Error('Response body is null - cannot stream');
      }
      
      const reader = response.body.getReader();
      const base64Chunks: string[] = [];
      let bytesRead = 0;
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          bytesRead += value.length;
          // Encode this chunk immediately
          base64Chunks.push(encodeBase64(value));
          
          // Log progress every ~5MB
          if (bytesRead % (5 * 1024 * 1024) < 65536) {
            console.log(`[MEMORY] Streamed ${(bytesRead / 1024 / 1024).toFixed(2)} MB of ${file.path}`);
          }
        }
      } finally {
        reader.releaseLock();
      }
      
      console.log(`[MEMORY] Stream complete: ${(bytesRead / 1024 / 1024).toFixed(2)} MB, ${base64Chunks.length} chunks`);
      
      // Join all base64 chunks
      content = base64Chunks.join('');
      base64Chunks.length = 0; // Release for GC
      
      console.log(`[MEMORY] Base64 ready: ${(content.length / 1024 / 1024).toFixed(2)} MB string`);
    } else {
      // Text file - just get the text
      content = await response.text();
      console.log(`[MEMORY] Text file loaded: ${file.path} (${(content.length / 1024).toFixed(0)} KB)`);
    }

    // Insert into database
    console.log(`[DB] Upserting file: ${file.path}`);
    
    const { error: upsertError } = await supabaseClient.rpc(
      'upsert_files_batch_with_token',
      {
        p_repo_id: repoId,
        p_files: [{
          path: file.path,
          content: content,
          commit_sha: file.commitSha,
          is_binary: isBinary,
        }],
        p_token: shareToken,
      }
    );

    if (upsertError) {
      console.error(`[DB] Upsert error:`, upsertError);
      throw new Error(`Database error: ${upsertError.message}`);
    }

    console.log(`[sync-large-file] SUCCESS: ${file.path}`);

    return new Response(
      JSON.stringify({
        success: true,
        path: file.path,
        size: file.size,
        isBinary,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[sync-large-file] Error:', err);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
