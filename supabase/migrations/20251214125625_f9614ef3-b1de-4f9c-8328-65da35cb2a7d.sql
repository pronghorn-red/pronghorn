-- Add p_file_paths parameter back to get_repo_files_with_token
-- This enables efficient fetching of specific files without client-side filtering

CREATE OR REPLACE FUNCTION public.get_repo_files_with_token(
  p_repo_id uuid,
  p_token uuid DEFAULT NULL,
  p_path_prefix text DEFAULT NULL,
  p_file_paths text[] DEFAULT NULL
)
RETURNS SETOF public.repo_files
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from repo
  SELECT project_id INTO v_project_id
  FROM public.project_repos
  WHERE id = p_repo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repository not found';
  END IF;

  -- Validate access - require at least viewer
  PERFORM public.require_role(v_project_id, p_token, 'viewer');

  -- Return files with filtering priority:
  -- 1. If p_file_paths provided, filter by exact paths
  -- 2. Else if p_path_prefix provided, filter by prefix
  -- 3. Else return all files
  RETURN QUERY
  SELECT rf.*
  FROM public.repo_files rf
  WHERE rf.repo_id = p_repo_id
    AND (
      -- Priority 1: Explicit file paths
      (p_file_paths IS NOT NULL AND array_length(p_file_paths, 1) > 0 AND rf.path = ANY(p_file_paths))
      OR
      -- Priority 2: Path prefix
      (p_file_paths IS NULL OR array_length(p_file_paths, 1) IS NULL OR array_length(p_file_paths, 1) = 0)
      AND p_path_prefix IS NOT NULL AND rf.path LIKE p_path_prefix || '%'
      OR
      -- Priority 3: All files (both null/empty)
      (p_file_paths IS NULL OR array_length(p_file_paths, 1) IS NULL OR array_length(p_file_paths, 1) = 0)
      AND p_path_prefix IS NULL
    );
END;
$function$;