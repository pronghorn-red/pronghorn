-- Drop and recreate update_db_connection_with_token with new signature
DROP FUNCTION IF EXISTS public.update_db_connection_with_token(uuid,uuid,text,text,text,text,integer,text,text);
DROP FUNCTION IF EXISTS public.update_db_connection_with_token(uuid,uuid,text,text,text,text,integer,text);

-- Recreate update_db_connection_with_token to accept ca_certificate parameter
CREATE OR REPLACE FUNCTION public.update_db_connection_with_token(
  p_connection_id uuid,
  p_token uuid,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_ssl_mode text DEFAULT NULL,
  p_host text DEFAULT NULL,
  p_port integer DEFAULT NULL,
  p_database_name text DEFAULT NULL,
  p_ca_certificate text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from connection
  SELECT project_id INTO v_project_id
  FROM public.project_database_connections
  WHERE id = p_connection_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connection not found';
  END IF;

  -- Validate access - require owner role
  PERFORM public.require_role(v_project_id, p_token, 'owner');

  UPDATE public.project_database_connections
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    ssl_mode = COALESCE(p_ssl_mode, ssl_mode),
    host = COALESCE(p_host, host),
    port = COALESCE(p_port, port),
    database_name = COALESCE(p_database_name, database_name),
    ca_certificate = COALESCE(p_ca_certificate, ca_certificate),
    updated_at = now()
  WHERE id = p_connection_id;
END;
$$;