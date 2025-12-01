-- Fix agent_read_multiple_files_with_token to set share token before validation
CREATE OR REPLACE FUNCTION public.agent_read_multiple_files_with_token(
  p_file_ids uuid[],
  p_token uuid
)
RETURNS TABLE (id uuid, path text, content text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- CRITICAL: Set share token in session FIRST so RLS policies can validate access
  PERFORM public.set_share_token(p_token::text);
  
  RETURN QUERY
  -- Query 1: Committed files from repo_files
  SELECT rf.id, rf.path, rf.content
  FROM repo_files rf
  WHERE rf.id = ANY(p_file_ids)
    AND validate_repo_access(rf.repo_id, p_token)
  
  UNION ALL
  
  -- Query 2: Staged files from repo_staging (only add/edit have content)
  SELECT rs.id, rs.file_path AS path, rs.new_content AS content
  FROM repo_staging rs
  WHERE rs.id = ANY(p_file_ids)
    AND validate_repo_access(rs.repo_id, p_token)
    AND rs.operation_type IN ('add', 'edit');
END;
$$;