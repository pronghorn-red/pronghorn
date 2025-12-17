-- RPC function to get saved queries by connection ID
CREATE OR REPLACE FUNCTION public.get_saved_queries_by_connection_with_token(p_connection_id uuid, p_token uuid DEFAULT NULL::uuid)
RETURNS SETOF project_database_sql
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from connection
  SELECT project_id INTO v_project_id FROM public.project_database_connections WHERE id = p_connection_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connection not found';
  END IF;

  -- Validate access (viewer+ can read)
  PERFORM public.require_role(v_project_id, p_token, 'viewer');

  RETURN QUERY
  SELECT * FROM public.project_database_sql
  WHERE connection_id = p_connection_id
  ORDER BY updated_at DESC;
END;
$function$;

-- RPC function to get migrations by connection ID
CREATE OR REPLACE FUNCTION public.get_migrations_by_connection_with_token(p_connection_id uuid, p_token uuid DEFAULT NULL::uuid)
RETURNS SETOF project_migrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from connection
  SELECT project_id INTO v_project_id FROM public.project_database_connections WHERE id = p_connection_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connection not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  RETURN QUERY
  SELECT * FROM public.project_migrations
  WHERE connection_id = p_connection_id
  ORDER BY sequence_number ASC;
END;
$function$;