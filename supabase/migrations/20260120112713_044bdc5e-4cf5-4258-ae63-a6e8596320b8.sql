-- Create RPC function to delete ALL migrations for a specific database
-- Supports both Render databases (database_id) and external connections (connection_id)
CREATE OR REPLACE FUNCTION public.delete_all_migrations_with_token(
  p_project_id uuid,
  p_database_id uuid DEFAULT NULL,
  p_connection_id uuid DEFAULT NULL,
  p_token uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted_count integer;
BEGIN
  -- Validate that at least one of database_id or connection_id is provided
  IF p_database_id IS NULL AND p_connection_id IS NULL THEN
    RAISE EXCEPTION 'Either database_id or connection_id must be provided';
  END IF;

  -- Validate access - require at least editor role
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  -- Delete all migrations for this database/connection and get count
  WITH deleted AS (
    DELETE FROM public.project_migrations
    WHERE project_id = p_project_id
      AND (
        (p_database_id IS NOT NULL AND database_id = p_database_id)
        OR
        (p_connection_id IS NOT NULL AND connection_id = p_connection_id)
      )
    RETURNING *
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;
  
  RETURN v_deleted_count;
END;
$function$;