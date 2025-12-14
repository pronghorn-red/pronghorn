-- Fix stage_file_change_with_token to properly handle operations on staging-only files
-- When deleting a staged 'add' file: DELETE from staging entirely
-- When editing a staged 'add' file: Keep as 'add' (already working)
-- When renaming a staged 'add' file: DELETE old entry, INSERT new 'add' entry

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
  v_existing_op text;
  v_existing_content text;
  result public.repo_staging;
BEGIN
  -- Get project_id from repo
  v_project_id := public.get_project_id_from_repo(p_repo_id);
  
  -- Validate access AND require editor role
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Check if file already exists in staging
  SELECT operation_type, new_content INTO v_existing_op, v_existing_content
  FROM public.repo_staging 
  WHERE repo_id = p_repo_id AND file_path = p_file_path;
  
  -- Special case: Deleting a staged 'add' file (never committed) - remove from staging entirely
  IF p_operation_type = 'delete' AND v_existing_op = 'add' THEN
    DELETE FROM public.repo_staging 
    WHERE repo_id = p_repo_id AND file_path = p_file_path;
    -- Return NULL to indicate deletion (no staged entry remains)
    RETURN NULL;
  END IF;
  
  -- Special case: Renaming involves old_path - check if old_path was a staged 'add'
  IF p_operation_type = 'rename' AND p_old_path IS NOT NULL THEN
    SELECT operation_type, new_content INTO v_existing_op, v_existing_content
    FROM public.repo_staging 
    WHERE repo_id = p_repo_id AND file_path = p_old_path;
    
    IF v_existing_op = 'add' THEN
      -- Old file was a staged 'add' - delete it and create new 'add' at new path
      DELETE FROM public.repo_staging 
      WHERE repo_id = p_repo_id AND file_path = p_old_path;
      
      -- Insert as 'add' at new location (not 'rename', since original never existed in repo_files)
      INSERT INTO public.repo_staging (
        repo_id, project_id, file_path, operation_type, 
        old_content, new_content, old_path, is_binary, created_by
      )
      VALUES (
        p_repo_id, v_project_id, p_file_path, 'add',
        NULL, COALESCE(p_new_content, v_existing_content), NULL, p_is_binary, auth.uid()
      )
      ON CONFLICT (repo_id, file_path)
      DO UPDATE SET
        operation_type = 'add',
        new_content = EXCLUDED.new_content,
        old_path = NULL,
        is_binary = EXCLUDED.is_binary,
        created_at = now()
      RETURNING * INTO result;
      
      RETURN result;
    END IF;
  END IF;
  
  -- Standard UPSERT for all other cases
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