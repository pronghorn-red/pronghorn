-- 1. Add ca_certificate column to project_database_connections
ALTER TABLE public.project_database_connections 
ADD COLUMN IF NOT EXISTS ca_certificate text;

COMMENT ON COLUMN public.project_database_connections.ca_certificate IS 
'PEM-encoded CA certificate bundle for TLS verification. User-provided via URL or file upload.';

-- 2. Create get_db_connection_secrets_with_token function
-- This returns both connection_string and ca_certificate for secure retrieval
CREATE OR REPLACE FUNCTION public.get_db_connection_secrets_with_token(
  p_connection_id uuid,
  p_token uuid
)
RETURNS TABLE(connection_string text, ca_certificate text)
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

  -- Validate access - require at least owner role to read secrets
  PERFORM public.require_role(v_project_id, p_token, 'owner');

  RETURN QUERY
  SELECT pdc.connection_string, pdc.ca_certificate
  FROM public.project_database_connections pdc
  WHERE pdc.id = p_connection_id;
END;
$$;