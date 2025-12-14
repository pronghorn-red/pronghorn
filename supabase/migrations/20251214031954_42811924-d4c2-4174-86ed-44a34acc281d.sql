-- Phase 1: Drop duplicate overloads with path_prefix parameter
DROP FUNCTION IF EXISTS public.get_repo_file_paths_with_token(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.get_repo_files_with_token(uuid, uuid, text);

-- Phase 2: Recreate get_repo_file_paths_with_token (lightweight for agent - NO CONTENT)
DROP FUNCTION IF EXISTS public.get_repo_file_paths_with_token(uuid, uuid);
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
      false AS is_staged,
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
      true AS is_staged,
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

-- Phase 3: Recreate get_repo_files_with_token (full content for UI/sync)
DROP FUNCTION IF EXISTS public.get_repo_files_with_token(uuid, uuid);
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
  v_project_id := public.get_project_id_from_repo(p_repo_id);
  PERFORM public.require_role(v_project_id, p_token, 'viewer');

  RETURN QUERY
  WITH base_files AS (
    SELECT rf.* FROM public.repo_files rf 
    WHERE rf.repo_id = p_repo_id 
      AND (p_path_prefix IS NULL OR rf.path LIKE p_path_prefix || '%')
  ),
  staged_edits AS (
    SELECT 
      rs.id,
      rf.repo_id,
      rf.project_id,
      rs.file_path AS path,
      COALESCE(rs.new_content, rf.content) AS content,
      rs.is_binary,
      rf.last_commit_sha,
      rs.created_at AS created_at,
      rs.created_at AS updated_at
    FROM public.repo_staging rs
    JOIN public.repo_files rf ON rf.repo_id = rs.repo_id AND rf.path = rs.file_path
    WHERE rs.repo_id = p_repo_id 
      AND rs.operation_type = 'edit'
      AND (p_path_prefix IS NULL OR rs.file_path LIKE p_path_prefix || '%')
  ),
  staged_adds AS (
    SELECT 
      rs.id,
      rs.repo_id,
      rs.project_id,
      rs.file_path AS path,
      rs.new_content AS content,
      rs.is_binary,
      NULL::text AS last_commit_sha,
      rs.created_at AS created_at,
      rs.created_at AS updated_at
    FROM public.repo_staging rs
    WHERE rs.repo_id = p_repo_id 
      AND rs.operation_type = 'add'
      AND (p_path_prefix IS NULL OR rs.file_path LIKE p_path_prefix || '%')
  ),
  staged_deletes AS (
    SELECT rs.file_path FROM public.repo_staging rs
    WHERE rs.repo_id = p_repo_id AND rs.operation_type = 'delete'
  )
  SELECT * FROM (
    SELECT bf.* FROM base_files bf
    WHERE bf.path NOT IN (SELECT se.path FROM staged_edits se)
      AND bf.path NOT IN (SELECT sd.file_path FROM staged_deletes sd)
    UNION ALL
    SELECT se.* FROM staged_edits se
    UNION ALL
    SELECT sa.* FROM staged_adds sa
  ) combined
  ORDER BY combined.path;
END;
$function$;