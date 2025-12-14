-- Fix ambiguous column reference in ORDER BY clauses
-- Need to drop overloaded function first

-- Drop the overloaded version first
DROP FUNCTION IF EXISTS public.get_repo_files_with_token(uuid, uuid, text);

-- Fix get_repo_file_paths_with_token
CREATE OR REPLACE FUNCTION public.get_repo_file_paths_with_token(p_repo_id uuid, p_token uuid DEFAULT NULL)
RETURNS TABLE(id uuid, path text, is_binary boolean, is_staged boolean, operation_type text, size_bytes bigint, updated_at timestamptz)
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
  )
  SELECT * FROM (
    SELECT cf.* FROM committed_files cf
    WHERE NOT EXISTS (
      SELECT 1 FROM staged_files sf WHERE sf.path = cf.path
    )
    UNION ALL
    SELECT sf.* FROM staged_files sf
    WHERE sf.operation_type != 'delete'
  ) combined
  ORDER BY 2;  -- Order by path (2nd column)
END;
$function$;

-- Fix get_repo_files_with_token (without path prefix)
CREATE OR REPLACE FUNCTION public.get_repo_files_with_token(p_repo_id uuid, p_token uuid DEFAULT NULL)
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
    SELECT rf.* FROM public.repo_files rf WHERE rf.repo_id = p_repo_id
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
    WHERE rs.repo_id = p_repo_id AND rs.operation_type = 'edit'
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
    WHERE rs.repo_id = p_repo_id AND rs.operation_type = 'add'
  ),
  staged_deletes AS (
    SELECT rs.file_path FROM public.repo_staging rs
    WHERE rs.repo_id = p_repo_id AND rs.operation_type = 'delete'
  )
  SELECT * FROM (
    SELECT bf.* FROM base_files bf
    WHERE bf.path NOT IN (SELECT file_path FROM staged_edits)
      AND bf.path NOT IN (SELECT file_path FROM staged_deletes)
    UNION ALL
    SELECT se.* FROM staged_edits se
    UNION ALL
    SELECT sa.* FROM staged_adds sa
  ) combined
  ORDER BY 4;  -- Order by path (4th column in repo_files)
END;
$function$;

-- Recreate get_repo_files_with_token (with path prefix)
CREATE OR REPLACE FUNCTION public.get_repo_files_with_token(p_repo_id uuid, p_token uuid, p_path_prefix text)
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
    WHERE rf.repo_id = p_repo_id AND rf.path LIKE p_path_prefix || '%'
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
    WHERE rs.repo_id = p_repo_id AND rs.operation_type = 'edit' AND rs.file_path LIKE p_path_prefix || '%'
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
    WHERE rs.repo_id = p_repo_id AND rs.operation_type = 'add' AND rs.file_path LIKE p_path_prefix || '%'
  ),
  staged_deletes AS (
    SELECT rs.file_path FROM public.repo_staging rs
    WHERE rs.repo_id = p_repo_id AND rs.operation_type = 'delete'
  )
  SELECT * FROM (
    SELECT bf.* FROM base_files bf
    WHERE bf.path NOT IN (SELECT file_path FROM staged_edits)
      AND bf.path NOT IN (SELECT file_path FROM staged_deletes)
    UNION ALL
    SELECT se.* FROM staged_edits se
    UNION ALL
    SELECT sa.* FROM staged_adds sa
  ) combined
  ORDER BY 4;  -- Order by path (4th column in repo_files)
END;
$function$;