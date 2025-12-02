-- Fix agent file operations to properly handle both 'add' and 'edit' staged files

-- 1. Update agent_read_file_with_token to query for both 'add' AND 'edit' operations
CREATE OR REPLACE FUNCTION public.agent_read_file_with_token(
  p_file_id uuid,
  p_token uuid
)
RETURNS TABLE(id uuid, path text, content text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Set share token
  PERFORM public.set_share_token(p_token::text);
  
  RETURN QUERY
  -- First check repo_files with staged overlay
  SELECT rf.id, rf.path, COALESCE(rs.new_content, rf.content) AS content
  FROM repo_files rf
  LEFT JOIN repo_staging rs ON rs.repo_id = rf.repo_id 
    AND rs.file_path = rf.path 
    AND rs.operation_type = 'edit'
  WHERE rf.id = p_file_id
    AND validate_repo_access(rf.repo_id, p_token)
  
  UNION ALL
  
  -- Files only in staging (add or edit operations where no repo_files entry exists)
  SELECT rs.id, rs.file_path AS path, rs.new_content AS content
  FROM repo_staging rs
  WHERE rs.id = p_file_id
    AND rs.operation_type IN ('add', 'edit')
    AND validate_repo_access(rs.repo_id, p_token);
END;
$function$;

-- 2. Update stage_file_change_with_token to preserve operation_type='add' for newly created files
CREATE OR REPLACE FUNCTION public.stage_file_change_with_token(
  p_repo_id uuid,
  p_token uuid,
  p_operation_type text,
  p_file_path text,
  p_old_content text DEFAULT NULL,
  p_new_content text DEFAULT NULL,
  p_old_path text DEFAULT NULL
)
RETURNS repo_staging
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  result public.repo_staging;
BEGIN
  -- Set share token
  PERFORM public.set_share_token(p_token::text);
  
  -- Validate access
  IF NOT validate_repo_access(p_repo_id, p_token) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Get project_id
  SELECT project_id INTO v_project_id
  FROM project_repos
  WHERE id = p_repo_id;
  
  -- UPSERT staging entry with proper operation_type preservation
  INSERT INTO public.repo_staging (
    repo_id,
    project_id,
    file_path,
    operation_type,
    old_content,
    new_content,
    old_path,
    created_by
  )
  VALUES (
    p_repo_id,
    v_project_id,
    p_file_path,
    p_operation_type,
    p_old_content,
    p_new_content,
    p_old_path,
    auth.uid()
  )
  ON CONFLICT (repo_id, file_path)
  DO UPDATE SET
    -- Preserve 'add' operation type if file was originally created as 'add'
    -- This ensures newly created files remain as 'add' even when edited multiple times
    operation_type = CASE 
      WHEN repo_staging.operation_type = 'add' THEN 'add'
      ELSE EXCLUDED.operation_type 
    END,
    new_content = EXCLUDED.new_content,
    old_path = EXCLUDED.old_path,
    created_at = now()
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- 3. Update agent_read_multiple_files_with_token to query for both 'add' AND 'edit' operations
CREATE OR REPLACE FUNCTION public.agent_read_multiple_files_with_token(
  p_file_ids uuid[],
  p_token uuid
)
RETURNS TABLE(id uuid, path text, content text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Set share token
  PERFORM public.set_share_token(p_token::text);
  
  RETURN QUERY
  -- Committed files with staged overlay
  SELECT rf.id, rf.path, COALESCE(rs.new_content, rf.content) AS content
  FROM repo_files rf
  LEFT JOIN repo_staging rs ON rs.repo_id = rf.repo_id 
    AND rs.file_path = rf.path 
    AND rs.operation_type = 'edit'
  WHERE rf.id = ANY(p_file_ids)
    AND validate_repo_access(rf.repo_id, p_token)
  
  UNION ALL
  
  -- Staged files (add or edit operations)
  SELECT rs.id, rs.file_path AS path, rs.new_content AS content
  FROM repo_staging rs
  WHERE rs.id = ANY(p_file_ids)
    AND rs.operation_type IN ('add', 'edit')
    AND validate_repo_access(rs.repo_id, p_token);
END;
$function$;