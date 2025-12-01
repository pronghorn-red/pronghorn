-- Create commit change log table
CREATE TABLE IF NOT EXISTS public.repo_commits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES public.project_repos(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  branch TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  commit_message TEXT NOT NULL,
  files_changed INTEGER NOT NULL DEFAULT 0,
  committed_by UUID REFERENCES auth.users(id),
  committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_repo_commits_repo_id ON public.repo_commits(repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_commits_project_id ON public.repo_commits(project_id);
CREATE INDEX IF NOT EXISTS idx_repo_commits_branch ON public.repo_commits(branch);

-- Enable RLS
ALTER TABLE public.repo_commits ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can view commits for projects they have access to
CREATE POLICY "Users can view repo commits"
ON public.repo_commits
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = repo_commits.project_id
      AND (
        p.created_by = auth.uid()
        OR p.share_token = (current_setting('app.share_token', true))::uuid
      )
  )
);

-- RLS policy: users can insert commits for projects they have access to
CREATE POLICY "Users can insert repo commits"
ON public.repo_commits
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = repo_commits.project_id
      AND (
        p.created_by = auth.uid()
        OR p.share_token = (current_setting('app.share_token', true))::uuid
      )
  )
);

-- Add branch column to project_repos if not exists
DO $$ 
BEGIN
  -- This column already exists, but ensuring it's properly configured
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'project_repos' AND column_name = 'branch'
  ) THEN
    ALTER TABLE public.project_repos ADD COLUMN branch TEXT NOT NULL DEFAULT 'main';
  END IF;
END $$;

-- RPC function to get commit history
CREATE OR REPLACE FUNCTION public.get_repo_commits_with_token(
  p_repo_id UUID,
  p_token UUID,
  p_branch TEXT DEFAULT NULL
)
RETURNS SETOF repo_commits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Set share token
  PERFORM public.set_share_token(p_token::text);
  
  -- Validate access
  IF NOT public.validate_repo_access(p_repo_id, p_token) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Return commits, optionally filtered by branch
  IF p_branch IS NOT NULL THEN
    RETURN QUERY
      SELECT *
      FROM public.repo_commits
      WHERE repo_id = p_repo_id
        AND branch = p_branch
      ORDER BY committed_at DESC;
  ELSE
    RETURN QUERY
      SELECT *
      FROM public.repo_commits
      WHERE repo_id = p_repo_id
      ORDER BY committed_at DESC;
  END IF;
END;
$$;

-- RPC function to log commit
CREATE OR REPLACE FUNCTION public.log_repo_commit_with_token(
  p_repo_id UUID,
  p_token UUID,
  p_branch TEXT,
  p_commit_sha TEXT,
  p_commit_message TEXT,
  p_files_changed INTEGER
)
RETURNS repo_commits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id UUID;
  new_commit public.repo_commits;
BEGIN
  -- Set share token
  PERFORM public.set_share_token(p_token::text);
  
  -- Validate access
  IF NOT public.validate_repo_access(p_repo_id, p_token) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Get project_id
  SELECT project_id INTO v_project_id
  FROM public.project_repos
  WHERE id = p_repo_id;
  
  -- Insert commit log
  INSERT INTO public.repo_commits (
    repo_id,
    project_id,
    branch,
    commit_sha,
    commit_message,
    files_changed,
    committed_by
  )
  VALUES (
    p_repo_id,
    v_project_id,
    p_branch,
    p_commit_sha,
    p_commit_message,
    p_files_changed,
    auth.uid()
  )
  RETURNING * INTO new_commit;
  
  RETURN new_commit;
END;
$$;