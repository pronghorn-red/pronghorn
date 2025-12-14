-- Fix boolean type casting in get_repo_file_paths_with_token
CREATE OR REPLACE FUNCTION public.get_repo_file_paths_with_token(
  p_repo_id uuid,
  p_token uuid DEFAULT NULL,
  p_path_prefix text DEFAULT NULL
)
RETURNS TABLE(id uuid, path text, is_binary boolean, is_staged boolean, operation_type text, size_bytes bigint, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  v_project_id := public.get_project_id_from_repo(p_repo_id);
  PERFORM public.require_role(v_project_id, p_token, 'viewer');

  RETURN QUERY
  WITH committed_files AS (
    SELECT 
      rf.id,
      rf.path,
      rf.is_binary,
      false::boolean AS is_staged,
      NULL::text AS operation_type,
      length(rf.content)::bigint AS size_bytes,
      rf.updated_at
    FROM public.repo_files rf
    WHERE rf.repo_id = p_repo_id
      AND (p_path_prefix IS NULL OR rf.path LIKE p_path_prefix || '%')
  ),
  staged_files AS (
    SELECT 
      rs.id,
      rs.file_path AS path,
      rs.is_binary,
      true::boolean AS is_staged,
      rs.operation_type,
      COALESCE(length(rs.new_content), 0)::bigint AS size_bytes,
      rs.created_at AS updated_at
    FROM public.repo_staging rs
    WHERE rs.repo_id = p_repo_id
      AND (p_path_prefix IS NULL OR rs.file_path LIKE p_path_prefix || '%')
  )
  SELECT cf.id, cf.path, cf.is_binary, cf.is_staged, cf.operation_type, cf.size_bytes, cf.updated_at
  FROM committed_files cf
  WHERE NOT EXISTS (
    SELECT 1 FROM staged_files sf WHERE sf.path = cf.path
  )
  UNION ALL
  SELECT sf.id, sf.path, sf.is_binary, sf.is_staged, sf.operation_type, sf.size_bytes, sf.updated_at
  FROM staged_files sf
  WHERE sf.operation_type != 'delete'
  ORDER BY path;
END;
$function$;