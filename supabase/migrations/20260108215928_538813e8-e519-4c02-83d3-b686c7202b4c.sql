
-- Fix insert_deployment_with_token: Keep one version that supports ALL client params + repo_id + created_by

-- Drop all 3 existing versions
DROP FUNCTION IF EXISTS public.insert_deployment_with_token(uuid, uuid, text, deployment_environment, deployment_platform, text, text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.insert_deployment_with_token(uuid, uuid, text, deployment_environment, deployment_platform, text, text, text, text, text, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.insert_deployment_with_token(uuid, uuid, text, deployment_environment, deployment_platform, text, text, text, text, text, text, jsonb, boolean, text, text, integer);

-- Create single comprehensive version that supports ALL features
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
  p_repo_id uuid DEFAULT NULL,
  p_env_vars jsonb DEFAULT '{}',
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
  -- Validate access - require editor role
  PERFORM public.require_role(p_project_id, p_token, 'editor');

  INSERT INTO public.project_deployments (
    project_id, name, environment, platform, project_type,
    run_folder, build_folder, run_command, build_command, branch, 
    repo_id, env_vars, disk_enabled, disk_name, disk_mount_path, disk_size_gb,
    created_by
  )
  VALUES (
    p_project_id, p_name, p_environment, p_platform, p_project_type,
    p_run_folder, p_build_folder, p_run_command, p_build_command, p_branch,
    p_repo_id, p_env_vars, p_disk_enabled, p_disk_name, p_disk_mount_path, p_disk_size_gb,
    auth.uid()
  )
  RETURNING * INTO result;

  RETURN result;
END;
$function$;
