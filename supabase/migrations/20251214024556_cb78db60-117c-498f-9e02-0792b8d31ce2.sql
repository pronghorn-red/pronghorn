-- Drop ALL existing overloads of get_repo_files_with_token
DROP FUNCTION IF EXISTS public.get_repo_files_with_token(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_repo_files_with_token(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.get_repo_files_with_token(uuid, uuid, text[]);

-- Create single function that supports p_path_prefix but does NOT return content
CREATE OR REPLACE FUNCTION public.get_repo_files_with_token(
  p_repo_id uuid,
  p_token uuid DEFAULT NULL,
  p_path_prefix text DEFAULT NULL
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
  SELECT pr.project_id INTO v_project_id
  FROM public.project_repos pr
  WHERE pr.id = p_repo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repository not found';
  END IF;

  -- Validate access
  PERFORM public.authorize_project_access(v_project_id, p_token);

  RETURN QUERY
  SELECT 
    rf.id,
    rf.path,
    rf.is_binary,
    rf.last_commit_sha,
    rf.updated_at,
    (rs.id IS NOT NULL) AS is_staged,
    rs.operation_type,
    LENGTH(rf.content)::integer AS size_bytes
  FROM public.repo_files rf
  LEFT JOIN public.repo_staging rs ON rs.repo_id = rf.repo_id AND rs.file_path = rf.path
  WHERE rf.repo_id = p_repo_id
    AND (p_path_prefix IS NULL OR rf.path LIKE p_path_prefix || '%')
  
  UNION ALL
  
  -- Include staged files that are new (not in repo_files yet)
  SELECT 
    rs2.id,
    rs2.file_path AS path,
    rs2.is_binary,
    NULL::text AS last_commit_sha,
    rs2.created_at AS updated_at,
    true AS is_staged,
    rs2.operation_type,
    LENGTH(rs2.new_content)::integer AS size_bytes
  FROM public.repo_staging rs2
  WHERE rs2.repo_id = p_repo_id
    AND rs2.operation_type = 'add'
    AND (p_path_prefix IS NULL OR rs2.file_path LIKE p_path_prefix || '%')
    AND NOT EXISTS (
      SELECT 1 FROM public.repo_files rf2 
      WHERE rf2.repo_id = rs2.repo_id AND rf2.path = rs2.file_path
    );
END;
$function$;