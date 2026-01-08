-- Fix upsert_files_batch_with_token: Remove broken duplicate, update original with RBAC fix only

-- Step 1: Drop the broken new version (missing project_id, last_commit_sha, wrong return type)
DROP FUNCTION IF EXISTS public.upsert_files_batch_with_token(uuid, uuid, jsonb);

-- Step 2: Update the original version with ONLY the RBAC fix
CREATE OR REPLACE FUNCTION public.upsert_files_batch_with_token(p_repo_id uuid, p_files jsonb, p_token uuid)
RETURNS TABLE(success boolean, files_updated integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_file jsonb;
  v_count integer := 0;
BEGIN
  -- FIXED: Use require_role instead of validate_repo_access
  v_project_id := public.get_project_id_from_repo(p_repo_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Repository not found';
  END IF;
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Process each file (original logic preserved)
  FOR v_file IN SELECT * FROM jsonb_array_elements(p_files)
  LOOP
    INSERT INTO repo_files (project_id, repo_id, path, content, last_commit_sha, is_binary)
    VALUES (
      v_project_id,
      p_repo_id,
      v_file->>'path',
      v_file->>'content',
      v_file->>'commit_sha',
      COALESCE((v_file->>'is_binary')::boolean, false)
    )
    ON CONFLICT (repo_id, path)
    DO UPDATE SET
      content = EXCLUDED.content,
      last_commit_sha = COALESCE(EXCLUDED.last_commit_sha, repo_files.last_commit_sha),
      is_binary = EXCLUDED.is_binary,
      updated_at = now();
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN QUERY SELECT true, v_count;
END;
$function$;