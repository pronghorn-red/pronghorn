-- Fix get_repo_files_with_token function with correct column order in UNION CTEs
-- The columns must match repo_files table: id, project_id, repo_id, path, content, last_commit_sha, created_at, updated_at, is_binary

CREATE OR REPLACE FUNCTION public.get_repo_files_with_token(
  p_repo_id uuid,
  p_token uuid DEFAULT NULL,
  p_path_prefix text DEFAULT NULL
)
RETURNS SETOF repo_files
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from repo
  SELECT project_id INTO v_project_id FROM public.project_repos WHERE id = p_repo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repository not found';
  END IF;

  -- Validate access - require at least viewer
  PERFORM public.require_role(v_project_id, p_token, 'viewer');

  RETURN QUERY
  WITH 
    -- Get files staged for deletion (to exclude from committed files)
    staged_deletes AS (
      SELECT rs.file_path
      FROM public.repo_staging rs
      WHERE rs.repo_id = p_repo_id
        AND rs.operation_type = 'delete'
    ),
    -- Get committed files that have staged edits (we'll use staged version instead)
    staged_edits AS (
      SELECT 
        rs.id,
        rf.project_id,
        rf.repo_id,
        rs.file_path AS path,
        COALESCE(rs.new_content, rf.content) AS content,
        rf.last_commit_sha,
        rs.created_at AS created_at,
        rs.created_at AS updated_at,
        rs.is_binary
      FROM public.repo_staging rs
      JOIN public.repo_files rf ON rf.repo_id = rs.repo_id AND rf.path = rs.file_path
      WHERE rs.repo_id = p_repo_id
        AND rs.operation_type = 'edit'
    ),
    -- Get newly staged files (not yet committed)
    staged_adds AS (
      SELECT 
        rs.id,
        rs.project_id,
        rs.repo_id,
        rs.file_path AS path,
        rs.new_content AS content,
        NULL::text AS last_commit_sha,
        rs.created_at AS created_at,
        rs.created_at AS updated_at,
        rs.is_binary
      FROM public.repo_staging rs
      WHERE rs.repo_id = p_repo_id
        AND rs.operation_type = 'add'
    ),
    -- Committed files excluding deleted and edited ones
    committed_files AS (
      SELECT rf.*
      FROM public.repo_files rf
      WHERE rf.repo_id = p_repo_id
        AND rf.path NOT IN (SELECT file_path FROM staged_deletes)
        AND rf.path NOT IN (SELECT path FROM staged_edits)
    )
  -- Combine: committed files + staged edits + staged adds
  SELECT * FROM committed_files
  UNION ALL
  SELECT * FROM staged_edits
  UNION ALL
  SELECT * FROM staged_adds
  WHERE (p_path_prefix IS NULL OR path LIKE p_path_prefix || '%');
END;
$function$;