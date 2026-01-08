-- Fix move_file_with_token: Remove broken duplicate and update original with RBAC fix only

-- Step 1: Drop the broken new version (wrong parameter order, wrong return type, wrong logic)
DROP FUNCTION IF EXISTS public.move_file_with_token(uuid, uuid, text);

-- Step 2: Update the original version with ONLY the RBAC fix (validate_repo_access -> require_role)
CREATE OR REPLACE FUNCTION public.move_file_with_token(
  p_file_id uuid,
  p_new_path text,
  p_token uuid
)
RETURNS repo_staging
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_file repo_files;
  v_existing_staged repo_staging;
  v_project_id uuid;
  result repo_staging;
BEGIN
  -- Get the file details
  SELECT * INTO v_file
  FROM repo_files
  WHERE id = p_file_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'File not found';
  END IF;
  
  -- FIXED: Use require_role instead of validate_repo_access
  v_project_id := public.get_project_id_from_file(p_file_id);
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Check if there's already a staged change for this file
  SELECT * INTO v_existing_staged
  FROM repo_staging
  WHERE repo_id = v_file.repo_id
    AND (file_path = v_file.path OR old_path = v_file.path);
  
  -- If existing staged change, update it
  IF FOUND THEN
    UPDATE repo_staging
    SET 
      file_path = p_new_path,
      operation_type = 'rename',
      old_path = COALESCE(v_existing_staged.old_path, v_file.path),
      new_content = v_file.content,
      old_content = COALESCE(v_existing_staged.old_content, v_file.content),
      is_binary = v_file.is_binary
    WHERE id = v_existing_staged.id
    RETURNING * INTO result;
  ELSE
    -- Create new staged change
    INSERT INTO repo_staging (
      repo_id,
      project_id,
      file_path,
      old_path,
      operation_type,
      old_content,
      new_content,
      created_by,
      is_binary
    )
    VALUES (
      v_file.repo_id,
      v_file.project_id,
      p_new_path,
      v_file.path,
      'rename',
      v_file.content,
      v_file.content,
      auth.uid(),
      v_file.is_binary
    )
    RETURNING * INTO result;
  END IF;
  
  RETURN result;
END;
$function$;