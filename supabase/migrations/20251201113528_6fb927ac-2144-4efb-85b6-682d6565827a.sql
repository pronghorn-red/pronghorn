-- Phase 1: Staging & Commit Architecture

-- Create repo_staging table for tracking uncommitted changes
CREATE TABLE IF NOT EXISTS public.repo_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES public.project_repos(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('add', 'edit', 'delete', 'rename')),
  file_path TEXT NOT NULL,
  old_content TEXT,
  new_content TEXT,
  old_path TEXT, -- for rename operations
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID
);

-- Add commit tracking columns to repo_commits
ALTER TABLE public.repo_commits 
  ADD COLUMN IF NOT EXISTS parent_commit_id UUID REFERENCES public.repo_commits(id),
  ADD COLUMN IF NOT EXISTS files_metadata JSONB DEFAULT '[]'::jsonb;

-- Add auto_commit flag to project_repos
ALTER TABLE public.project_repos
  ADD COLUMN IF NOT EXISTS auto_commit BOOLEAN DEFAULT false;

-- Enable RLS on repo_staging
ALTER TABLE public.repo_staging ENABLE ROW LEVEL SECURITY;

-- RLS policy for repo_staging
CREATE POLICY "Users can access repo staging"
ON public.repo_staging
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM projects
    WHERE projects.id = repo_staging.project_id
      AND (
        projects.created_by = auth.uid()
        OR projects.share_token = (current_setting('app.share_token', true))::uuid
      )
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_repo_staging_repo_id ON public.repo_staging(repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_staging_project_id ON public.repo_staging(project_id);
CREATE INDEX IF NOT EXISTS idx_repo_commits_parent ON public.repo_commits(parent_commit_id);

-- RPC: Get staged changes for a repo
CREATE OR REPLACE FUNCTION public.get_staged_changes_with_token(
  p_repo_id UUID,
  p_token UUID
)
RETURNS SETOF repo_staging
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Set share token
  PERFORM public.set_share_token(p_token::text);
  
  -- Validate access
  IF NOT EXISTS (
    SELECT 1 FROM project_repos pr
    WHERE pr.id = p_repo_id
      AND validate_repo_access(p_repo_id, p_token)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  RETURN QUERY
  SELECT *
  FROM public.repo_staging
  WHERE repo_id = p_repo_id
  ORDER BY created_at ASC;
END;
$function$;

-- RPC: Stage a file change
CREATE OR REPLACE FUNCTION public.stage_file_change_with_token(
  p_repo_id UUID,
  p_token UUID,
  p_operation_type TEXT,
  p_file_path TEXT,
  p_old_content TEXT DEFAULT NULL,
  p_new_content TEXT DEFAULT NULL,
  p_old_path TEXT DEFAULT NULL
)
RETURNS repo_staging
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
  result public.repo_staging;
BEGIN
  -- Set share token
  PERFORM public.set_share_token(p_token::text);
  
  -- Validate access and get project_id
  SELECT project_id INTO v_project_id
  FROM project_repos
  WHERE id = p_repo_id;
  
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Repository not found';
  END IF;
  
  IF NOT validate_repo_access(p_repo_id, p_token) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Insert staging entry
  INSERT INTO public.repo_staging (
    repo_id,
    project_id,
    operation_type,
    file_path,
    old_content,
    new_content,
    old_path,
    created_by
  )
  VALUES (
    p_repo_id,
    v_project_id,
    p_operation_type,
    p_file_path,
    p_old_content,
    p_new_content,
    p_old_path,
    auth.uid()
  )
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- RPC: Commit staged changes
CREATE OR REPLACE FUNCTION public.commit_staged_with_token(
  p_repo_id UUID,
  p_token UUID,
  p_commit_message TEXT,
  p_branch TEXT DEFAULT 'main',
  p_commit_sha TEXT DEFAULT NULL
)
RETURNS repo_commits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
  v_parent_commit_id UUID;
  v_staged_changes repo_staging[];
  v_files_metadata JSONB;
  result public.repo_commits;
BEGIN
  -- Set share token
  PERFORM public.set_share_token(p_token::text);
  
  -- Validate access
  SELECT project_id INTO v_project_id
  FROM project_repos
  WHERE id = p_repo_id;
  
  IF NOT validate_repo_access(p_repo_id, p_token) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Get staged changes
  SELECT array_agg(rs.*) INTO v_staged_changes
  FROM repo_staging rs
  WHERE rs.repo_id = p_repo_id;
  
  IF v_staged_changes IS NULL THEN
    RAISE EXCEPTION 'No staged changes to commit';
  END IF;
  
  -- Build files metadata
  SELECT jsonb_agg(
    jsonb_build_object(
      'path', operation.file_path,
      'operation', operation.operation_type,
      'old_path', operation.old_path
    )
  ) INTO v_files_metadata
  FROM unnest(v_staged_changes) AS operation;
  
  -- Get parent commit (latest commit on this branch)
  SELECT id INTO v_parent_commit_id
  FROM repo_commits
  WHERE repo_id = p_repo_id AND branch = p_branch
  ORDER BY committed_at DESC
  LIMIT 1;
  
  -- Apply staged changes to repo_files
  FOR i IN 1..array_length(v_staged_changes, 1) LOOP
    CASE v_staged_changes[i].operation_type
      WHEN 'add', 'edit' THEN
        INSERT INTO repo_files (repo_id, project_id, path, content, last_commit_sha)
        VALUES (p_repo_id, v_project_id, v_staged_changes[i].file_path, v_staged_changes[i].new_content, p_commit_sha)
        ON CONFLICT (repo_id, path)
        DO UPDATE SET content = EXCLUDED.content, last_commit_sha = EXCLUDED.last_commit_sha, updated_at = now();
      
      WHEN 'delete' THEN
        DELETE FROM repo_files
        WHERE repo_id = p_repo_id AND path = v_staged_changes[i].file_path;
      
      WHEN 'rename' THEN
        UPDATE repo_files
        SET path = v_staged_changes[i].file_path, updated_at = now()
        WHERE repo_id = p_repo_id AND path = v_staged_changes[i].old_path;
    END CASE;
  END LOOP;
  
  -- Create commit record
  INSERT INTO public.repo_commits (
    repo_id,
    project_id,
    branch,
    commit_sha,
    commit_message,
    files_changed,
    parent_commit_id,
    files_metadata,
    committed_by
  )
  VALUES (
    p_repo_id,
    v_project_id,
    p_branch,
    COALESCE(p_commit_sha, gen_random_uuid()::text),
    p_commit_message,
    array_length(v_staged_changes, 1),
    v_parent_commit_id,
    v_files_metadata,
    auth.uid()
  )
  RETURNING * INTO result;
  
  -- Clear staging
  DELETE FROM repo_staging WHERE repo_id = p_repo_id;
  
  RETURN result;
END;
$function$;

-- RPC: Discard staged changes
CREATE OR REPLACE FUNCTION public.discard_staged_with_token(
  p_repo_id UUID,
  p_token UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  -- Set share token
  PERFORM public.set_share_token(p_token::text);
  
  -- Validate access
  IF NOT validate_repo_access(p_repo_id, p_token) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Delete all staged changes
  DELETE FROM repo_staging
  WHERE repo_id = p_repo_id;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN v_count;
END;
$function$;

-- RPC: Get commit history
CREATE OR REPLACE FUNCTION public.get_commit_history_with_token(
  p_repo_id UUID,
  p_token UUID,
  p_branch TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS SETOF repo_commits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Set share token
  PERFORM public.set_share_token(p_token::text);
  
  -- Validate access
  IF NOT validate_repo_access(p_repo_id, p_token) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  IF p_branch IS NOT NULL THEN
    RETURN QUERY
    SELECT *
    FROM public.repo_commits
    WHERE repo_id = p_repo_id AND branch = p_branch
    ORDER BY committed_at DESC
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT *
    FROM public.repo_commits
    WHERE repo_id = p_repo_id
    ORDER BY committed_at DESC
    LIMIT p_limit;
  END IF;
END;
$function$;

-- RPC: Rollback to specific commit
CREATE OR REPLACE FUNCTION public.rollback_to_commit_with_token(
  p_repo_id UUID,
  p_token UUID,
  p_commit_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_commit_sha TEXT;
BEGIN
  -- Set share token
  PERFORM public.set_share_token(p_token::text);
  
  -- Validate access
  IF NOT validate_repo_access(p_repo_id, p_token) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Get commit SHA
  SELECT commit_sha INTO v_commit_sha
  FROM repo_commits
  WHERE id = p_commit_id AND repo_id = p_repo_id;
  
  IF v_commit_sha IS NULL THEN
    RAISE EXCEPTION 'Commit not found';
  END IF;
  
  -- This function marks the intent to rollback
  -- The actual GitHub pull to this commit SHA will be handled by sync-repo-pull edge function
  -- Store the target commit SHA in a session variable for the edge function to use
  PERFORM set_config('app.rollback_commit_sha', v_commit_sha, false);
  
  RETURN true;
END;
$function$;