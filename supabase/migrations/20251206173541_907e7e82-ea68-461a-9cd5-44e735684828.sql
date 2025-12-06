-- Phase 8: Fix duplicate commit logging
-- Add pushed_at and github_sha columns to track push status

-- Add new columns to repo_commits
ALTER TABLE public.repo_commits 
ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS github_sha TEXT DEFAULT NULL;

-- Create function to mark pending commits as pushed
CREATE OR REPLACE FUNCTION public.mark_commits_pushed_with_token(
  p_repo_id UUID,
  p_token UUID,
  p_github_sha TEXT,
  p_branch TEXT DEFAULT 'main'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
  v_updated_count INTEGER;
BEGIN
  -- Get project_id from repo
  v_project_id := public.get_project_id_from_repo(p_repo_id);
  
  -- Validate access - requires editor role
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Update all unpushed commits for this repo/branch
  -- Set github_sha on the most recent one only, mark all as pushed
  WITH pending_commits AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY committed_at DESC) as rn
    FROM public.repo_commits
    WHERE repo_id = p_repo_id
      AND branch = p_branch
      AND pushed_at IS NULL
  )
  UPDATE public.repo_commits rc
  SET 
    pushed_at = now(),
    github_sha = CASE 
      WHEN pc.rn = 1 THEN p_github_sha 
      ELSE rc.github_sha 
    END
  FROM pending_commits pc
  WHERE rc.id = pc.id;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RETURN v_updated_count;
END;
$function$;