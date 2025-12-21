import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, repoName, shareToken, isPrivate } = await req.json();

    // Validate required fields - shareToken must be passed (even if null for authenticated users)
    if (!projectId || !repoName || shareToken === undefined) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: projectId, repoName, and shareToken are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Generate a unique, slugified repo name with short id suffix
    const baseSlug = repoName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-");
    const uniqueSuffix = crypto.randomUUID().split("-")[0];
    const finalRepoName = `${baseSlug}-${uniqueSuffix}`;

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
      console.error("[create-empty-repo] Access denied:", roleError);
      throw new Error("Access denied");
    }

    // Check for editor role (owner has higher privileges than editor)
    if (role !== "owner" && role !== "editor") {
      console.error("[create-empty-repo] Insufficient permissions:", role);
      return new Response(
        JSON.stringify({ error: "Insufficient permissions: editor role required to create repositories" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch project data for repo description
    const { data: project, error: projectError } = await supabase.rpc("get_project_with_token", {
      p_project_id: projectId,
      p_token: shareToken,
    });

    if (projectError || !project) {
      throw new Error("Failed to fetch project data");
    }

    // Get GitHub PAT
    const githubPat = Deno.env.get("GITHUB_PAT");
    if (!githubPat) {
      throw new Error("GitHub PAT not configured");
    }

    const organization = "pronghorn-cloud";

    // Create empty repository on GitHub
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
        auto_init: true, // Initialize with README
        description: `Repository for ${project.name}`,
      }),
    });

    if (!createRepoResponse.ok) {
      const errorData = await createRepoResponse.json();
      throw new Error(`GitHub API error: ${errorData.message || "Failed to create repository"}`);
    }

    const repoData = await createRepoResponse.json();

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
      console.error("Error linking repository:", repoError);
      throw new Error("Failed to link repository to project");
    }

    // Initialize with basic project structure
    const initialFiles = [
      {
        path: "README.md",
        content: `# ${project.name}\n\n${project.description || "Project repository"}\n`,
      },
      {
        path: ".gitkeep",
        content: "",
      },
    ];

    // Get the latest commit SHA from main branch
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

    // Store files in database
    for (const file of initialFiles) {
      await supabase.rpc("upsert_file_with_token", {
        p_repo_id: newRepo.id,
        p_path: file.path,
        p_content: file.content,
        p_token: shareToken,
        p_commit_sha: latestCommitSha,
      });
    }

    console.log(`Created empty repository: ${organization}/${finalRepoName}`);

    // Broadcast repos_refresh event for realtime sync
    try {
      await supabase.channel(`project_repos-${projectId}`).send({
        type: 'broadcast',
        event: 'repos_refresh',
        payload: { repoId: newRepo.id }
      });
    } catch (broadcastError) {
      console.log('[create-empty-repo] Broadcast failed (non-fatal):', broadcastError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        repo: newRepo,
        githubUrl: repoData.html_url,
        visibility: repoData.private ? "private" : "public",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in create-empty-repo:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
