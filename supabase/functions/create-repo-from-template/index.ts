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
    const { projectId, repoName, templateOrg, templateRepo, shareToken, isPrivate } = await req.json();

    // Validate required fields - shareToken must be passed (even if null for authenticated users)
    if (!projectId || !repoName || !templateOrg || !templateRepo || shareToken === undefined) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      console.error("[create-repo-from-template] Access denied:", roleError);
      throw new Error("Access denied");
    }

    // Check for editor role (owner has higher privileges than editor)
    if (role !== "owner" && role !== "editor") {
      console.error("[create-repo-from-template] Insufficient permissions:", role);
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

    // Create repository from template
    const createRepoResponse = await fetch(`https://api.github.com/repos/${templateOrg}/${templateRepo}/generate`, {
      method: "POST",
      headers: {
        Authorization: `token ${githubPat}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        owner: organization,
        name: finalRepoName,
        description: `Repository for ${project.name} (from ${templateOrg}/${templateRepo})`,
        private: isPrivate ?? true,
      }),
    });

    if (!createRepoResponse.ok) {
      const errorText = await createRepoResponse.text();
      console.error(`GitHub API error (${createRepoResponse.status}):`, errorText);

      let errorMessage = "Failed to create repository from template";
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      // Add helpful context for common errors
      if (createRepoResponse.status === 404) {
        errorMessage += ` - Template repository '${templateOrg}/${templateRepo}' not found. Please verify: 1) The repository exists, 2) It's marked as a template, 3) The GITHUB_PAT has access to it.`;
      }

      throw new Error(`GitHub API error: ${errorMessage}`);
    }

    const repoData = await createRepoResponse.json();

    // Wait a moment for GitHub to finish setting up the repo
    await new Promise((resolve) => setTimeout(resolve, 2000));

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

    // Pull files from the newly created repository into database
    const { error: pullError } = await supabase.functions.invoke("sync-repo-pull", {
      body: {
        projectId,
        repoId: newRepo.id,
        shareToken,
      },
    });

    if (pullError) {
      console.error("Error pulling template files:", pullError);
      // Non-fatal - repo is created and linked, just log the error
    }

    console.log(
      `Created repository from template: ${organization}/${finalRepoName} from ${templateOrg}/${templateRepo}`,
    );

    // Broadcast repos_refresh event for realtime sync
    try {
      await supabase.channel(`project_repos-${projectId}`).send({
        type: 'broadcast',
        event: 'repos_refresh',
        payload: { repoId: newRepo.id }
      });
    } catch (broadcastError) {
      console.log('[create-repo-from-template] Broadcast failed (non-fatal):', broadcastError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        repo: newRepo,
        githubUrl: repoData.html_url,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in create-repo-from-template:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
