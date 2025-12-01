-- Create RPC function to create a new file with token validation
CREATE OR REPLACE FUNCTION public.create_file_with_token(
  p_repo_id uuid,
  p_path text,
  p_content text DEFAULT '',
  p_token uuid DEFAULT NULL
)
RETURNS repo_files
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  result public.repo_files;
BEGIN
  -- Get project_id from repo
  SELECT project_id INTO v_project_id
  FROM public.project_repos
  WHERE id = p_repo_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Repository not found';
  END IF;

  -- Set share token in Postgres session
  PERFORM public.set_share_token(p_token::text);

  -- Insert new file and return
  INSERT INTO public.repo_files (repo_id, project_id, path, content)
  VALUES (p_repo_id, v_project_id, p_path, p_content)
  RETURNING * INTO result;

  RETURN result;
END;
$function$;

-- Create RPC function to rename a file/folder with token validation
CREATE OR REPLACE FUNCTION public.rename_file_with_token(
  p_file_id uuid,
  p_new_path text,
  p_token uuid DEFAULT NULL
)
RETURNS repo_files
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.repo_files;
BEGIN
  -- Set share token in Postgres session
  PERFORM public.set_share_token(p_token::text);

  -- Update file path and return
  UPDATE public.repo_files
  SET path = p_new_path, updated_at = now()
  WHERE id = p_file_id
  RETURNING * INTO result;

  RETURN result;
END;
$function$;

-- Create RPC function to bulk rename files (for folder renames)
CREATE OR REPLACE FUNCTION public.rename_folder_with_token(
  p_repo_id uuid,
  p_old_folder_path text,
  p_new_folder_path text,
  p_token uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  -- Set share token in Postgres session
  PERFORM public.set_share_token(p_token::text);

  -- Update all files in the folder
  UPDATE public.repo_files
  SET 
    path = p_new_folder_path || substring(path from length(p_old_folder_path) + 1),
    updated_at = now()
  WHERE repo_id = p_repo_id
    AND (path = p_old_folder_path OR path LIKE p_old_folder_path || '/%');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;