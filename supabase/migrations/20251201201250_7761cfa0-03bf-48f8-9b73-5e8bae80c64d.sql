-- Create RPC function for agent to list all files with metadata
-- Fixed parameter order: required params first, optional params with defaults at end
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
  -- Set share token
  PERFORM public.set_share_token(p_token::text);
  
  -- Validate access
  IF NOT validate_repo_access(p_repo_id, p_token) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Return all files, optionally filtered by path prefix
  IF p_path_prefix IS NOT NULL THEN
    RETURN QUERY
    SELECT rf.id, rf.path, rf.repo_id, rf.updated_at
    FROM public.repo_files rf
    WHERE rf.repo_id = p_repo_id
      AND rf.path LIKE p_path_prefix || '%'
    ORDER BY rf.path ASC;
  ELSE
    RETURN QUERY
    SELECT rf.id, rf.path, rf.repo_id, rf.updated_at
    FROM public.repo_files rf
    WHERE rf.repo_id = p_repo_id
    ORDER BY rf.path ASC;
  END IF;
END;
$function$;