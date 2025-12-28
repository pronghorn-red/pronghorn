import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Binary file extensions that should not be decoded as text
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, repoName, sourceOrg, sourceRepo, sourceBranch, shareToken, isPrivate } = await req.json();

    // Allow null tokens for authenticated users (shareToken !== undefined)
    if (!projectId || !repoName || !sourceOrg || !sourceRepo || shareToken === undefined) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const branch = sourceBranch || "main";

    // Generate unique slugified repo name (same pattern as create-empty-repo)
    const baseSlug = repoName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-");
    const uniqueSuffix = crypto.randomUUID().split("-")[0];
    const finalRepoName = `${baseSlug}-${uniqueSuffix}`;

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    // Validate project access AND check role - must be editor or owner
    const { data: role, error: roleError } = await supabase.rpc("authorize_project_access", {
      p_project_id: projectId,
      p_token: shareToken,
    });

    if (roleError || !role) {
      console.error("[clone-public-repo] Access denied:", roleError);
      throw new Error("Access denied");
    }

    // Check for editor role (owner has higher privileges than editor)
    if (role !== "owner" && role !== "editor") {
      console.error("[clone-public-repo] Insufficient permissions:", role);
      return new Response(
        JSON.stringify({ error: "Insufficient permissions: editor role required to create repositories" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get GitHub PAT
    const githubPat = Deno.env.get("GITHUB_PAT");
    if (!githubPat) {
      throw new Error("GitHub PAT not configured");
    }

    const organization = "pronghorn-cloud";

    console.log(`[clone-public-repo] Cloning ${sourceOrg}/${sourceRepo} (${branch}) to ${organization}/${finalRepoName}`);

    // Create empty repository in pronghorn-cloud
    const createRepoResponse = await fetch(`https://api.github.com/orgs/${organization}/repos`, {
      method: "POST",
      headers: {
        Authorization: `token ${githubPat}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: finalRepoName,
        private: isPrivate ?? true,
        auto_init: true,
        description: `Cloned from ${sourceOrg}/${sourceRepo}`,
      }),
    });

    if (!createRepoResponse.ok) {
      const errorData = await createRepoResponse.json();
      throw new Error(`GitHub API error: ${errorData.message || "Failed to create repository"}`);
    }

    const newRepoData = await createRepoResponse.json();

    // Fetch file tree from source repository WITH AUTHENTICATION
    const treeResponse = await fetch(
      `https://api.github.com/repos/${sourceOrg}/${sourceRepo}/git/trees/${branch}?recursive=1`,
      {
        headers: {
          Authorization: `token ${githubPat}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Pronghorn-Clone",
        },
      },
    );

    if (!treeResponse.ok) {
      const errorText = await treeResponse.text();
      console.error(`[clone-public-repo] Tree fetch failed: ${treeResponse.status} - ${errorText}`);
      throw new Error(`Failed to fetch source repository tree. Verify the repository and branch exist.`);
    }

    const treeData = await treeResponse.json();

    // Filter only files (not directories)
    const files = treeData.tree.filter((item: any) => item.type === "blob");

    console.log(`[clone-public-repo] Found ${files.length} files to clone`);

    // Fetch content for each file using Blob API in parallel batches
    // Process in batches of 50 to avoid overwhelming the API
    const BATCH_SIZE = 50;
    const allFileContents: { path: string; content: string; isBinary: boolean }[] = [];

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      console.log(`[clone-public-repo] Fetching batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(files.length / BATCH_SIZE)} (${batch.length} files)`);

      const batchResults = await Promise.all(
        batch.map(async (file: any) => {
          try {
            // Use Blob API - handles all file sizes and types
            const blobUrl = `https://api.github.com/repos/${sourceOrg}/${sourceRepo}/git/blobs/${file.sha}`;
            const blobResponse = await fetch(blobUrl, {
              headers: {
                Authorization: `token ${githubPat}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "Pronghorn-Clone",
              },
            });

            if (!blobResponse.ok) {
              console.error(`[clone-public-repo] Failed to get blob for ${file.path}: ${blobResponse.status}`);
              return null;
            }

            const blobData = await blobResponse.json();
            const isBinary = isBinaryFile(file.path);

            let content: string;
            if (blobData.encoding === 'base64') {
              const base64Clean = blobData.content.replace(/\n/g, '');
              
              if (isBinary) {
                // Keep binary files as base64 for blob creation
                content = base64Clean;
              } else {
                // Decode text files to UTF-8
                try {
                  const bytes = Uint8Array.from(atob(base64Clean), c => c.charCodeAt(0));
                  content = new TextDecoder('utf-8').decode(bytes);
                } catch (e) {
                  // If decode fails, treat as binary
                  console.warn(`[clone-public-repo] Failed to decode ${file.path} as text, treating as binary`);
                  return {
                    path: file.path,
                    content: base64Clean,
                    isBinary: true,
                  };
                }
              }
            } else {
              content = blobData.content;
            }

            return {
              path: file.path,
              content,
              isBinary,
            };
          } catch (error) {
            console.error(`[clone-public-repo] Error fetching ${file.path}:`, error);
            return null;
          }
        })
      );

      // Add successful fetches to results
      for (const result of batchResults) {
        if (result !== null) {
          allFileContents.push(result);
        }
      }
    }

    console.log(`[clone-public-repo] Successfully fetched ${allFileContents.length}/${files.length} files`);

    if (allFileContents.length === 0) {
      throw new Error("No files could be fetched from source repository");
    }

    // Get the initial commit SHA from new repo
    const refResponse = await fetch(
      `https://api.github.com/repos/${organization}/${finalRepoName}/git/ref/heads/main`,
      {
        headers: {
          Authorization: `token ${githubPat}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    const refData = await refResponse.json();
    const latestCommitSha = refData.object.sha;

    // Get current tree
    const commitResponse = await fetch(
      `https://api.github.com/repos/${organization}/${finalRepoName}/git/commits/${latestCommitSha}`,
      {
        headers: {
          Authorization: `token ${githubPat}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    const commitData = await commitResponse.json();
    const baseTreeSha = commitData.tree.sha;

    // Create tree entries - for binary files, create blobs first
    console.log(`[clone-public-repo] Creating tree entries...`);
    const tree: any[] = [];

    // Separate binary and text files
    const binaryFiles = allFileContents.filter(f => f.isBinary);
    const textFiles = allFileContents.filter(f => !f.isBinary);

    // Create blobs for binary files in parallel batches
    if (binaryFiles.length > 0) {
      console.log(`[clone-public-repo] Creating ${binaryFiles.length} binary blobs...`);
      
      for (let i = 0; i < binaryFiles.length; i += BATCH_SIZE) {
        const batch = binaryFiles.slice(i, i + BATCH_SIZE);
        
        const blobResults = await Promise.all(
          batch.map(async (file) => {
            try {
              const createBlobResponse = await fetch(
                `https://api.github.com/repos/${organization}/${finalRepoName}/git/blobs`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `token ${githubPat}`,
                    Accept: "application/vnd.github.v3+json",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    content: file.content,
                    encoding: "base64",
                  }),
                }
              );

              if (!createBlobResponse.ok) {
                console.error(`[clone-public-repo] Failed to create blob for ${file.path}`);
                return null;
              }

              const blobData = await createBlobResponse.json();
              return {
                path: file.path,
                mode: "100644",
                type: "blob",
                sha: blobData.sha,
              };
            } catch (error) {
              console.error(`[clone-public-repo] Error creating blob for ${file.path}:`, error);
              return null;
            }
          })
        );

        for (const result of blobResults) {
          if (result !== null) {
            tree.push(result);
          }
        }
      }
    }

    // Add text files directly to tree (content included inline)
    for (const file of textFiles) {
      tree.push({
        path: file.path,
        mode: "100644",
        type: "blob",
        content: file.content,
      });
    }

    console.log(`[clone-public-repo] Creating tree with ${tree.length} entries...`);

    const createTreeResponse = await fetch(`https://api.github.com/repos/${organization}/${finalRepoName}/git/trees`, {
      method: "POST",
      headers: {
        Authorization: `token ${githubPat}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree,
      }),
    });

    if (!createTreeResponse.ok) {
      const errorData = await createTreeResponse.json();
      console.error(`[clone-public-repo] Tree creation failed:`, errorData);
      throw new Error(`Failed to create tree: ${errorData.message}`);
    }

    const newTreeData = await createTreeResponse.json();

    // Create commit
    const createCommitResponse = await fetch(
      `https://api.github.com/repos/${organization}/${finalRepoName}/git/commits`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${githubPat}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Clone from ${sourceOrg}/${sourceRepo}`,
          tree: newTreeData.sha,
          parents: [latestCommitSha],
        }),
      },
    );

    if (!createCommitResponse.ok) {
      const errorData = await createCommitResponse.json();
      throw new Error(`Failed to create commit: ${errorData.message}`);
    }

    const commitResponseData = await createCommitResponse.json();

    // Update reference
    const updateRefResponse = await fetch(
      `https://api.github.com/repos/${organization}/${finalRepoName}/git/refs/heads/main`,
      {
        method: "PATCH",
        headers: {
          Authorization: `token ${githubPat}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sha: commitResponseData.sha,
          force: true,
        }),
      },
    );

    if (!updateRefResponse.ok) {
      const errorData = await updateRefResponse.json();
      throw new Error(`Failed to update reference: ${errorData.message}`);
    }

    console.log(`[clone-public-repo] Successfully pushed ${tree.length} files to ${organization}/${finalRepoName}`);

    // Link repository to project
    const { data: newRepo, error: repoError } = await supabase.rpc("create_project_repo_with_token", {
      p_project_id: projectId,
      p_token: shareToken,
      p_organization: organization,
      p_repo: finalRepoName,
      p_branch: "main",
      p_is_default: true,
      p_is_prime: true,
    });

    if (repoError) {
      console.error("[clone-public-repo] Error linking repository:", repoError);
      throw new Error("Failed to link repository to project");
    }

    // Broadcast repos_refresh for multi-user sync
    try {
      await supabase.channel(`project_repos-${projectId}`).send({
        type: 'broadcast',
        event: 'repos_refresh',
        payload: { projectId }
      });
    } catch (broadcastError) {
      console.warn('[clone-public-repo] Failed to broadcast repos_refresh:', broadcastError);
    }

    // Pull files into database
    const { error: pullError } = await supabase.functions.invoke("sync-repo-pull", {
      body: {
        projectId,
        repoId: newRepo.id,
        shareToken,
      },
    });

    if (pullError) {
      console.error("[clone-public-repo] Error pulling cloned files:", pullError);
    }

    console.log(`[clone-public-repo] Complete: ${organization}/${finalRepoName} from ${sourceOrg}/${sourceRepo} (${tree.length} files)`);

    return new Response(
      JSON.stringify({
        success: true,
        repo: newRepo,
        githubUrl: newRepoData.html_url,
        filesCloned: tree.length,
        totalFiles: files.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[clone-public-repo] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
