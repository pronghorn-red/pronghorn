-- Recreate agent_read_file_with_token with overlay semantics
DROP FUNCTION IF EXISTS public.agent_read_file_with_token(uuid, uuid);

CREATE FUNCTION public.agent_read_file_with_token(
  p_file_id uuid,
  p_token uuid
)
RETURNS TABLE (
  content text,
  id uuid,
  path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_repo_id uuid;
  v_project_id uuid;
BEGIN
  -- Set share token in session for RLS policies
  PERFORM public.set_share_token(p_token::text);

  -- First, try to treat p_file_id as a committed file in repo_files
  SELECT rf.repo_id, rf.project_id
  INTO v_repo_id, v_project_id
  FROM public.repo_files rf
  WHERE rf.id = p_file_id;

  IF FOUND THEN
    -- Validate repo/project access via existing helper
    IF NOT public.validate_repo_access(v_repo_id, p_token) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT
      COALESCE(
        (
          SELECT rs.new_content
          FROM public.repo_staging rs
          WHERE rs.repo_id = rf.repo_id
            AND rs.file_path = rf.path
            AND rs.operation_type IN ('add', 'edit')
          ORDER BY rs.created_at DESC
          LIMIT 1
        ),
        rf.content
      ) AS content,
      rf.id AS id,
      rf.path AS path
    FROM public.repo_files rf
    WHERE rf.id = p_file_id;

    RETURN;
  END IF;

  -- Otherwise, treat p_file_id as a staging id for newly created files
  SELECT rs.repo_id
  INTO v_repo_id
  FROM public.repo_staging rs
  WHERE rs.id = p_file_id;

  IF NOT FOUND THEN
    -- No matching file found in either table
    RETURN;
  END IF;

  IF NOT public.validate_repo_access(v_repo_id, p_token) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    rs.new_content AS content,
    rs.id AS id,
    rs.file_path AS path
  FROM public.repo_staging rs
  WHERE rs.id = p_file_id;
END;
$function$;