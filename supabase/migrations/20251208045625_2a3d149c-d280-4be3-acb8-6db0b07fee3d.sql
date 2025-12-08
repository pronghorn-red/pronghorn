-- Change deployment_environment enum from (development, staging, production) to (dev, uat, prod)
-- Must drop dependent functions first

-- Step 1: Drop functions that depend on the old enum
DROP FUNCTION IF EXISTS public.get_deployments_with_token(uuid, uuid);
DROP FUNCTION IF EXISTS public.insert_deployment_with_token(uuid, uuid, text, deployment_environment, deployment_platform, text, text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.update_deployment_with_token(uuid, uuid, text, deployment_environment, text, text, text, text, text, text, deployment_status, text, text, text, jsonb);

-- Step 2: Alter column to use text temporarily
ALTER TABLE public.project_deployments 
ALTER COLUMN environment DROP DEFAULT;

ALTER TABLE public.project_deployments 
ALTER COLUMN environment TYPE text 
USING environment::text;

-- Step 3: Update values
UPDATE public.project_deployments 
SET environment = CASE environment
  WHEN 'development' THEN 'dev'
  WHEN 'staging' THEN 'uat'
  WHEN 'production' THEN 'prod'
  ELSE environment
END;

-- Step 4: Drop old enum
DROP TYPE IF EXISTS public.deployment_environment;
DROP TYPE IF EXISTS public.deployment_environment_new;
DROP TYPE IF EXISTS public.deployment_environment_v2;

-- Step 5: Create new enum
CREATE TYPE public.deployment_environment AS ENUM ('dev', 'uat', 'prod');

-- Step 6: Convert column back to enum
ALTER TABLE public.project_deployments 
ALTER COLUMN environment TYPE deployment_environment 
USING environment::deployment_environment;

-- Step 7: Set default
ALTER TABLE public.project_deployments 
ALTER COLUMN environment SET DEFAULT 'dev'::deployment_environment;

-- Step 8: Recreate the functions with new enum type

-- get_deployments_with_token
CREATE OR REPLACE FUNCTION public.get_deployments_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS SETOF project_deployments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  RETURN QUERY SELECT * FROM project_deployments WHERE project_id = p_project_id ORDER BY created_at DESC;
END;
$function$;

-- insert_deployment_with_token
CREATE OR REPLACE FUNCTION public.insert_deployment_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_environment deployment_environment DEFAULT 'dev',
  p_platform deployment_platform DEFAULT 'pronghorn_cloud',
  p_project_type text DEFAULT 'node',
  p_run_folder text DEFAULT '/',
  p_build_folder text DEFAULT 'dist',
  p_run_command text DEFAULT 'npm run dev',
  p_build_command text DEFAULT 'npm run build',
  p_branch text DEFAULT 'main',
  p_repo_id uuid DEFAULT NULL
)
RETURNS project_deployments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result project_deployments;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  INSERT INTO project_deployments (
    project_id, name, environment, platform, project_type,
    run_folder, build_folder, run_command, build_command, branch, repo_id, created_by
  )
  VALUES (
    p_project_id, p_name, p_environment, p_platform, p_project_type,
    p_run_folder, p_build_folder, p_run_command, p_build_command, p_branch, p_repo_id, auth.uid()
  )
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- update_deployment_with_token
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
  p_status deployment_status DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_render_service_id text DEFAULT NULL,
  p_render_deploy_id text DEFAULT NULL,
  p_env_vars jsonb DEFAULT NULL
)
RETURNS project_deployments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  result project_deployments;
BEGIN
  SELECT project_id INTO v_project_id FROM project_deployments WHERE id = p_deployment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deployment not found'; END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  UPDATE project_deployments SET
    name = COALESCE(p_name, name),
    environment = COALESCE(p_environment, environment),
    project_type = COALESCE(p_project_type, project_type),
    run_folder = COALESCE(p_run_folder, run_folder),
    build_folder = COALESCE(p_build_folder, build_folder),
    run_command = COALESCE(p_run_command, run_command),
    build_command = COALESCE(p_build_command, build_command),
    branch = COALESCE(p_branch, branch),
    status = COALESCE(p_status, status),
    url = COALESCE(p_url, url),
    render_service_id = COALESCE(p_render_service_id, render_service_id),
    render_deploy_id = COALESCE(p_render_deploy_id, render_deploy_id),
    env_vars = COALESCE(p_env_vars, env_vars),
    updated_at = now(),
    last_deployed_at = CASE WHEN p_status = 'deploying' THEN now() ELSE last_deployed_at END
  WHERE id = p_deployment_id
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- Create deployment_issues table for local runner telemetry
CREATE TABLE IF NOT EXISTS public.deployment_issues (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deployment_id uuid NOT NULL REFERENCES public.project_deployments(id) ON DELETE CASCADE,
  issue_type text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  stack_trace text,
  file_path text,
  line_number integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  resolved boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on deployment_issues
ALTER TABLE public.deployment_issues ENABLE ROW LEVEL SECURITY;

-- RLS policy for deployment_issues
DROP POLICY IF EXISTS "Users can access deployment issues" ON public.deployment_issues;
CREATE POLICY "Users can access deployment issues" ON public.deployment_issues
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM project_deployments pd
    JOIN projects p ON p.id = pd.project_id
    WHERE pd.id = deployment_issues.deployment_id
    AND (
      p.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM project_tokens pt
        WHERE pt.project_id = p.id
        AND pt.token = (current_setting('app.share_token', true))::uuid
        AND (pt.expires_at IS NULL OR pt.expires_at > now())
      )
    )
  )
);