-- Fix layer RPC functions to accept nullable tokens for authenticated users

-- Drop existing functions
DROP FUNCTION IF EXISTS public.upsert_canvas_layer_with_token(uuid, uuid, uuid, text, text[], boolean);
DROP FUNCTION IF EXISTS public.delete_canvas_layer_with_token(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_canvas_layers_with_token(uuid, uuid);

-- Recreate with nullable token parameter and conditional token setting
CREATE OR REPLACE FUNCTION public.upsert_canvas_layer_with_token(
  p_id uuid,
  p_project_id uuid,
  p_token uuid DEFAULT NULL,
  p_name text DEFAULT 'Untitled Layer',
  p_node_ids text[] DEFAULT '{}',
  p_visible boolean DEFAULT true
)
RETURNS canvas_layers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result public.canvas_layers;
BEGIN
  -- Only set share token if provided (for anonymous users)
  IF p_token IS NOT NULL THEN
    PERFORM public.set_share_token(p_token::text);
  END IF;
  
  INSERT INTO public.canvas_layers (id, project_id, name, node_ids, visible)
  VALUES (p_id, p_project_id, p_name, p_node_ids, p_visible)
  ON CONFLICT (id) DO UPDATE
    SET
      name = EXCLUDED.name,
      node_ids = EXCLUDED.node_ids,
      visible = EXCLUDED.visible,
      updated_at = now()
  RETURNING * INTO result;
  
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_canvas_layer_with_token(
  p_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only set share token if provided (for anonymous users)
  IF p_token IS NOT NULL THEN
    PERFORM public.set_share_token(p_token::text);
  END IF;
  
  DELETE FROM public.canvas_layers
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_canvas_layers_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS SETOF canvas_layers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only set share token if provided (for anonymous users)
  IF p_token IS NOT NULL THEN
    PERFORM public.set_share_token(p_token::text);
  END IF;
  
  RETURN QUERY
    SELECT * FROM public.canvas_layers
    WHERE project_id = p_project_id
    ORDER BY created_at ASC;
END;
$$;