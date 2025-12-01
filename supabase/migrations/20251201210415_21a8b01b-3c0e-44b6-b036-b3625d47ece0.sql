-- Update agent_read_multiple_files_with_token to query both repo_files and repo_staging
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