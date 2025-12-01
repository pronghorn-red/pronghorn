-- File Management RPC Functions
-- These functions handle CRUD operations on repo_files with token validation

-- Helper function to validate project access via repo
CREATE OR REPLACE FUNCTION public.validate_repo_access(p_repo_id uuid, p_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from repo
  SELECT project_id INTO v_project_id
  FROM project_repos
  WHERE id = p_repo_id;
  
  IF v_project_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Validate project access
  RETURN validate_project_access(v_project_id, p_token);
END;
$$;

-- Get file structure as tree
CREATE OR REPLACE FUNCTION public.get_file_structure_with_token(
  p_repo_id uuid,
  p_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Validate access
  IF NOT validate_repo_access(p_repo_id, p_token) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Build tree structure from paths
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'path', path,
      'name', regexp_replace(path, '^.+/', ''),
      'type', CASE 
        WHEN path LIKE '%.%' THEN 'file'
        ELSE 'folder'
      END,
      'updated_at', updated_at
    )
    ORDER BY path
  )
  INTO v_result
  FROM repo_files
  WHERE repo_id = p_repo_id;
  
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- Get single file content
CREATE OR REPLACE FUNCTION public.get_file_content_with_token(
  p_file_id uuid,
  p_token uuid
)
RETURNS TABLE (
  id uuid,
  path text,
  content text,
  last_commit_sha text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate access via repo
  IF NOT EXISTS (
    SELECT 1 FROM repo_files rf
    WHERE rf.id = p_file_id
    AND validate_repo_access(rf.repo_id, p_token)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  RETURN QUERY
  SELECT rf.id, rf.path, rf.content, rf.last_commit_sha, rf.updated_at
  FROM repo_files rf
  WHERE rf.id = p_file_id;
END;
$$;

-- Upsert file (create or update)
CREATE OR REPLACE FUNCTION public.upsert_file_with_token(
  p_repo_id uuid,
  p_path text,
  p_content text,
  p_token uuid,
  p_commit_sha text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  path text,
  content text,
  last_commit_sha text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
  v_file_id uuid;
BEGIN
  -- Validate access
  IF NOT validate_repo_access(p_repo_id, p_token) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Get project_id for the file record
  SELECT project_id INTO v_project_id
  FROM project_repos
  WHERE id = p_repo_id;
  
  -- Upsert file
  INSERT INTO repo_files (project_id, repo_id, path, content, last_commit_sha)
  VALUES (v_project_id, p_repo_id, p_path, p_content, p_commit_sha)
  ON CONFLICT (repo_id, path)
  DO UPDATE SET
    content = EXCLUDED.content,
    last_commit_sha = COALESCE(EXCLUDED.last_commit_sha, repo_files.last_commit_sha),
    updated_at = now()
  RETURNING repo_files.id INTO v_file_id;
  
  -- Return the file
  RETURN QUERY
  SELECT rf.id, rf.path, rf.content, rf.last_commit_sha, rf.created_at, rf.updated_at
  FROM repo_files rf
  WHERE rf.id = v_file_id;
END;
$$;

-- Batch upsert files (for syncing multiple files)
CREATE OR REPLACE FUNCTION public.upsert_files_batch_with_token(
  p_repo_id uuid,
  p_files jsonb,
  p_token uuid
)
RETURNS TABLE (
  success boolean,
  files_updated integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
  v_file jsonb;
  v_count integer := 0;
BEGIN
  -- Validate access
  IF NOT validate_repo_access(p_repo_id, p_token) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Get project_id
  SELECT project_id INTO v_project_id
  FROM project_repos
  WHERE id = p_repo_id;
  
  -- Process each file
  FOR v_file IN SELECT * FROM jsonb_array_elements(p_files)
  LOOP
    INSERT INTO repo_files (project_id, repo_id, path, content, last_commit_sha)
    VALUES (
      v_project_id,
      p_repo_id,
      v_file->>'path',
      v_file->>'content',
      v_file->>'commit_sha'
    )
    ON CONFLICT (repo_id, path)
    DO UPDATE SET
      content = EXCLUDED.content,
      last_commit_sha = COALESCE(EXCLUDED.last_commit_sha, repo_files.last_commit_sha),
      updated_at = now();
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN QUERY SELECT true, v_count;
END;
$$;

-- Delete file
CREATE OR REPLACE FUNCTION public.delete_file_with_token(
  p_file_id uuid,
  p_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate access via repo
  IF NOT EXISTS (
    SELECT 1 FROM repo_files rf
    WHERE rf.id = p_file_id
    AND validate_repo_access(rf.repo_id, p_token)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  DELETE FROM repo_files WHERE id = p_file_id;
  RETURN true;
END;
$$;

-- Get all files for a project (for AI memory loading)
CREATE OR REPLACE FUNCTION public.get_project_files_with_token(
  p_project_id uuid,
  p_token uuid
)
RETURNS TABLE (
  id uuid,
  repo_id uuid,
  path text,
  content text,
  last_commit_sha text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Set share token
  PERFORM set_share_token(p_token::text);
  
  -- Validate project access
  IF NOT validate_project_access(p_project_id, p_token) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  RETURN QUERY
  SELECT rf.id, rf.repo_id, rf.path, rf.content, rf.last_commit_sha, rf.updated_at
  FROM repo_files rf
  WHERE rf.project_id = p_project_id
  ORDER BY rf.path;
END;
$$;