-- Create RPC function to get a single repo with token validation
CREATE OR REPLACE FUNCTION public.get_repo_by_id_with_token(
  p_repo_id uuid,
  p_token uuid
)
RETURNS SETOF project_repos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Set share token in Postgres session
  PERFORM public.set_share_token(p_token::text);

  -- Execute query - RLS policies will validate access
  RETURN QUERY
    SELECT *
    FROM public.project_repos
    WHERE id = p_repo_id;
END;
$function$;

-- Create RPC function to get repo files with token validation
CREATE OR REPLACE FUNCTION public.get_repo_files_with_token(
  p_repo_id uuid,
  p_token uuid,
  p_file_paths text[] DEFAULT NULL
)
RETURNS TABLE (
  path text,
  content text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Set share token in Postgres session
  PERFORM public.set_share_token(p_token::text);

  -- Execute query based on whether specific files are requested
  IF p_file_paths IS NOT NULL AND array_length(p_file_paths, 1) > 0 THEN
    RETURN QUERY
      SELECT rf.path, rf.content
      FROM public.repo_files rf
      WHERE rf.repo_id = p_repo_id
        AND rf.path = ANY(p_file_paths);
  ELSE
    RETURN QUERY
      SELECT rf.path, rf.content
      FROM public.repo_files rf
      WHERE rf.repo_id = p_repo_id;
  END IF;
END;
$function$;