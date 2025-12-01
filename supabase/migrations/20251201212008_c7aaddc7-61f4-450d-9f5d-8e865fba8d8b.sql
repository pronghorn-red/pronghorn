-- Fix agent_read_file_with_token to set share token before access checks
CREATE OR REPLACE FUNCTION public.agent_read_file_with_token(
  p_file_id uuid,
  p_token uuid
)
RETURNS TABLE(
  id uuid,
  path text,
  content text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Set share token in Postgres session so RLS policies on repo_files can validate access
  PERFORM public.set_share_token(p_token::text);

  -- Validate access via repo
  IF NOT EXISTS (
    SELECT 1 FROM repo_files rf
    WHERE rf.id = p_file_id
      AND validate_repo_access(rf.repo_id, p_token)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  RETURN QUERY
  SELECT rf.id, rf.path, rf.content
  FROM repo_files rf
  WHERE rf.id = p_file_id;
END;
$function$;