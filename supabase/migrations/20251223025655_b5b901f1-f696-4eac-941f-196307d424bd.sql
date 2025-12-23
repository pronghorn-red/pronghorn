-- =============================================
-- Large File Handling: Add content_length columns
-- =============================================

-- Add generated content_length column to repo_files
-- This is auto-calculated when content changes
ALTER TABLE public.repo_files 
ADD COLUMN IF NOT EXISTS content_length bigint 
  GENERATED ALWAYS AS (octet_length(content)) STORED;

-- Add generated content_length column to repo_staging (based on new_content)
ALTER TABLE public.repo_staging 
ADD COLUMN IF NOT EXISTS content_length bigint 
  GENERATED ALWAYS AS (octet_length(COALESCE(new_content, ''))) STORED;

-- Create index for efficient size-based queries
CREATE INDEX IF NOT EXISTS idx_repo_files_content_length ON public.repo_files(content_length);
CREATE INDEX IF NOT EXISTS idx_repo_staging_content_length ON public.repo_staging(content_length);

-- =============================================
-- Create lightweight metadata RPC (no content!)
-- =============================================

-- This function returns file metadata WITHOUT the content column
-- Reduces data transfer from ~30MB to ~10KB for large repos
CREATE OR REPLACE FUNCTION public.get_project_files_metadata_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  repo_id uuid,
  path text,
  content_length bigint,
  is_binary boolean,
  last_commit_sha text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate access - require at least viewer role
  PERFORM public.require_role(p_project_id, p_token, 'viewer');

  RETURN QUERY 
  SELECT 
    rf.id,
    rf.repo_id,
    rf.path,
    rf.content_length,
    rf.is_binary,
    rf.last_commit_sha,
    rf.updated_at
  FROM public.repo_files rf
  WHERE rf.project_id = p_project_id
  ORDER BY rf.path;
END;
$function$;

-- Grant execute to authenticated and anon
GRANT EXECUTE ON FUNCTION public.get_project_files_metadata_with_token(uuid, uuid) TO authenticated, anon;

-- =============================================
-- Create metadata RPC for staged changes (no content!)
-- =============================================

CREATE OR REPLACE FUNCTION public.get_staged_changes_metadata_with_token(
  p_repo_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  repo_id uuid,
  file_path text,
  operation_type text,
  old_path text,
  content_length bigint,
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
  -- Get project_id from repo
  SELECT pr.project_id INTO v_project_id
  FROM public.project_repos pr
  WHERE pr.id = p_repo_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repository not found';
  END IF;

  -- Validate access - require at least viewer role
  PERFORM public.require_role(v_project_id, p_token, 'viewer');

  RETURN QUERY 
  SELECT 
    rs.id,
    rs.repo_id,
    rs.file_path,
    rs.operation_type,
    rs.old_path,
    rs.content_length,
    rs.is_binary,
    rs.created_at
  FROM public.repo_staging rs
  WHERE rs.repo_id = p_repo_id
  ORDER BY rs.file_path;
END;
$function$;

-- Grant execute to authenticated and anon
GRANT EXECUTE ON FUNCTION public.get_staged_changes_metadata_with_token(uuid, uuid) TO authenticated, anon;