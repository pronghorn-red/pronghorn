-- Create project_repos table
CREATE TABLE IF NOT EXISTS public.project_repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization TEXT NOT NULL,
  repo TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, organization, repo)
);

-- Create index on project_id
CREATE INDEX IF NOT EXISTS idx_project_repos_project_id ON public.project_repos(project_id);

-- Enable RLS
ALTER TABLE public.project_repos ENABLE ROW LEVEL SECURITY;

-- RLS policy for project_repos
CREATE POLICY "Users can access project repos"
ON public.project_repos
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM projects
    WHERE projects.id = project_repos.project_id
      AND (
        projects.created_by = auth.uid()
        OR 
        projects.share_token = (current_setting('app.share_token', true))::uuid
      )
  )
);

-- Create repo_pats table (encrypted PATs)
CREATE TABLE IF NOT EXISTS public.repo_pats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  repo_id UUID NOT NULL REFERENCES public.project_repos(id) ON DELETE CASCADE,
  pat TEXT NOT NULL, -- Encrypted storage
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, repo_id)
);

-- Enable RLS
ALTER TABLE public.repo_pats ENABLE ROW LEVEL SECURITY;

-- RLS policies for repo_pats (no client reads, only server functions)
CREATE POLICY "Users cannot select PATs"
ON public.repo_pats
FOR SELECT
USING (false);

CREATE POLICY "Users can insert their own PATs"
ON public.repo_pats
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own PATs"
ON public.repo_pats
FOR DELETE
USING (auth.uid() = user_id);

-- Create repo_files table
CREATE TABLE IF NOT EXISTS public.repo_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  repo_id UUID NOT NULL REFERENCES public.project_repos(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  last_commit_sha TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(repo_id, path)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_repo_files_project_id ON public.repo_files(project_id);
CREATE INDEX IF NOT EXISTS idx_repo_files_repo_id_path ON public.repo_files(repo_id, path);

-- Enable RLS
ALTER TABLE public.repo_files ENABLE ROW LEVEL SECURITY;

-- RLS policy for repo_files
CREATE POLICY "Users can access repo files"
ON public.repo_files
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM projects
    WHERE projects.id = repo_files.project_id
      AND (
        projects.created_by = auth.uid()
        OR 
        projects.share_token = (current_setting('app.share_token', true))::uuid
      )
  )
);

-- Create updated_at trigger for project_repos
CREATE TRIGGER update_project_repos_updated_at
BEFORE UPDATE ON public.project_repos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create updated_at trigger for repo_files
CREATE TRIGGER update_repo_files_updated_at
BEFORE UPDATE ON public.repo_files
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();