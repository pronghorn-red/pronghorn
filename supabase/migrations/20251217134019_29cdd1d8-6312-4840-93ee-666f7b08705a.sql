-- =============================================
-- Enable Saved Queries and Migrations for External Database Connections
-- =============================================

-- 1. Modify project_database_sql table
ALTER TABLE public.project_database_sql ALTER COLUMN database_id DROP NOT NULL;

ALTER TABLE public.project_database_sql 
ADD COLUMN connection_id uuid REFERENCES public.project_database_connections(id) ON DELETE CASCADE;

ALTER TABLE public.project_database_sql 
ADD CONSTRAINT chk_sql_database_or_connection 
CHECK (database_id IS NOT NULL OR connection_id IS NOT NULL);

CREATE INDEX idx_project_database_sql_connection_id ON public.project_database_sql(connection_id);

-- 2. Modify project_migrations table
ALTER TABLE public.project_migrations ALTER COLUMN database_id DROP NOT NULL;

ALTER TABLE public.project_migrations 
ADD COLUMN connection_id uuid REFERENCES public.project_database_connections(id) ON DELETE CASCADE;

ALTER TABLE public.project_migrations 
ADD CONSTRAINT chk_migrations_database_or_connection 
CHECK (database_id IS NOT NULL OR connection_id IS NOT NULL);

CREATE INDEX idx_project_migrations_connection_id ON public.project_migrations(connection_id);

-- 3. Update get_saved_queries_with_token to support connection_id
CREATE OR REPLACE FUNCTION public.get_saved_queries_with_token(
  p_database_id uuid DEFAULT NULL,
  p_connection_id uuid DEFAULT NULL,
  p_token uuid DEFAULT NULL
)
RETURNS SETOF public.project_database_sql
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Must provide either database_id or connection_id
  IF p_database_id IS NULL AND p_connection_id IS NULL THEN
    RAISE EXCEPTION 'Either p_database_id or p_connection_id must be provided';
  END IF;

  -- Get project_id from appropriate table
  IF p_database_id IS NOT NULL THEN
    SELECT project_id INTO v_project_id FROM public.project_databases WHERE id = p_database_id;
  ELSE
    SELECT project_id INTO v_project_id FROM public.project_database_connections WHERE id = p_connection_id;
  END IF;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'Database or connection not found'; END IF;

  PERFORM public.require_role(v_project_id, p_token, 'viewer');

  RETURN QUERY
  SELECT * FROM public.project_database_sql
  WHERE (p_database_id IS NOT NULL AND database_id = p_database_id)
     OR (p_connection_id IS NOT NULL AND connection_id = p_connection_id)
  ORDER BY updated_at DESC;
END;
$function$;

-- 4. Update insert_saved_query_with_token to support connection_id
CREATE OR REPLACE FUNCTION public.insert_saved_query_with_token(
  p_database_id uuid DEFAULT NULL,
  p_connection_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_sql_content text DEFAULT NULL,
  p_token uuid DEFAULT NULL
)
RETURNS public.project_database_sql
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_result public.project_database_sql;
BEGIN
  -- Must provide either database_id or connection_id
  IF p_database_id IS NULL AND p_connection_id IS NULL THEN
    RAISE EXCEPTION 'Either p_database_id or p_connection_id must be provided';
  END IF;

  -- Get project_id from appropriate table
  IF p_database_id IS NOT NULL THEN
    SELECT project_id INTO v_project_id FROM public.project_databases WHERE id = p_database_id;
  ELSE
    SELECT project_id INTO v_project_id FROM public.project_database_connections WHERE id = p_connection_id;
  END IF;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'Database or connection not found'; END IF;

  PERFORM public.require_role(v_project_id, p_token, 'editor');

  INSERT INTO public.project_database_sql (project_id, database_id, connection_id, name, description, sql_content, created_by)
  VALUES (v_project_id, p_database_id, p_connection_id, p_name, p_description, p_sql_content, auth.uid())
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;

-- 5. Update get_migrations_with_token to support connection_id
CREATE OR REPLACE FUNCTION public.get_migrations_with_token(
  p_database_id uuid DEFAULT NULL,
  p_connection_id uuid DEFAULT NULL,
  p_token uuid DEFAULT NULL
)
RETURNS SETOF public.project_migrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Must provide either database_id or connection_id
  IF p_database_id IS NULL AND p_connection_id IS NULL THEN
    RAISE EXCEPTION 'Either p_database_id or p_connection_id must be provided';
  END IF;

  -- Get project_id from appropriate table
  IF p_database_id IS NOT NULL THEN
    SELECT project_id INTO v_project_id FROM public.project_databases WHERE id = p_database_id;
  ELSE
    SELECT project_id INTO v_project_id FROM public.project_database_connections WHERE id = p_connection_id;
  END IF;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'Database or connection not found'; END IF;

  PERFORM public.require_role(v_project_id, p_token, 'viewer');

  RETURN QUERY
  SELECT * FROM public.project_migrations
  WHERE (p_database_id IS NOT NULL AND database_id = p_database_id)
     OR (p_connection_id IS NOT NULL AND connection_id = p_connection_id)
  ORDER BY sequence_number ASC;
END;
$function$;

-- 6. Update insert_migration_with_token to support connection_id
CREATE OR REPLACE FUNCTION public.insert_migration_with_token(
  p_database_id uuid DEFAULT NULL,
  p_connection_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_statement_type text DEFAULT NULL,
  p_object_type text DEFAULT NULL,
  p_object_schema text DEFAULT 'public',
  p_object_name text DEFAULT NULL,
  p_sql_content text DEFAULT NULL,
  p_token uuid DEFAULT NULL
)
RETURNS public.project_migrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_sequence_number integer;
  v_result public.project_migrations;
BEGIN
  -- Must provide either database_id or connection_id
  IF p_database_id IS NULL AND p_connection_id IS NULL THEN
    RAISE EXCEPTION 'Either p_database_id or p_connection_id must be provided';
  END IF;

  -- Get project_id from appropriate table
  IF p_database_id IS NOT NULL THEN
    SELECT project_id INTO v_project_id FROM public.project_databases WHERE id = p_database_id;
  ELSE
    SELECT project_id INTO v_project_id FROM public.project_database_connections WHERE id = p_connection_id;
  END IF;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'Database or connection not found'; END IF;

  PERFORM public.require_role(v_project_id, p_token, 'editor');

  -- Get next sequence number for this database/connection
  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_sequence_number
  FROM public.project_migrations
  WHERE (p_database_id IS NOT NULL AND database_id = p_database_id)
     OR (p_connection_id IS NOT NULL AND connection_id = p_connection_id);

  INSERT INTO public.project_migrations (
    project_id, database_id, connection_id, name, statement_type, object_type, 
    object_schema, object_name, sql_content, sequence_number, executed_by
  )
  VALUES (
    v_project_id, p_database_id, p_connection_id, p_name, p_statement_type, p_object_type,
    p_object_schema, p_object_name, p_sql_content, v_sequence_number, auth.uid()
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;

-- 7. Update RLS policies for project_database_sql to include external connections
DROP POLICY IF EXISTS "Users can access saved queries" ON public.project_database_sql;

CREATE POLICY "Users can access saved queries" ON public.project_database_sql
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_database_sql.project_id
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

-- 8. Update RLS policies for project_migrations to include external connections
DROP POLICY IF EXISTS "Users can access project migrations" ON public.project_migrations;

CREATE POLICY "Users can access project migrations" ON public.project_migrations
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_migrations.project_id
    AND (
      p.created_by = auth.uid()
      OR is_valid_token_for_project(p.id)
    )
  )
);