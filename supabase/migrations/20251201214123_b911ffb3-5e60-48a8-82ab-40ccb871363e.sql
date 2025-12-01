-- Fix agent_list_files_by_path_with_token so it returns repo_files IDs for edited files
-- This ensures read_file/edit_lines receive valid repo_files.id values instead of repo_staging.id
CREATE OR REPLACE FUNCTION public.agent_list_files_by_path_with_token(
  p_repo_id uuid,
  p_token uuid,
  p_path_prefix text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  path text,
  repo_id uuid,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.set_share_token(p_token::text);
  
  IF NOT validate_repo_access(p_repo_id, p_token) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  IF p_path_prefix IS NOT NULL THEN
    RETURN QUERY
    -- Committed files (not deleted in staging)
    SELECT rf.id, rf.path, rf.repo_id, rf.updated_at
    FROM public.repo_files rf
    WHERE rf.repo_id = p_repo_id
      AND rf.path LIKE p_path_prefix || '%'
      AND NOT EXISTS (
        SELECT 1 FROM repo_staging rs 
        WHERE rs.repo_id = rf.repo_id 
          AND rs.file_path = rf.path 
          AND rs.operation_type = 'delete'
      )
    UNION ALL
    -- Staged files (add or edit), but use repo_files.id when it exists
    SELECT 
      COALESCE(rf.id, rs.id) AS id,
      rs.file_path AS path,
      rs.repo_id,
      rs.created_at AS updated_at
    FROM public.repo_staging rs
    LEFT JOIN public.repo_files rf
      ON rf.repo_id = rs.repo_id
     AND rf.path = rs.file_path
    WHERE rs.repo_id = p_repo_id
      AND rs.file_path LIKE p_path_prefix || '%'
      AND rs.operation_type IN ('add', 'edit')
    ORDER BY path ASC;
  ELSE
    RETURN QUERY
    -- Committed files (not deleted in staging)
    SELECT rf.id, rf.path, rf.repo_id, rf.updated_at
    FROM public.repo_files rf
    WHERE rf.repo_id = p_repo_id
      AND NOT EXISTS (
        SELECT 1 FROM repo_staging rs 
        WHERE rs.repo_id = rf.repo_id 
          AND rs.file_path = rf.path 
          AND rs.operation_type = 'delete'
      )
    UNION ALL
    -- Staged files (add or edit), but use repo_files.id when it exists
    SELECT 
      COALESCE(rf.id, rs.id) AS id,
      rs.file_path AS path,
      rs.repo_id,
      rs.created_at AS updated_at
    FROM public.repo_staging rs
    LEFT JOIN public.repo_files rf
      ON rf.repo_id = rs.repo_id
     AND rf.path = rs.file_path
    WHERE rs.repo_id = p_repo_id
      AND rs.operation_type IN ('add', 'edit')
    ORDER BY path ASC;
  END IF;
END;
$function$;