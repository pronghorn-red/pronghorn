-- Fix update_deployment_with_token to store empty string as empty string (not null)
-- This allows distinguishing between "never set" (null) and "explicitly cleared" ("")
DROP FUNCTION IF EXISTS public.update_deployment_with_token(uuid, uuid, text, deployment_environment, deployment_platform, text, text, text, text, text, text, uuid, jsonb, boolean, text, text, integer, text);

CREATE OR REPLACE FUNCTION public.update_deployment_with_token(
  p_deployment_id uuid,
  p_token uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_environment deployment_environment DEFAULT NULL,
  p_platform deployment_platform DEFAULT NULL,
  p_project_type text DEFAULT NULL,
  p_run_folder text DEFAULT NULL,
  p_build_folder text DEFAULT NULL,
  p_run_command text DEFAULT NULL,
  p_build_command text DEFAULT NULL,
  p_branch text DEFAULT NULL,
  p_repo_id uuid DEFAULT NULL,
  p_env_vars jsonb DEFAULT NULL,
  p_disk_enabled boolean DEFAULT NULL,
  p_disk_name text DEFAULT NULL,
  p_disk_mount_path text DEFAULT NULL,
  p_disk_size_gb integer DEFAULT NULL,
  p_install_command text DEFAULT NULL
)
RETURNS project_deployments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  result public.project_deployments;
BEGIN
  -- Get project_id from deployment
  SELECT project_id INTO v_project_id 
  FROM public.project_deployments 
  WHERE id = p_deployment_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deployment not found';
  END IF;

  PERFORM public.require_role(v_project_id, p_token, 'editor');

  UPDATE public.project_deployments SET
    name = COALESCE(p_name, name),
    environment = COALESCE(p_environment, environment),
    platform = COALESCE(p_platform, platform),
    project_type = COALESCE(p_project_type, project_type),
    run_folder = COALESCE(p_run_folder, run_folder),
    build_folder = COALESCE(p_build_folder, build_folder),
    run_command = COALESCE(p_run_command, run_command),
    build_command = COALESCE(p_build_command, build_command),
    branch = COALESCE(p_branch, branch),
    repo_id = COALESCE(p_repo_id, repo_id),
    env_vars = COALESCE(p_env_vars, env_vars),
    disk_enabled = COALESCE(p_disk_enabled, disk_enabled),
    disk_name = COALESCE(p_disk_name, disk_name),
    disk_mount_path = COALESCE(p_disk_mount_path, disk_mount_path),
    disk_size_gb = COALESCE(p_disk_size_gb, disk_size_gb),
    -- Store empty string as-is (don't use COALESCE which would skip empty strings)
    install_command = p_install_command,
    updated_at = now()
  WHERE id = p_deployment_id
  RETURNING * INTO result;

  RETURN result;
END;
$function$;