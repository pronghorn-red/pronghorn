-- Create function to reset repo files for rollback/restore operations
CREATE OR REPLACE FUNCTION public.reset_repo_files_with_token(
  p_repo_id uuid,
  p_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate access
  IF NOT validate_repo_access(p_repo_id, p_token) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Delete all staged changes for this repo
  DELETE FROM repo_staging WHERE repo_id = p_repo_id;
  
  -- Delete all committed files for this repo
  DELETE FROM repo_files WHERE repo_id = p_repo_id;
  
  RETURN true;
END;
$function$;