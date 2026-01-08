-- Drop the broken version with wrong column names (sha, message, pushed)
DROP FUNCTION IF EXISTS public.log_repo_commit_with_token(uuid, uuid, text, text, text, jsonb, boolean);

-- Update the correct version to use require_role instead of set_share_token
CREATE OR REPLACE FUNCTION public.log_repo_commit_with_token(
  p_repo_id uuid,
  p_token uuid,
  p_branch text,
  p_commit_sha text,
  p_commit_message text,
  p_files_changed integer
)
RETURNS repo_commits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_result public.repo_commits;
BEGIN
  v_project_id := public.get_project_id_from_repo(p_repo_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Repository not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
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
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$function$;