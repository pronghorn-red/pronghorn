import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, repoName, sourceOrg, sourceRepo, sourceBranch, shareToken, isPrivate } = await req.json();

    // Allow null tokens for authenticated users (shareToken !== undefined)
    if (!projectId || !repoName || !sourceOrg || !sourceRepo || shareToken === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const branch = sourceBranch || 'main';

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    // Validate project access
    const { data: project, error: projectError } = await supabase.rpc('get_project_with_token', {
      p_project_id: projectId,
      p_token: shareToken
    });

    if (projectError || !project) {
      throw new Error('Invalid project access');
    }

    // Get GitHub PAT
    const githubPat = Deno.env.get('GITHUB_PAT');
    if (!githubPat) {
      throw new Error('GitHub PAT not configured');
    }

    const organization = 'pronghorn-red';

    console.log(`Cloning ${sourceOrg}/${sourceRepo} (${branch}) to ${organization}/${repoName}`);

    // Create empty repository in pronghorn-red
    const createRepoResponse = await fetch(`https://api.github.com/orgs/${organization}/repos`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${githubPat}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: repoName,
        private: isPrivate ?? true,
        auto_init: true,
        description: `Cloned from ${sourceOrg}/${sourceRepo}`,
      }),
    });

    if (!createRepoResponse.ok) {
      const errorData = await createRepoResponse.json();
      throw new Error(`GitHub API error: ${errorData.message || 'Failed to create repository'}`);
    }

    const newRepoData = await createRepoResponse.json();

    // Fetch file tree from source repository
    const treeResponse = await fetch(
      `https://api.github.com/repos/${sourceOrg}/${sourceRepo}/git/trees/${branch}?recursive=1`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!treeResponse.ok) {
      throw new Error(`Failed to fetch source repository tree. Verify the repository and branch exist.`);
    }

    const treeData = await treeResponse.json();
    
    // Filter only files (not directories)
    const files = treeData.tree.filter((item: any) => item.type === 'blob');
    
    console.log(`Found ${files.length} files to clone`);

    // Fetch content for each file
    const fileContents: { path: string; content: string }[] = [];
    
    for (const file of files) {
      const contentResponse = await fetch(
        `https://api.github.com/repos/${sourceOrg}/${sourceRepo}/contents/${file.path}?ref=${branch}`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );

      if (contentResponse.ok) {
        const contentData = await contentResponse.json();
        
        if (contentData.content) {
          // Decode base64 content
          const decodedContent = atob(contentData.content.replace(/\n/g, ''));
          fileContents.push({
            path: file.path,
            content: decodedContent,
          });
        }
      }
    }

    console.log(`Fetched content for ${fileContents.length} files`);

    // Get the initial commit SHA from new repo
    const refResponse = await fetch(
      `https://api.github.com/repos/${organization}/${repoName}/git/ref/heads/main`,
      {
        headers: {
          'Authorization': `token ${githubPat}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    const refData = await refResponse.json();
    const latestCommitSha = refData.object.sha;

    // Get current tree
    const commitResponse = await fetch(
      `https://api.github.com/repos/${organization}/${repoName}/git/commits/${latestCommitSha}`,
      {
        headers: {
          'Authorization': `token ${githubPat}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    const commitData = await commitResponse.json();
    const baseTreeSha = commitData.tree.sha;

    // Create tree with all files
    const tree = fileContents.map((file) => ({
      path: file.path,
      mode: '100644',
      type: 'blob',
      content: file.content,
    }));

    const createTreeResponse = await fetch(
      `https://api.github.com/repos/${organization}/${repoName}/git/trees`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubPat}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree,
        }),
      }
    );

    if (!createTreeResponse.ok) {
      const errorData = await createTreeResponse.json();
      throw new Error(`Failed to create tree: ${errorData.message}`);
    }

    const newTreeData = await createTreeResponse.json();

    // Create commit
    const createCommitResponse = await fetch(
      `https://api.github.com/repos/${organization}/${repoName}/git/commits`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubPat}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Clone from ${sourceOrg}/${sourceRepo}`,
          tree: newTreeData.sha,
          parents: [latestCommitSha],
        }),
      }
    );

    if (!createCommitResponse.ok) {
      const errorData = await createCommitResponse.json();
      throw new Error(`Failed to create commit: ${errorData.message}`);
    }

    const commitResponseData = await createCommitResponse.json();

    // Update reference
    const updateRefResponse = await fetch(
      `https://api.github.com/repos/${organization}/${repoName}/git/refs/heads/main`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `token ${githubPat}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sha: commitResponseData.sha,
          force: true,
        }),
      }
    );

    if (!updateRefResponse.ok) {
      const errorData = await updateRefResponse.json();
      throw new Error(`Failed to update reference: ${errorData.message}`);
    }

    console.log(`Successfully pushed ${fileContents.length} files to ${organization}/${repoName}`);

    // Link repository to project
    const { data: newRepo, error: repoError } = await supabase.rpc('create_project_repo_with_token', {
      p_project_id: projectId,
      p_token: shareToken,
      p_organization: organization,
      p_repo: repoName,
      p_branch: 'main',
      p_is_default: true
    });

    if (repoError) {
      console.error('Error linking repository:', repoError);
      throw new Error('Failed to link repository to project');
    }

    // Pull files into database
    const { error: pullError } = await supabase.functions.invoke('sync-repo-pull', {
      body: {
        projectId,
        repoId: newRepo.id,
        shareToken
      }
    });

    if (pullError) {
      console.error('Error pulling cloned files:', pullError);
    }

    console.log(`Cloned repository: ${organization}/${repoName} from ${sourceOrg}/${sourceRepo}`);

    return new Response(
      JSON.stringify({
        success: true,
        repo: newRepo,
        githubUrl: newRepoData.html_url,
        filesCloned: fileContents.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in clone-public-repo:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
