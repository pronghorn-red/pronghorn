-- Create project_database_connections table for external database connections
CREATE TABLE public.project_database_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  
  -- Connection details (sensitive!)
  connection_string text NOT NULL,
  
  -- Extracted display info (not credentials, just for UI)
  host text,
  port integer DEFAULT 5432,
  database_name text,
  ssl_mode text DEFAULT 'require',
  
  -- Connection status
  status text NOT NULL DEFAULT 'untested' CHECK (status IN ('untested', 'connected', 'failed')),
  last_connected_at timestamptz,
  last_error text,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_database_connections ENABLE ROW LEVEL SECURITY;

-- Owner-only access (most restrictive - connection strings are highly sensitive)
CREATE POLICY "Project owners can manage external connections"
ON public.project_database_connections
FOR ALL
USING (public.is_project_owner(project_id));

-- Create index for faster lookups
CREATE INDEX idx_project_database_connections_project_id ON public.project_database_connections(project_id);

-- RPC: Get connections WITHOUT connection_string (safe for UI)
CREATE OR REPLACE FUNCTION public.get_db_connections_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  project_id uuid,
  name text,
  description text,
  host text,
  port integer,
  database_name text,
  ssl_mode text,
  status text,
  last_connected_at timestamptz,
  last_error text,
  created_at timestamptz,
  created_by uuid,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Require owner role for security
  PERFORM public.require_role(p_project_id, p_token, 'owner');
  
  RETURN QUERY
  SELECT 
    c.id, c.project_id, c.name, c.description,
    c.host, c.port, c.database_name, c.ssl_mode,
    c.status, c.last_connected_at, c.last_error,
    c.created_at, c.created_by, c.updated_at
  FROM public.project_database_connections c
  WHERE c.project_id = p_project_id
  ORDER BY c.created_at DESC;
END;
$function$;

-- RPC: Get single connection WITHOUT connection_string
CREATE OR REPLACE FUNCTION public.get_db_connection_with_token(
  p_connection_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  project_id uuid,
  name text,
  description text,
  host text,
  port integer,
  database_name text,
  ssl_mode text,
  status text,
  last_connected_at timestamptz,
  last_error text,
  created_at timestamptz,
  created_by uuid,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from connection
  SELECT c.project_id INTO v_project_id 
  FROM public.project_database_connections c 
  WHERE c.id = p_connection_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connection not found';
  END IF;
  
  -- Require owner role
  PERFORM public.require_role(v_project_id, p_token, 'owner');
  
  RETURN QUERY
  SELECT 
    c.id, c.project_id, c.name, c.description,
    c.host, c.port, c.database_name, c.ssl_mode,
    c.status, c.last_connected_at, c.last_error,
    c.created_at, c.created_by, c.updated_at
  FROM public.project_database_connections c
  WHERE c.id = p_connection_id;
END;
$function$;

-- RPC: Get connection_string ONLY (for edge functions)
CREATE OR REPLACE FUNCTION public.get_db_connection_string_with_token(
  p_connection_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_connection_string text;
BEGIN
  -- Get project_id and connection_string
  SELECT c.project_id, c.connection_string INTO v_project_id, v_connection_string
  FROM public.project_database_connections c 
  WHERE c.id = p_connection_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connection not found';
  END IF;
  
  -- Require owner role - this is the most sensitive function
  PERFORM public.require_role(v_project_id, p_token, 'owner');
  
  RETURN v_connection_string;
END;
$function$;

-- RPC: Insert new connection
CREATE OR REPLACE FUNCTION public.insert_db_connection_with_token(
  p_project_id uuid,
  p_token uuid,
  p_name text,
  p_connection_string text,
  p_description text DEFAULT NULL,
  p_host text DEFAULT NULL,
  p_port integer DEFAULT 5432,
  p_database_name text DEFAULT NULL,
  p_ssl_mode text DEFAULT 'require'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  -- Require owner role
  PERFORM public.require_role(p_project_id, p_token, 'owner');
  
  INSERT INTO public.project_database_connections (
    project_id, name, connection_string, description,
    host, port, database_name, ssl_mode, created_by
  )
  VALUES (
    p_project_id, p_name, p_connection_string, p_description,
    p_host, p_port, p_database_name, p_ssl_mode, auth.uid()
  )
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$function$;

-- RPC: Update connection
CREATE OR REPLACE FUNCTION public.update_db_connection_with_token(
  p_connection_id uuid,
  p_token uuid,
  p_name text DEFAULT NULL,
  p_connection_string text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_host text DEFAULT NULL,
  p_port integer DEFAULT NULL,
  p_database_name text DEFAULT NULL,
  p_ssl_mode text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id
  SELECT c.project_id INTO v_project_id 
  FROM public.project_database_connections c 
  WHERE c.id = p_connection_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connection not found';
  END IF;
  
  -- Require owner role
  PERFORM public.require_role(v_project_id, p_token, 'owner');
  
  UPDATE public.project_database_connections SET
    name = COALESCE(p_name, name),
    connection_string = COALESCE(p_connection_string, connection_string),
    description = COALESCE(p_description, description),
    host = COALESCE(p_host, host),
    port = COALESCE(p_port, port),
    database_name = COALESCE(p_database_name, database_name),
    ssl_mode = COALESCE(p_ssl_mode, ssl_mode),
    updated_at = now()
  WHERE id = p_connection_id;
END;
$function$;

-- RPC: Update connection status (after test)
CREATE OR REPLACE FUNCTION public.update_db_connection_status_with_token(
  p_connection_id uuid,
  p_token uuid,
  p_status text,
  p_last_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id
  SELECT c.project_id INTO v_project_id 
  FROM public.project_database_connections c 
  WHERE c.id = p_connection_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connection not found';
  END IF;
  
  -- Require owner role
  PERFORM public.require_role(v_project_id, p_token, 'owner');
  
  UPDATE public.project_database_connections SET
    status = p_status,
    last_error = p_last_error,
    last_connected_at = CASE WHEN p_status = 'connected' THEN now() ELSE last_connected_at END,
    updated_at = now()
  WHERE id = p_connection_id;
END;
$function$;

-- RPC: Delete connection
CREATE OR REPLACE FUNCTION public.delete_db_connection_with_token(
  p_connection_id uuid,
  p_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id
  SELECT c.project_id INTO v_project_id 
  FROM public.project_database_connections c 
  WHERE c.id = p_connection_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connection not found';
  END IF;
  
  -- Require owner role
  PERFORM public.require_role(v_project_id, p_token, 'owner');
  
  DELETE FROM public.project_database_connections WHERE id = p_connection_id;
END;
$function$;