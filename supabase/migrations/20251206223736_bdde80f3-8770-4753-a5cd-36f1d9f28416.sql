-- Fix viewer token access control for repos and file staging
-- All write operations must use require_role('editor') instead of just validate_access

-- Update create_project_repo_with_token to use require_role
CREATE OR REPLACE FUNCTION public.create_project_repo_with_token(
  p_project_id UUID,
  p_token UUID,
  p_organization TEXT,
  p_repo TEXT,
  p_branch TEXT DEFAULT 'main',
  p_is_default BOOLEAN DEFAULT false,
  p_is_prime BOOLEAN DEFAULT NULL
)
RETURNS project_repos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_repo project_repos;
  v_is_prime BOOLEAN;
  v_existing_count INTEGER;
BEGIN
  -- Validate access AND require editor role
  PERFORM public.require_role(p_project_id, p_token, 'editor');

  -- Determine if this should be prime (first repo or explicitly set)
  IF p_is_prime IS NOT NULL THEN
    v_is_prime := p_is_prime;
  ELSE
    -- Check if any repos exist for this project
    SELECT COUNT(*) INTO v_existing_count
    FROM project_repos
    WHERE project_id = p_project_id;
    
    -- First repo is automatically prime
    v_is_prime := (v_existing_count = 0);
  END IF;

  -- If setting as prime, unset others
  IF v_is_prime THEN
    UPDATE project_repos
    SET is_prime = false
    WHERE project_id = p_project_id;
  END IF;

  INSERT INTO project_repos (
    project_id,
    organization,
    repo,
    branch,
    is_default,
    is_prime
  )
  VALUES (
    p_project_id,
    p_organization,
    p_repo,
    p_branch,
    p_is_default,
    v_is_prime
  )
  RETURNING * INTO new_repo;

  RETURN new_repo;
END;
$$;

-- Update stage_file_change_with_token to use require_role
CREATE OR REPLACE FUNCTION public.stage_file_change_with_token(
  p_repo_id uuid,
  p_token uuid,
  p_operation_type text,
  p_file_path text,
  p_old_content text DEFAULT NULL,
  p_new_content text DEFAULT NULL,
  p_old_path text DEFAULT NULL,
  p_is_binary boolean DEFAULT false
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
  -- Get project_id from repo
  v_project_id := public.get_project_id_from_repo(p_repo_id);
  
  -- Validate access AND require editor role
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- UPSERT staging entry
  INSERT INTO public.repo_staging (
    repo_id,
    project_id,
    file_path,
    operation_type,
    old_content,
    new_content,
    old_path,
    is_binary,
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
    p_is_binary,
    auth.uid()
  )
  ON CONFLICT (repo_id, file_path)
  DO UPDATE SET
    operation_type = CASE 
      WHEN repo_staging.operation_type = 'add' THEN 'add'
      ELSE EXCLUDED.operation_type 
    END,
    new_content = EXCLUDED.new_content,
    old_path = EXCLUDED.old_path,
    is_binary = EXCLUDED.is_binary,
    created_at = now()
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- Update commit_staged_with_token to use require_role
CREATE OR REPLACE FUNCTION public.commit_staged_with_token(
  p_repo_id uuid, 
  p_token uuid, 
  p_commit_message text, 
  p_branch text DEFAULT 'main'::text, 
  p_commit_sha text DEFAULT NULL::text
)
RETURNS repo_commits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
  v_parent_commit_id UUID;
  v_staged_changes repo_staging[];
  v_files_metadata JSONB;
  result public.repo_commits;
BEGIN
  -- Get project_id from repo
  v_project_id := public.get_project_id_from_repo(p_repo_id);
  
  -- Validate access AND require editor role
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Get staged changes
  SELECT array_agg(rs.*) INTO v_staged_changes
  FROM repo_staging rs
  WHERE rs.repo_id = p_repo_id;
  
  IF v_staged_changes IS NULL THEN
    RAISE EXCEPTION 'No staged changes to commit';
  END IF;
  
  -- Build files metadata
  SELECT jsonb_agg(
    jsonb_build_object(
      'path', operation.file_path,
      'operation', operation.operation_type,
      'old_path', operation.old_path
    )
  ) INTO v_files_metadata
  FROM unnest(v_staged_changes) AS operation;
  
  -- Get parent commit (latest commit on this branch)
  SELECT id INTO v_parent_commit_id
  FROM repo_commits
  WHERE repo_id = p_repo_id AND branch = p_branch
  ORDER BY committed_at DESC
  LIMIT 1;
  
  -- Apply staged changes to repo_files
  FOR i IN 1..array_length(v_staged_changes, 1) LOOP
    CASE v_staged_changes[i].operation_type
      WHEN 'add', 'edit' THEN
        INSERT INTO repo_files (repo_id, project_id, path, content, last_commit_sha)
        VALUES (p_repo_id, v_project_id, v_staged_changes[i].file_path, v_staged_changes[i].new_content, p_commit_sha)
        ON CONFLICT (repo_id, path)
        DO UPDATE SET content = EXCLUDED.content, last_commit_sha = EXCLUDED.last_commit_sha, updated_at = now();
      
      WHEN 'delete' THEN
        DELETE FROM repo_files
        WHERE repo_id = p_repo_id AND path = v_staged_changes[i].file_path;
      
      WHEN 'rename' THEN
        UPDATE repo_files
        SET path = v_staged_changes[i].file_path, updated_at = now()
        WHERE repo_id = p_repo_id AND path = v_staged_changes[i].old_path;
    END CASE;
  END LOOP;
  
  -- Create commit record
  INSERT INTO public.repo_commits (
    repo_id,
    project_id,
    branch,
    commit_sha,
    commit_message,
    files_changed,
    parent_commit_id,
    files_metadata,
    committed_by
  )
  VALUES (
    p_repo_id,
    v_project_id,
    p_branch,
    COALESCE(p_commit_sha, gen_random_uuid()::text),
    p_commit_message,
    array_length(v_staged_changes, 1),
    v_parent_commit_id,
    v_files_metadata,
    auth.uid()
  )
  RETURNING * INTO result;
  
  -- Clear staging
  DELETE FROM repo_staging WHERE repo_id = p_repo_id;
  
  RETURN result;
END;
$function$;

-- Update discard_staged_with_token to use require_role
CREATE OR REPLACE FUNCTION public.discard_staged_with_token(p_repo_id uuid, p_token uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_count INTEGER;
BEGIN
  -- Get project_id from repo
  v_project_id := public.get_project_id_from_repo(p_repo_id);
  
  -- Validate access AND require editor role
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Delete all staged changes
  DELETE FROM repo_staging
  WHERE repo_id = p_repo_id;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN v_count;
END;
$function$;

-- Update unstage_file_with_token to use require_role
CREATE OR REPLACE FUNCTION public.unstage_file_with_token(p_repo_id uuid, p_file_path text, p_token uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_deleted_count INTEGER;
BEGIN
  -- Get project_id from repo
  v_project_id := public.get_project_id_from_repo(p_repo_id);
  
  -- Validate access AND require editor role
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Delete specific staged file
  DELETE FROM public.repo_staging
  WHERE repo_id = p_repo_id
    AND file_path = p_file_path;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$function$;

-- Update unstage_files_with_token to use require_role
CREATE OR REPLACE FUNCTION public.unstage_files_with_token(p_repo_id uuid, p_file_paths text[], p_token uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_deleted_count INTEGER;
BEGIN
  -- Get project_id from repo
  v_project_id := public.get_project_id_from_repo(p_repo_id);
  
  -- Validate access AND require editor role
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Delete specified staged files
  DELETE FROM public.repo_staging
  WHERE repo_id = p_repo_id
    AND file_path = ANY(p_file_paths);
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$function$;

-- Update set_repo_prime_with_token to use require_role (editor needed to change repo settings)
CREATE OR REPLACE FUNCTION public.set_repo_prime_with_token(
  p_repo_id UUID,
  p_token UUID
)
RETURNS project_repos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id UUID;
  result project_repos;
BEGIN
  -- Get project_id from repo
  SELECT project_id INTO v_project_id
  FROM project_repos
  WHERE id = p_repo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repository not found' USING ERRCODE = 'P0001';
  END IF;

  -- Validate access AND require editor role
  PERFORM public.require_role(v_project_id, p_token, 'editor');

  -- Unset all other repos as prime
  UPDATE project_repos
  SET is_prime = false
  WHERE project_id = v_project_id;

  -- Set this repo as prime
  UPDATE project_repos
  SET is_prime = true
  WHERE id = p_repo_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;