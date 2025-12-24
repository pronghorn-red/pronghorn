import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GITHUB_API_URL = "https://api.github.com";

interface GitHubManagementRequest {
  action: "listRepos" | "deleteRepo" | "updateVisibility" | "addCollaborator";
  owner?: string;
  repo?: string;
  visibility?: "public" | "private";
  collaborator?: string;
  permission?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GITHUB_PAT = Deno.env.get("GITHUB_PAT");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!GITHUB_PAT) {
      return new Response(
        JSON.stringify({ error: "GitHub PAT not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get auth header and verify superadmin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Get user from auth token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify superadmin role
    const { data: isSuperadmin, error: roleError } = await supabase.rpc("is_superadmin", {
      _user_id: user.id,
    });

    if (roleError || !isSuperadmin) {
      console.log("[superadmin-github-management] Access denied for user:", user.id, roleError);
      return new Response(
        JSON.stringify({ error: "Superadmin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: GitHubManagementRequest = await req.json();
    const { action, owner, repo, visibility, collaborator, permission } = body;

    console.log(`[superadmin-github-management] Action: ${action}, User: ${user.id}`);

    const githubHeaders = {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${GITHUB_PAT}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };

    switch (action) {
      case "listRepos": {
        // Fetch all repos the PAT has access to
        const allRepos: any[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const reposRes = await fetch(
            `${GITHUB_API_URL}/user/repos?per_page=100&page=${page}&affiliation=owner,organization_member&sort=updated`,
            { method: "GET", headers: githubHeaders }
          );

          if (!reposRes.ok) {
            const errorData = await reposRes.json();
            return new Response(
              JSON.stringify({ error: errorData.message || "Failed to fetch repos" }),
              { status: reposRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const reposData = await reposRes.json();
          allRepos.push(...reposData);

          // Check if there are more pages
          const linkHeader = reposRes.headers.get("Link");
          hasMore = linkHeader?.includes('rel="next"') || false;
          page++;

          // Safety limit
          if (page > 10) break;
        }

        console.log("[superadmin-github-management] Repos fetched:", allRepos.length);

        // Enrich with owner info from database
        const enrichedRepos = await enrichReposWithOwnerInfo(supabase, allRepos);

        return new Response(
          JSON.stringify({ repos: enrichedRepos }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "deleteRepo": {
        if (!owner || !repo) {
          return new Response(
            JSON.stringify({ error: "owner and repo required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const deleteRes = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}`, {
          method: "DELETE",
          headers: githubHeaders,
        });

        if (deleteRes.status === 204) {
          // Also delete from our database if exists
          await supabase
            .from("project_repos")
            .delete()
            .eq("organization", owner)
            .eq("repo", repo);

          return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          const errorData = await deleteRes.json();
          return new Response(
            JSON.stringify({ error: errorData.message || "Failed to delete repo" }),
            { status: deleteRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      case "updateVisibility": {
        if (!owner || !repo || !visibility) {
          return new Response(
            JSON.stringify({ error: "owner, repo, and visibility required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const updateRes = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}`, {
          method: "PATCH",
          headers: { ...githubHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ visibility }),
        });

        if (updateRes.ok) {
          const updatedRepo = await updateRes.json();
          return new Response(
            JSON.stringify({ success: true, repo: updatedRepo }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          const errorData = await updateRes.json();
          return new Response(
            JSON.stringify({ error: errorData.message || "Failed to update visibility" }),
            { status: updateRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      case "addCollaborator": {
        if (!owner || !repo || !collaborator) {
          return new Response(
            JSON.stringify({ error: "owner, repo, and collaborator required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const addRes = await fetch(
          `${GITHUB_API_URL}/repos/${owner}/${repo}/collaborators/${collaborator}`,
          {
            method: "PUT",
            headers: { ...githubHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ permission: permission || "push" }),
          }
        );

        if (addRes.ok || addRes.status === 201 || addRes.status === 204) {
          return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          const errorData = await addRes.json();
          return new Response(
            JSON.stringify({ error: errorData.message || "Failed to add collaborator" }),
            { status: addRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

  } catch (error: any) {
    console.error("[superadmin-github-management] Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper function to enrich GitHub repos with owner info from our database
async function enrichReposWithOwnerInfo(supabase: any, repos: any[]): Promise<any[]> {
  if (!Array.isArray(repos) || repos.length === 0) {
    return [];
  }

  const enrichedRepos = [];

  for (const repo of repos) {
    let ownerInfo = null;
    let projectInfo = null;
    let resourceCreatedAt = null;

    // Look up repo in project_repos
    const { data: projectRepo } = await supabase
      .from("project_repos")
      .select(`
        id,
        created_at,
        project_id,
        projects:project_id (
          id,
          name,
          created_at,
          created_by,
          profiles:created_by (
            email,
            display_name
          )
        )
      `)
      .eq("organization", repo.owner.login)
      .eq("repo", repo.name)
      .maybeSingle();

    if (projectRepo) {
      resourceCreatedAt = projectRepo.created_at;
      projectInfo = projectRepo.projects ? {
        id: projectRepo.projects.id,
        name: projectRepo.projects.name,
        created_at: projectRepo.projects.created_at,
      } : null;
      
      if (projectRepo.projects?.profiles) {
        const profile = Array.isArray(projectRepo.projects.profiles) 
          ? projectRepo.projects.profiles[0] 
          : projectRepo.projects.profiles;
        ownerInfo = {
          email: profile?.email,
          display_name: profile?.display_name,
        };
      }
    }

    enrichedRepos.push({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      owner: repo.owner.login,
      visibility: repo.visibility || (repo.private ? "private" : "public"),
      html_url: repo.html_url,
      created_at: repo.created_at,
      updated_at: repo.updated_at,
      pushed_at: repo.pushed_at,
      default_branch: repo.default_branch,
      size: repo.size,
      ownerInfo,
      projectInfo,
      resourceCreatedAt,
      isOrphaned: !projectInfo,
    });
  }

  return enrichedRepos;
}
