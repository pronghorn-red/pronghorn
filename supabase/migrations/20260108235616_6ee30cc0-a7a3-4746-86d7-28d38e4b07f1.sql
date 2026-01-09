-- Create project_agents table for storing customizable agent configurations
CREATE TABLE public.project_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  agent_type text NOT NULL DEFAULT 'coding-agent-orchestrator',
  name text NOT NULL,
  description text,
  version text NOT NULL DEFAULT '1.0.0',
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, agent_type)
);

-- Enable RLS
ALTER TABLE public.project_agents ENABLE ROW LEVEL SECURITY;

-- RLS Policies using the project's RBAC pattern
CREATE POLICY "project_agents_select" ON public.project_agents
FOR SELECT USING (
  public.authorize_project_access(project_id, (current_setting('app.share_token', true))::uuid) IS NOT NULL
);

CREATE POLICY "project_agents_insert" ON public.project_agents
FOR INSERT WITH CHECK (
  public.require_role(project_id, (current_setting('app.share_token', true))::uuid, 'editor') IS NOT NULL
);

CREATE POLICY "project_agents_update" ON public.project_agents
FOR UPDATE USING (
  public.require_role(project_id, (current_setting('app.share_token', true))::uuid, 'editor') IS NOT NULL
);

CREATE POLICY "project_agents_delete" ON public.project_agents
FOR DELETE USING (
  public.require_role(project_id, (current_setting('app.share_token', true))::uuid, 'editor') IS NOT NULL
);

-- Create trigger for updated_at
CREATE TRIGGER update_project_agents_updated_at
BEFORE UPDATE ON public.project_agents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: Get project agent configuration
CREATE OR REPLACE FUNCTION public.get_project_agent_with_token(
  p_project_id uuid,
  p_token uuid,
  p_agent_type text DEFAULT 'coding-agent-orchestrator'
)
RETURNS TABLE(
  id uuid,
  project_id uuid,
  agent_type text,
  name text,
  description text,
  version text,
  sections jsonb,
  is_default boolean,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate access - require at least viewer
  PERFORM public.require_role(p_project_id, p_token, 'viewer');

  RETURN QUERY
  SELECT 
    pa.id,
    pa.project_id,
    pa.agent_type,
    pa.name,
    pa.description,
    pa.version,
    pa.sections,
    pa.is_default,
    pa.created_by,
    pa.created_at,
    pa.updated_at
  FROM public.project_agents pa
  WHERE pa.project_id = p_project_id
    AND pa.agent_type = p_agent_type;
END;
$function$;

-- RPC: Upsert project agent configuration
CREATE OR REPLACE FUNCTION public.upsert_project_agent_with_token(
  p_project_id uuid,
  p_token uuid,
  p_agent_type text,
  p_name text,
  p_description text DEFAULT NULL,
  p_version text DEFAULT '1.0.0',
  p_sections jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agent_id uuid;
BEGIN
  -- Validate access - require at least editor
  PERFORM public.require_role(p_project_id, p_token, 'editor');

  INSERT INTO public.project_agents (
    project_id,
    agent_type,
    name,
    description,
    version,
    sections,
    created_by
  ) VALUES (
    p_project_id,
    p_agent_type,
    p_name,
    p_description,
    p_version,
    p_sections,
    auth.uid()
  )
  ON CONFLICT (project_id, agent_type)
  DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    version = EXCLUDED.version,
    sections = EXCLUDED.sections,
    updated_at = now()
  RETURNING id INTO v_agent_id;

  RETURN v_agent_id;
END;
$function$;

-- RPC: Delete project agent configuration (reset to defaults)
CREATE OR REPLACE FUNCTION public.delete_project_agent_with_token(
  p_project_id uuid,
  p_token uuid,
  p_agent_type text DEFAULT 'coding-agent-orchestrator'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate access - require at least editor
  PERFORM public.require_role(p_project_id, p_token, 'editor');

  DELETE FROM public.project_agents
  WHERE project_id = p_project_id
    AND agent_type = p_agent_type;

  RETURN true;
END;
$function$;