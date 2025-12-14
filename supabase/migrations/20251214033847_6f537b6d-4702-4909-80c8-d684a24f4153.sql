-- Drop and recreate get_staged_changes_with_token with content fields
DROP FUNCTION IF EXISTS public.get_staged_changes_with_token(uuid, uuid);

CREATE FUNCTION public.get_staged_changes_with_token(
  p_repo_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  file_path text,
  operation_type text,
  old_path text,
  old_content text,
  new_content text,
  is_binary boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM public.project_repos WHERE project_repos.id = p_repo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Repository not found'; END IF;

  PERFORM public.require_role(v_project_id, p_token, 'viewer');

  RETURN QUERY
  SELECT 
    rs.id,
    rs.file_path,
    rs.operation_type,
    rs.old_path,
    rs.old_content,
    rs.new_content,
    rs.is_binary,
    rs.created_at
  FROM public.repo_staging rs
  WHERE rs.repo_id = p_repo_id
  ORDER BY rs.created_at;
END;
$function$;