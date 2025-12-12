-- First drop the dependent functions
DROP FUNCTION IF EXISTS public.insert_database_with_token(uuid, uuid, text, database_provider, database_plan, text, text);
DROP FUNCTION IF EXISTS public.update_database_with_token(uuid, uuid, text, database_plan, database_status, text, text, boolean);

-- Remove default from column temporarily
ALTER TABLE project_databases ALTER COLUMN plan DROP DEFAULT;

-- Convert column to text
ALTER TABLE project_databases ALTER COLUMN plan TYPE text;

-- Drop old enum
DROP TYPE IF EXISTS database_plan;
DROP TYPE IF EXISTS database_plan_new;

-- Create new enum with all valid Render plans
CREATE TYPE database_plan AS ENUM (
  'free',
  'basic_256mb', 'basic_1gb', 'basic_4gb',
  'pro_4gb', 'pro_8gb', 'pro_16gb', 'pro_32gb', 'pro_64gb',
  'pro_128gb', 'pro_192gb', 'pro_256gb', 'pro_384gb', 'pro_512gb',
  'accelerated_16gb', 'accelerated_32gb', 'accelerated_64gb',
  'accelerated_128gb', 'accelerated_256gb', 'accelerated_384gb',
  'accelerated_512gb', 'accelerated_768gb', 'accelerated_1024gb'
);

-- Update legacy values to valid enum
UPDATE project_databases 
SET plan = 'basic_256mb' 
WHERE plan IN ('starter', 'standard', 'pro', 'pro_plus', 'custom') OR plan IS NULL;

-- Convert column back to enum
ALTER TABLE project_databases ALTER COLUMN plan TYPE database_plan USING plan::database_plan;
ALTER TABLE project_databases ALTER COLUMN plan SET DEFAULT 'basic_256mb'::database_plan;

-- Add new columns
ALTER TABLE project_databases 
ADD COLUMN IF NOT EXISTS database_user text,
ADD COLUMN IF NOT EXISTS database_internal_name text,
ADD COLUMN IF NOT EXISTS ip_allow_list jsonb DEFAULT '[]'::jsonb;

-- Recreate insert_database_with_token with new fields
CREATE OR REPLACE FUNCTION public.insert_database_with_token(
  p_project_id uuid, 
  p_token uuid DEFAULT NULL, 
  p_name text DEFAULT NULL, 
  p_provider database_provider DEFAULT 'render_postgres', 
  p_plan database_plan DEFAULT 'basic_256mb', 
  p_region text DEFAULT 'oregon', 
  p_postgres_version text DEFAULT '16',
  p_database_user text DEFAULT NULL,
  p_database_internal_name text DEFAULT NULL,
  p_ip_allow_list jsonb DEFAULT '[]'
)
RETURNS project_databases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.project_databases;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  INSERT INTO public.project_databases (
    project_id, name, provider, plan, region, postgres_version, 
    database_user, database_internal_name, ip_allow_list, created_by
  )
  VALUES (
    p_project_id, p_name, p_provider, p_plan, p_region, p_postgres_version,
    p_database_user, p_database_internal_name, p_ip_allow_list, auth.uid()
  )
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- Recreate update_database_with_token with new fields
CREATE OR REPLACE FUNCTION public.update_database_with_token(
  p_database_id uuid, 
  p_token uuid DEFAULT NULL, 
  p_name text DEFAULT NULL, 
  p_plan database_plan DEFAULT NULL, 
  p_status database_status DEFAULT NULL, 
  p_render_postgres_id text DEFAULT NULL, 
  p_dashboard_url text DEFAULT NULL, 
  p_has_connection_info boolean DEFAULT NULL,
  p_ip_allow_list jsonb DEFAULT NULL
)
RETURNS project_databases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    ip_allow_list = COALESCE(p_ip_allow_list, ip_allow_list),
    updated_at = now()
  WHERE id = p_database_id
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;