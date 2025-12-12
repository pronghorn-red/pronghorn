-- Add disk mounting columns to project_deployments
ALTER TABLE project_deployments ADD COLUMN IF NOT EXISTS disk_enabled boolean DEFAULT false;
ALTER TABLE project_deployments ADD COLUMN IF NOT EXISTS disk_name text;
ALTER TABLE project_deployments ADD COLUMN IF NOT EXISTS disk_mount_path text DEFAULT '/data';
ALTER TABLE project_deployments ADD COLUMN IF NOT EXISTS disk_size_gb integer DEFAULT 1;

-- Update insert_deployment_with_token to accept disk parameters
CREATE OR REPLACE FUNCTION public.insert_deployment_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_environment deployment_environment DEFAULT 'dev',
  p_platform deployment_platform DEFAULT 'pronghorn_cloud',
  p_project_type text DEFAULT 'node',
  p_run_folder text DEFAULT '/',
  p_build_folder text DEFAULT '/',
  p_run_command text DEFAULT 'npm start',
  p_build_command text DEFAULT 'npm install',
  p_branch text DEFAULT 'main',
  p_env_vars jsonb DEFAULT '{}'::jsonb,
  p_disk_enabled boolean DEFAULT false,
  p_disk_name text DEFAULT NULL,
  p_disk_mount_path text DEFAULT '/data',
  p_disk_size_gb integer DEFAULT 1
)
RETURNS project_deployments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.project_deployments;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');

  INSERT INTO public.project_deployments (
    project_id, name, environment, platform, project_type,
    run_folder, build_folder, run_command, build_command, branch, env_vars,
    disk_enabled, disk_name, disk_mount_path, disk_size_gb
  )
  VALUES (
    p_project_id, p_name, p_environment, p_platform, p_project_type,
    p_run_folder, p_build_folder, p_run_command, p_build_command, p_branch, p_env_vars,
    p_disk_enabled, p_disk_name, p_disk_mount_path, p_disk_size_gb
  )
  RETURNING * INTO result;

  RETURN result;
END;
$function$;

-- Update update_deployment_with_token to accept disk parameters
CREATE OR REPLACE FUNCTION public.update_deployment_with_token(
  p_deployment_id uuid,
  p_token uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_environment deployment_environment DEFAULT NULL,
  p_project_type text DEFAULT NULL,
  p_run_folder text DEFAULT NULL,
  p_build_folder text DEFAULT NULL,
  p_run_command text DEFAULT NULL,
  p_build_command text DEFAULT NULL,
  p_branch text DEFAULT NULL,
  p_env_vars jsonb DEFAULT NULL,
  p_status deployment_status DEFAULT NULL,
  p_render_service_id text DEFAULT NULL,
  p_render_deploy_id text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_disk_enabled boolean DEFAULT NULL,
  p_disk_name text DEFAULT NULL,
  p_disk_mount_path text DEFAULT NULL,
  p_disk_size_gb integer DEFAULT NULL
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
  SELECT project_id INTO v_project_id FROM public.project_deployments WHERE id = p_deployment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deployment not found'; END IF;

  PERFORM public.require_role(v_project_id, p_token, 'editor');

  UPDATE public.project_deployments SET
    name = COALESCE(p_name, name),
    environment = COALESCE(p_environment, environment),
    project_type = COALESCE(p_project_type, project_type),
    run_folder = COALESCE(p_run_folder, run_folder),
    build_folder = COALESCE(p_build_folder, build_folder),
    run_command = COALESCE(p_run_command, run_command),
    build_command = COALESCE(p_build_command, build_command),
    branch = COALESCE(p_branch, branch),
    env_vars = COALESCE(p_env_vars, env_vars),
    status = COALESCE(p_status, status),
    render_service_id = COALESCE(p_render_service_id, render_service_id),
    render_deploy_id = COALESCE(p_render_deploy_id, render_deploy_id),
    url = COALESCE(p_url, url),
    disk_enabled = COALESCE(p_disk_enabled, disk_enabled),
    disk_name = COALESCE(p_disk_name, disk_name),
    disk_mount_path = COALESCE(p_disk_mount_path, disk_mount_path),
    disk_size_gb = COALESCE(p_disk_size_gb, disk_size_gb),
    updated_at = now()
  WHERE id = p_deployment_id
  RETURNING * INTO result;

  RETURN result;
END;
$function$;