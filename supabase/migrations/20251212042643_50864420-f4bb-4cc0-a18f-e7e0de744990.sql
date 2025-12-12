-- Enum for database provider
CREATE TYPE public.database_provider AS ENUM ('render_postgres', 'supabase');

-- Enum for database status
CREATE TYPE public.database_status AS ENUM (
  'pending', 'creating', 'available', 'suspended', 
  'restarting', 'updating', 'failed', 'deleted'
);

-- Enum for database plan
CREATE TYPE public.database_plan AS ENUM (
  'free', 'starter', 'standard', 'pro', 'pro_plus', 'custom',
  'basic_256mb', 'basic_1gb', 'basic_4gb',
  'pro_4gb', 'pro_8gb', 'pro_16gb', 'pro_32gb', 'pro_64gb',
  'pro_128gb', 'pro_192gb', 'pro_256gb', 'pro_384gb', 'pro_512gb',
  'accelerated_16gb', 'accelerated_32gb', 'accelerated_64gb',
  'accelerated_128gb', 'accelerated_256gb', 'accelerated_384gb',
  'accelerated_512gb', 'accelerated_768gb', 'accelerated_1024gb'
);

-- Main table
CREATE TABLE public.project_databases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- Common fields
  name text NOT NULL,
  provider public.database_provider NOT NULL DEFAULT 'render_postgres',
  plan public.database_plan NOT NULL DEFAULT 'starter',
  status public.database_status NOT NULL DEFAULT 'pending',
  region text DEFAULT 'oregon',
  postgres_version text DEFAULT '16',
  
  -- Render-specific fields
  render_postgres_id text,
  dashboard_url text,
  
  -- Supabase-specific fields (for future)
  supabase_project_id text,
  supabase_url text,
  
  -- Connection info flag
  has_connection_info boolean DEFAULT false,
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS policies
ALTER TABLE public.project_databases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access project databases"
  ON public.project_databases FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_databases.project_id
    AND (p.created_by = auth.uid() OR public.is_valid_token_for_project(p.id))
  ));

-- Trigger for updated_at
CREATE TRIGGER update_project_databases_updated_at
  BEFORE UPDATE ON public.project_databases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RPC Functions
CREATE OR REPLACE FUNCTION public.get_databases_with_token(p_project_id uuid, p_token uuid DEFAULT NULL)
RETURNS SETOF public.project_databases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  RETURN QUERY SELECT * FROM public.project_databases WHERE project_id = p_project_id ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_database_with_token(p_database_id uuid, p_token uuid DEFAULT NULL)
RETURNS public.project_databases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
  result public.project_databases;
BEGIN
  SELECT project_id INTO v_project_id FROM public.project_databases WHERE id = p_database_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Database not found'; END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  SELECT * INTO result FROM public.project_databases WHERE id = p_database_id;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_database_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_provider public.database_provider DEFAULT 'render_postgres',
  p_plan public.database_plan DEFAULT 'starter',
  p_region text DEFAULT 'oregon',
  p_postgres_version text DEFAULT '16'
)
RETURNS public.project_databases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result public.project_databases;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  INSERT INTO public.project_databases (
    project_id, name, provider, plan, region, postgres_version, created_by
  )
  VALUES (
    p_project_id, p_name, p_provider, p_plan, p_region, p_postgres_version, auth.uid()
  )
  RETURNING * INTO result;
  
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_database_with_token(
  p_database_id uuid,
  p_token uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_plan public.database_plan DEFAULT NULL,
  p_status public.database_status DEFAULT NULL,
  p_render_postgres_id text DEFAULT NULL,
  p_dashboard_url text DEFAULT NULL,
  p_has_connection_info boolean DEFAULT NULL
)
RETURNS public.project_databases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
  result public.project_databases;
BEGIN
  SELECT project_id INTO v_project_id FROM public.project_databases WHERE id = p_database_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Database not found'; END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  UPDATE public.project_databases SET
    name = COALESCE(p_name, name),
    plan = COALESCE(p_plan, plan),
    status = COALESCE(p_status, status),
    render_postgres_id = COALESCE(p_render_postgres_id, render_postgres_id),
    dashboard_url = COALESCE(p_dashboard_url, dashboard_url),
    has_connection_info = COALESCE(p_has_connection_info, has_connection_info),
    updated_at = now()
  WHERE id = p_database_id
  RETURNING * INTO result;
  
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_database_with_token(p_database_id uuid, p_token uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM public.project_databases WHERE id = p_database_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Database not found'; END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'owner');
  
  DELETE FROM public.project_databases WHERE id = p_database_id;
END;
$$;