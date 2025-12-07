-- Fix get_file_content_with_token to support staged files (add, edit, rename, etc.) except deleted
CREATE OR REPLACE FUNCTION public.get_file_content_with_token(
  p_file_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  path text,
  content text,
  last_commit_sha text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_repo_id uuid;
  v_is_staged_only boolean := false;
BEGIN
  -- First, check if file exists in repo_files (committed)
  SELECT rf.repo_id INTO v_repo_id
  FROM public.repo_files rf
  WHERE rf.id = p_file_id;
  
  -- If not in repo_files, check repo_staging for non-delete operations
  IF v_repo_id IS NULL THEN
    SELECT rs.repo_id INTO v_repo_id
    FROM public.repo_staging rs
    WHERE rs.id = p_file_id
      AND rs.operation_type != 'delete';
    
    IF v_repo_id IS NOT NULL THEN
      v_is_staged_only := true;
    END IF;
  END IF;
  
  -- If still not found, file doesn't exist
  IF v_repo_id IS NULL THEN
    RAISE EXCEPTION 'File not found: %', p_file_id;
  END IF;
  
  -- Get project_id and validate access
  v_project_id := public.get_project_id_from_repo(v_repo_id);
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  -- Return content based on source
  IF v_is_staged_only THEN
    -- Return staged-only file content (add, edit, rename, etc.)
    RETURN QUERY
      SELECT 
        rs.id,
        rs.file_path AS path,
        rs.new_content AS content,
        NULL::text AS last_commit_sha,
        rs.created_at AS updated_at
      FROM public.repo_staging rs
      WHERE rs.id = p_file_id
        AND rs.operation_type != 'delete';
  ELSE
    -- Return committed file, but check if there's a staged edit/rename overlay
    -- Also ensure file isn't deleted in staging
    RETURN QUERY
      SELECT 
        rf.id,
        COALESCE(rs.file_path, rf.path) AS path,
        COALESCE(rs.new_content, rf.content) AS content,
        rf.last_commit_sha,
        COALESCE(rs.created_at, rf.updated_at) AS updated_at
      FROM public.repo_files rf
      LEFT JOIN public.repo_staging rs 
        ON rs.repo_id = rf.repo_id 
        AND (rs.file_path = rf.path OR rs.old_path = rf.path)
        AND rs.operation_type != 'delete'
      WHERE rf.id = p_file_id
        AND NOT EXISTS (
          SELECT 1 FROM public.repo_staging del
          WHERE del.repo_id = rf.repo_id
            AND del.file_path = rf.path
            AND del.operation_type = 'delete'
        );
  END IF;
END;
$function$;