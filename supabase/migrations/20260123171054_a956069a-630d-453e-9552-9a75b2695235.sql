-- ============================================
-- Multi-Canvas Architecture Migration
-- Phase 1 & 2: Schema + RPC Functions
-- ============================================

-- 1. Create project_canvases table
CREATE TABLE public.project_canvases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Canvas 1',
  description text,
  tags text[] DEFAULT '{}',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Index for fast project lookup
CREATE INDEX idx_project_canvases_project_id ON public.project_canvases(project_id);

-- Unique constraint: only one default canvas per project
CREATE UNIQUE INDEX idx_project_canvases_default ON public.project_canvases(project_id) WHERE is_default = true;

-- Enable RLS
ALTER TABLE public.project_canvases ENABLE ROW LEVEL SECURITY;

-- RLS policy using current_setting pattern (consistent with other tables)
CREATE POLICY "Project canvases access via share_token" ON public.project_canvases
  FOR ALL USING (
    public.validate_project_access(
      project_id, 
      NULLIF(current_setting('app.share_token', true), '')::uuid
    )
  );

-- 2. Add canvas_id columns to existing tables (nullable for backward compat)
ALTER TABLE public.canvas_nodes ADD COLUMN IF NOT EXISTS canvas_id uuid;
ALTER TABLE public.canvas_edges ADD COLUMN IF NOT EXISTS canvas_id uuid;
ALTER TABLE public.canvas_layers ADD COLUMN IF NOT EXISTS canvas_id uuid;

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_canvas_id ON public.canvas_nodes(canvas_id);
CREATE INDEX IF NOT EXISTS idx_canvas_edges_canvas_id ON public.canvas_edges(canvas_id);
CREATE INDEX IF NOT EXISTS idx_canvas_layers_canvas_id ON public.canvas_layers(canvas_id);

-- 3. Add foreign key constraints
ALTER TABLE public.canvas_nodes 
  ADD CONSTRAINT canvas_nodes_canvas_id_fkey 
  FOREIGN KEY (canvas_id) REFERENCES public.project_canvases(id) ON DELETE CASCADE;

ALTER TABLE public.canvas_edges 
  ADD CONSTRAINT canvas_edges_canvas_id_fkey 
  FOREIGN KEY (canvas_id) REFERENCES public.project_canvases(id) ON DELETE CASCADE;

ALTER TABLE public.canvas_layers 
  ADD CONSTRAINT canvas_layers_canvas_id_fkey 
  FOREIGN KEY (canvas_id) REFERENCES public.project_canvases(id) ON DELETE CASCADE;

-- ============================================
-- RPC Functions for Canvas Management
-- ============================================

-- Get all canvases for a project
CREATE OR REPLACE FUNCTION public.get_project_canvases_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS SETOF project_canvases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  RETURN QUERY SELECT * FROM public.project_canvases 
    WHERE project_id = p_project_id 
    ORDER BY is_default DESC, created_at ASC;
END;
$function$;

-- Upsert canvas
CREATE OR REPLACE FUNCTION public.upsert_project_canvas_with_token(
  p_id uuid,
  p_project_id uuid,
  p_token uuid DEFAULT NULL,
  p_name text DEFAULT 'Untitled Canvas',
  p_description text DEFAULT NULL,
  p_tags text[] DEFAULT '{}',
  p_is_default boolean DEFAULT false
)
RETURNS project_canvases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.project_canvases;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  -- If setting as default, unset other defaults first
  IF p_is_default THEN
    UPDATE public.project_canvases 
    SET is_default = false, updated_at = now()
    WHERE project_id = p_project_id AND is_default = true AND id != p_id;
  END IF;
  
  INSERT INTO public.project_canvases (id, project_id, name, description, tags, is_default)
  VALUES (p_id, p_project_id, p_name, p_description, p_tags, p_is_default)
  ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, 
    description = EXCLUDED.description,
    tags = EXCLUDED.tags,
    is_default = EXCLUDED.is_default,
    updated_at = now()
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- Delete canvas
CREATE OR REPLACE FUNCTION public.delete_project_canvas_with_token(
  p_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM public.project_canvases WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Canvas not found'; END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Cascading delete handles nodes, edges, layers
  DELETE FROM public.project_canvases WHERE id = p_id;
END;
$function$;

-- Helper: Get or create default canvas for backward compatibility
CREATE OR REPLACE FUNCTION public.get_or_create_default_canvas(
  p_project_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_canvas_id uuid;
BEGIN
  -- Check for existing default canvas
  SELECT id INTO v_canvas_id 
  FROM public.project_canvases 
  WHERE project_id = p_project_id AND is_default = true
  LIMIT 1;
  
  IF v_canvas_id IS NOT NULL THEN
    RETURN v_canvas_id;
  END IF;
  
  -- Require editor role to create new canvas
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  -- Create default canvas
  INSERT INTO public.project_canvases (project_id, name, is_default)
  VALUES (p_project_id, 'Canvas 1', true)
  RETURNING id INTO v_canvas_id;
  
  RETURN v_canvas_id;
END;
$function$;

-- Migrate legacy canvas data to a specific canvas
CREATE OR REPLACE FUNCTION public.migrate_legacy_canvas_data(
  p_project_id uuid,
  p_canvas_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  -- Update all legacy nodes to the specified canvas
  UPDATE public.canvas_nodes 
  SET canvas_id = p_canvas_id, updated_at = now()
  WHERE project_id = p_project_id AND canvas_id IS NULL;
  
  -- Update all legacy edges
  UPDATE public.canvas_edges 
  SET canvas_id = p_canvas_id
  WHERE project_id = p_project_id AND canvas_id IS NULL;
  
  -- Update all legacy layers
  UPDATE public.canvas_layers 
  SET canvas_id = p_canvas_id, updated_at = now()
  WHERE project_id = p_project_id AND canvas_id IS NULL;
END;
$function$;

-- ============================================
-- Update Existing RPC Functions with p_canvas_id
-- ============================================

-- Update get_canvas_nodes_with_token
DROP FUNCTION IF EXISTS public.get_canvas_nodes_with_token(uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_canvas_nodes_with_token(
  p_project_id uuid, 
  p_token uuid DEFAULT NULL,
  p_canvas_id uuid DEFAULT NULL
)
RETURNS SETOF canvas_nodes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  
  IF p_canvas_id IS NOT NULL THEN
    -- Specific canvas requested
    RETURN QUERY SELECT * FROM public.canvas_nodes 
      WHERE project_id = p_project_id AND canvas_id = p_canvas_id;
  ELSE
    -- Backward compat: return legacy (NULL canvas_id) OR default canvas
    RETURN QUERY SELECT * FROM public.canvas_nodes 
      WHERE project_id = p_project_id 
        AND (canvas_id IS NULL OR canvas_id = (
          SELECT id FROM public.project_canvases 
          WHERE project_id = p_project_id AND is_default = true
          LIMIT 1
        ));
  END IF;
END;
$function$;

-- Update get_canvas_edges_with_token
DROP FUNCTION IF EXISTS public.get_canvas_edges_with_token(uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_canvas_edges_with_token(
  p_project_id uuid, 
  p_token uuid DEFAULT NULL,
  p_canvas_id uuid DEFAULT NULL
)
RETURNS SETOF canvas_edges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  
  IF p_canvas_id IS NOT NULL THEN
    RETURN QUERY SELECT * FROM public.canvas_edges 
      WHERE project_id = p_project_id AND canvas_id = p_canvas_id;
  ELSE
    RETURN QUERY SELECT * FROM public.canvas_edges 
      WHERE project_id = p_project_id 
        AND (canvas_id IS NULL OR canvas_id = (
          SELECT id FROM public.project_canvases 
          WHERE project_id = p_project_id AND is_default = true
          LIMIT 1
        ));
  END IF;
END;
$function$;

-- Update get_canvas_layers_with_token
DROP FUNCTION IF EXISTS public.get_canvas_layers_with_token(uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_canvas_layers_with_token(
  p_project_id uuid, 
  p_token uuid DEFAULT NULL,
  p_canvas_id uuid DEFAULT NULL
)
RETURNS SETOF canvas_layers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  
  IF p_canvas_id IS NOT NULL THEN
    RETURN QUERY SELECT * FROM public.canvas_layers 
      WHERE project_id = p_project_id AND canvas_id = p_canvas_id;
  ELSE
    RETURN QUERY SELECT * FROM public.canvas_layers 
      WHERE project_id = p_project_id 
        AND (canvas_id IS NULL OR canvas_id = (
          SELECT id FROM public.project_canvases 
          WHERE project_id = p_project_id AND is_default = true
          LIMIT 1
        ));
  END IF;
END;
$function$;

-- Update upsert_canvas_node_with_token
DROP FUNCTION IF EXISTS public.upsert_canvas_node_with_token(uuid, uuid, uuid, node_type, jsonb, jsonb);
CREATE OR REPLACE FUNCTION public.upsert_canvas_node_with_token(
  p_id uuid, 
  p_project_id uuid, 
  p_token uuid DEFAULT NULL, 
  p_type node_type DEFAULT NULL, 
  p_position jsonb DEFAULT NULL, 
  p_data jsonb DEFAULT NULL,
  p_canvas_id uuid DEFAULT NULL
)
RETURNS canvas_nodes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.canvas_nodes;
  v_canvas_id uuid;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  -- Determine canvas_id to use
  IF p_canvas_id IS NOT NULL THEN
    v_canvas_id := p_canvas_id;
  ELSE
    -- Check if node already exists and has a canvas_id
    SELECT canvas_id INTO v_canvas_id FROM public.canvas_nodes WHERE id = p_id;
    -- If still NULL, try to get default canvas (but don't create one)
    IF v_canvas_id IS NULL THEN
      SELECT id INTO v_canvas_id FROM public.project_canvases 
        WHERE project_id = p_project_id AND is_default = true LIMIT 1;
    END IF;
  END IF;
  
  INSERT INTO public.canvas_nodes (id, project_id, type, position, data, canvas_id)
  VALUES (p_id, p_project_id, p_type, p_position, p_data, v_canvas_id)
  ON CONFLICT (id) DO UPDATE SET 
    type = COALESCE(EXCLUDED.type, canvas_nodes.type), 
    position = COALESCE(EXCLUDED.position, canvas_nodes.position), 
    data = COALESCE(EXCLUDED.data, canvas_nodes.data),
    canvas_id = COALESCE(EXCLUDED.canvas_id, canvas_nodes.canvas_id),
    updated_at = now()
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- Update upsert_canvas_edge_with_token
DROP FUNCTION IF EXISTS public.upsert_canvas_edge_with_token(uuid, uuid, uuid, uuid, uuid, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.upsert_canvas_edge_with_token(
  p_id uuid, 
  p_project_id uuid, 
  p_token uuid DEFAULT NULL, 
  p_source_id uuid DEFAULT NULL, 
  p_target_id uuid DEFAULT NULL, 
  p_label text DEFAULT NULL,
  p_edge_type text DEFAULT 'default',
  p_style jsonb DEFAULT NULL,
  p_canvas_id uuid DEFAULT NULL
)
RETURNS canvas_edges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.canvas_edges;
  v_canvas_id uuid;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  -- Determine canvas_id to use
  IF p_canvas_id IS NOT NULL THEN
    v_canvas_id := p_canvas_id;
  ELSE
    -- Check if edge already exists and has a canvas_id
    SELECT canvas_id INTO v_canvas_id FROM public.canvas_edges WHERE id = p_id;
    -- If still NULL, try to get default canvas
    IF v_canvas_id IS NULL THEN
      SELECT id INTO v_canvas_id FROM public.project_canvases 
        WHERE project_id = p_project_id AND is_default = true LIMIT 1;
    END IF;
  END IF;
  
  INSERT INTO public.canvas_edges (id, project_id, source_id, target_id, label, edge_type, style, canvas_id)
  VALUES (p_id, p_project_id, p_source_id, p_target_id, p_label, p_edge_type, p_style, v_canvas_id)
  ON CONFLICT (id) DO UPDATE SET 
    source_id = COALESCE(EXCLUDED.source_id, canvas_edges.source_id), 
    target_id = COALESCE(EXCLUDED.target_id, canvas_edges.target_id), 
    label = EXCLUDED.label,
    edge_type = COALESCE(EXCLUDED.edge_type, canvas_edges.edge_type),
    style = COALESCE(EXCLUDED.style, canvas_edges.style),
    canvas_id = COALESCE(EXCLUDED.canvas_id, canvas_edges.canvas_id)
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- Update upsert_canvas_layer_with_token
DROP FUNCTION IF EXISTS public.upsert_canvas_layer_with_token(uuid, uuid, uuid, text, text[], boolean);
CREATE OR REPLACE FUNCTION public.upsert_canvas_layer_with_token(
  p_id uuid, 
  p_project_id uuid, 
  p_token uuid DEFAULT NULL, 
  p_name text DEFAULT 'Untitled Layer', 
  p_node_ids text[] DEFAULT '{}', 
  p_visible boolean DEFAULT true,
  p_canvas_id uuid DEFAULT NULL
)
RETURNS canvas_layers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.canvas_layers;
  v_canvas_id uuid;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  -- Determine canvas_id to use
  IF p_canvas_id IS NOT NULL THEN
    v_canvas_id := p_canvas_id;
  ELSE
    -- Check if layer already exists and has a canvas_id
    SELECT canvas_id INTO v_canvas_id FROM public.canvas_layers WHERE id = p_id;
    -- If still NULL, try to get default canvas
    IF v_canvas_id IS NULL THEN
      SELECT id INTO v_canvas_id FROM public.project_canvases 
        WHERE project_id = p_project_id AND is_default = true LIMIT 1;
    END IF;
  END IF;
  
  INSERT INTO public.canvas_layers (id, project_id, name, node_ids, visible, canvas_id)
  VALUES (p_id, p_project_id, p_name, p_node_ids, p_visible, v_canvas_id)
  ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name, 
    node_ids = EXCLUDED.node_ids, 
    visible = EXCLUDED.visible,
    canvas_id = COALESCE(EXCLUDED.canvas_id, canvas_layers.canvas_id),
    updated_at = now()
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- Update get_canvas_summary_with_token
DROP FUNCTION IF EXISTS public.get_canvas_summary_with_token(uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_canvas_summary_with_token(
  p_project_id uuid, 
  p_token uuid DEFAULT NULL,
  p_canvas_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  
  SELECT jsonb_build_object(
    'node_count', (SELECT count(*) FROM public.canvas_nodes WHERE project_id = p_project_id AND (p_canvas_id IS NULL AND (canvas_id IS NULL OR canvas_id = (SELECT id FROM public.project_canvases WHERE project_id = p_project_id AND is_default = true LIMIT 1)) OR canvas_id = p_canvas_id)),
    'edge_count', (SELECT count(*) FROM public.canvas_edges WHERE project_id = p_project_id AND (p_canvas_id IS NULL AND (canvas_id IS NULL OR canvas_id = (SELECT id FROM public.project_canvases WHERE project_id = p_project_id AND is_default = true LIMIT 1)) OR canvas_id = p_canvas_id)),
    'layer_count', (SELECT count(*) FROM public.canvas_layers WHERE project_id = p_project_id AND (p_canvas_id IS NULL AND (canvas_id IS NULL OR canvas_id = (SELECT id FROM public.project_canvases WHERE project_id = p_project_id AND is_default = true LIMIT 1)) OR canvas_id = p_canvas_id)),
    'nodes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'type', type,
        'label', data->>'label'
      ))
      FROM public.canvas_nodes 
      WHERE project_id = p_project_id 
        AND (p_canvas_id IS NULL AND (canvas_id IS NULL OR canvas_id = (SELECT id FROM public.project_canvases WHERE project_id = p_project_id AND is_default = true LIMIT 1)) OR canvas_id = p_canvas_id)
    ), '[]'::jsonb)
  ) INTO result;
  
  RETURN result;
END;
$function$;