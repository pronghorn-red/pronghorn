-- Create deployment environment enum
CREATE TYPE public.deployment_environment AS ENUM ('development', 'staging', 'production');

-- Create deployment status enum
CREATE TYPE public.deployment_status AS ENUM ('pending', 'building', 'deploying', 'running', 'stopped', 'failed', 'deleted');

-- Create deployment platform enum
CREATE TYPE public.deployment_platform AS ENUM ('pronghorn_cloud', 'local', 'dedicated_vm');

-- Create project_deployments table
CREATE TABLE public.project_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  repo_id uuid REFERENCES public.project_repos(id) ON DELETE SET NULL,
  
  -- Deployment identity
  name text NOT NULL,
  environment deployment_environment NOT NULL DEFAULT 'development',
  platform deployment_platform NOT NULL DEFAULT 'pronghorn_cloud',
  
  -- Project configuration (deployment.json equivalent)
  project_type text NOT NULL DEFAULT 'node', -- node, python, go, react, vue, tanstack, monorepo
  run_folder text NOT NULL DEFAULT '/',
  build_folder text NOT NULL DEFAULT 'dist',
  run_command text NOT NULL DEFAULT 'npm run dev',
  build_command text DEFAULT 'npm run build',
  
  -- Render.com specific
  render_service_id text,
  render_deploy_id text,
  
  -- URLs
  url text,
  branch text DEFAULT 'main',
  
  -- Status
  status deployment_status NOT NULL DEFAULT 'pending',
  last_deployed_at timestamptz,
  
  -- Secrets (encrypted JSON, owner-only access)
  secrets jsonb DEFAULT '{}'::jsonb,
  env_vars jsonb DEFAULT '{}'::jsonb,
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create deployment_logs table
CREATE TABLE public.deployment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid NOT NULL REFERENCES public.project_deployments(id) ON DELETE CASCADE,
  
  log_type text NOT NULL DEFAULT 'info', -- info, warning, error, build, deploy
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_logs ENABLE ROW LEVEL SECURITY;

-- RLS for project_deployments (basic info accessible to project viewers, secrets only to owner)
CREATE POLICY "Users can access project deployments"
ON public.project_deployments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_deployments.project_id
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

-- RLS for deployment_logs
CREATE POLICY "Users can access deployment logs"
ON public.deployment_logs
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM project_deployments pd
    JOIN projects p ON p.id = pd.project_id
    WHERE pd.id = deployment_logs.deployment_id
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

-- Updated_at trigger for project_deployments
CREATE TRIGGER update_project_deployments_updated_at
BEFORE UPDATE ON public.project_deployments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes
CREATE INDEX idx_project_deployments_project_id ON public.project_deployments(project_id);
CREATE INDEX idx_project_deployments_status ON public.project_deployments(status);
CREATE INDEX idx_deployment_logs_deployment_id ON public.deployment_logs(deployment_id);
CREATE INDEX idx_deployment_logs_created_at ON public.deployment_logs(created_at DESC);

-- RPC: Get deployments for a project
CREATE OR REPLACE FUNCTION public.get_deployments_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  repo_id uuid,
  name text,
  environment deployment_environment,
  platform deployment_platform,
  project_type text,
  run_folder text,
  build_folder text,
  run_command text,
  build_command text,
  render_service_id text,
  url text,
  branch text,
  status deployment_status,
  last_deployed_at timestamptz,
  env_vars jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  
  RETURN QUERY
    SELECT 
      pd.id, pd.project_id, pd.repo_id, pd.name, pd.environment,
      pd.platform, pd.project_type, pd.run_folder, pd.build_folder,
      pd.run_command, pd.build_command, pd.render_service_id, pd.url,
      pd.branch, pd.status, pd.last_deployed_at, pd.env_vars,
      pd.created_at, pd.updated_at
    FROM public.project_deployments pd
    WHERE pd.project_id = p_project_id
    ORDER BY pd.created_at DESC;
END;
$function$;

-- RPC: Get single deployment with secrets (owner only)
CREATE OR REPLACE FUNCTION public.get_deployment_with_secrets_with_token(
  p_deployment_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS public.project_deployments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_role text;
  result public.project_deployments;
BEGIN
  SELECT project_id INTO v_project_id FROM public.project_deployments WHERE id = p_deployment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deployment not found'; END IF;
  
  v_role := public.authorize_project_access(v_project_id, p_token);
  IF v_role != 'owner' THEN RAISE EXCEPTION 'Owner access required for secrets'; END IF;
  
  SELECT * INTO result FROM public.project_deployments WHERE id = p_deployment_id;
  RETURN result;
END;
$function$;

-- RPC: Insert deployment
CREATE OR REPLACE FUNCTION public.insert_deployment_with_token(
  p_project_id uuid,
  p_token uuid,
  p_name text,
  p_environment deployment_environment DEFAULT 'development',
  p_platform deployment_platform DEFAULT 'pronghorn_cloud',
  p_project_type text DEFAULT 'node',
  p_run_folder text DEFAULT '/',
  p_build_folder text DEFAULT 'dist',
  p_run_command text DEFAULT 'npm run dev',
  p_build_command text DEFAULT 'npm run build',
  p_branch text DEFAULT 'main',
  p_repo_id uuid DEFAULT NULL
)
RETURNS public.project_deployments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.project_deployments;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'owner');
  
  INSERT INTO public.project_deployments (
    project_id, repo_id, name, environment, platform, project_type,
    run_folder, build_folder, run_command, build_command, branch, created_by
  )
  VALUES (
    p_project_id, p_repo_id, p_name, p_environment, p_platform, p_project_type,
    p_run_folder, p_build_folder, p_run_command, p_build_command, p_branch, auth.uid()
  )
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- RPC: Update deployment
CREATE OR REPLACE FUNCTION public.update_deployment_with_token(
  p_deployment_id uuid,
  p_token uuid,
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
RETURNS public.project_deployments
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
    status = COALESCE(p_status, status),
    url = COALESCE(p_url, url),
    render_service_id = COALESCE(p_render_service_id, render_service_id),
    render_deploy_id = COALESCE(p_render_deploy_id, render_deploy_id),
    env_vars = COALESCE(p_env_vars, env_vars),
    last_deployed_at = CASE WHEN p_status = 'running' THEN now() ELSE last_deployed_at END
  WHERE id = p_deployment_id
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- RPC: Update deployment secrets (owner only)
CREATE OR REPLACE FUNCTION public.update_deployment_secrets_with_token(
  p_deployment_id uuid,
  p_token uuid,
  p_secrets jsonb
)
RETURNS public.project_deployments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_role text;
  result public.project_deployments;
BEGIN
  SELECT project_id INTO v_project_id FROM public.project_deployments WHERE id = p_deployment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deployment not found'; END IF;
  
  v_role := public.authorize_project_access(v_project_id, p_token);
  IF v_role != 'owner' THEN RAISE EXCEPTION 'Owner access required for secrets'; END IF;
  
  UPDATE public.project_deployments SET secrets = p_secrets
  WHERE id = p_deployment_id
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- RPC: Delete deployment (owner only)
CREATE OR REPLACE FUNCTION public.delete_deployment_with_token(
  p_deployment_id uuid,
  p_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_role text;
BEGIN
  SELECT project_id INTO v_project_id FROM public.project_deployments WHERE id = p_deployment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deployment not found'; END IF;
  
  v_role := public.authorize_project_access(v_project_id, p_token);
  IF v_role != 'owner' THEN RAISE EXCEPTION 'Owner access required'; END IF;
  
  DELETE FROM public.project_deployments WHERE id = p_deployment_id;
END;
$function$;

-- RPC: Insert deployment log
CREATE OR REPLACE FUNCTION public.insert_deployment_log_with_token(
  p_deployment_id uuid,
  p_token uuid,
  p_log_type text,
  p_message text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.deployment_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  result public.deployment_logs;
BEGIN
  SELECT project_id INTO v_project_id FROM public.project_deployments WHERE id = p_deployment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deployment not found'; END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  INSERT INTO public.deployment_logs (deployment_id, log_type, message, metadata)
  VALUES (p_deployment_id, p_log_type, p_message, p_metadata)
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- RPC: Get deployment logs
CREATE OR REPLACE FUNCTION public.get_deployment_logs_with_token(
  p_deployment_id uuid,
  p_token uuid DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.deployment_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM public.project_deployments WHERE id = p_deployment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deployment not found'; END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  RETURN QUERY
    SELECT * FROM public.deployment_logs
    WHERE deployment_id = p_deployment_id
    ORDER BY created_at DESC
    LIMIT p_limit;
END;
$function$;