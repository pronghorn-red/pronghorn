-- Drop existing functions first (return type is changing)
DROP FUNCTION IF EXISTS public.get_repo_files_with_token(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_staged_changes_with_token(uuid, uuid);

-- Phase 1: Fix get_repo_files_with_token to NOT return content
CREATE OR REPLACE FUNCTION public.get_repo_files_with_token(
  p_repo_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  path text,
  is_binary boolean,
  last_commit_sha text,
  updated_at timestamptz,
  is_staged boolean,
  operation_type text,
  size_bytes integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from repo
  SELECT project_id INTO v_project_id FROM project_repos WHERE project_repos.id = p_repo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Repository not found'; END IF;

  -- Validate access
  PERFORM require_role(v_project_id, p_token, 'viewer');

  RETURN QUERY
  SELECT 
    rf.id,
    rf.path,
    rf.is_binary,
    rf.last_commit_sha,
    rf.updated_at,
    (rs.id IS NOT NULL) AS is_staged,
    rs.operation_type,
    length(COALESCE(rs.new_content, rf.content))::integer AS size_bytes
  FROM repo_files rf
  LEFT JOIN repo_staging rs ON rs.repo_id = rf.repo_id AND rs.file_path = rf.path
  WHERE rf.repo_id = p_repo_id
    AND (rs.id IS NULL OR rs.operation_type != 'delete')
  
  UNION ALL
  
  -- Include new files from staging that don't exist in repo_files yet
  SELECT 
    rs.id,
    rs.file_path AS path,
    rs.is_binary,
    NULL::text AS last_commit_sha,
    rs.created_at AS updated_at,
    true AS is_staged,
    rs.operation_type,
    length(rs.new_content)::integer AS size_bytes
  FROM repo_staging rs
  WHERE rs.repo_id = p_repo_id
    AND rs.operation_type = 'add'
    AND NOT EXISTS (
      SELECT 1 FROM repo_files rf 
      WHERE rf.repo_id = rs.repo_id AND rf.path = rs.file_path
    );
END;
$function$;

-- Phase 2: Fix get_staged_changes_with_token to NOT return content
CREATE OR REPLACE FUNCTION public.get_staged_changes_with_token(
  p_repo_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  file_path text,
  operation_type text,
  old_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from repo
  SELECT project_id INTO v_project_id FROM project_repos WHERE project_repos.id = p_repo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Repository not found'; END IF;

  -- Validate access
  PERFORM require_role(v_project_id, p_token, 'viewer');

  RETURN QUERY
  SELECT 
    rs.id,
    rs.file_path,
    rs.operation_type,
    rs.old_path
  FROM repo_staging rs
  WHERE rs.repo_id = p_repo_id
  ORDER BY rs.created_at;
END;
$function$;