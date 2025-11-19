-- Add edge_type and style columns to canvas_edges for visual property persistence
ALTER TABLE canvas_edges 
ADD COLUMN IF NOT EXISTS edge_type TEXT DEFAULT 'default',
ADD COLUMN IF NOT EXISTS style JSONB DEFAULT '{}'::jsonb;

-- Update the upsert_canvas_edge_with_token function to include new columns
CREATE OR REPLACE FUNCTION public.upsert_canvas_edge_with_token(
  p_id uuid, 
  p_project_id uuid, 
  p_token uuid, 
  p_source_id uuid, 
  p_target_id uuid, 
  p_label text,
  p_edge_type text DEFAULT 'default',
  p_style jsonb DEFAULT '{}'::jsonb
)
RETURNS canvas_edges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.canvas_edges;
BEGIN
  PERFORM public.set_share_token(p_token::text);

  INSERT INTO public.canvas_edges (id, project_id, source_id, target_id, label, edge_type, style)
  VALUES (p_id, p_project_id, p_source_id, p_target_id, p_label, p_edge_type, p_style)
  ON CONFLICT (id) DO UPDATE
    SET
      source_id = EXCLUDED.source_id,
      target_id = EXCLUDED.target_id,
      label = EXCLUDED.label,
      edge_type = EXCLUDED.edge_type,
      style = EXCLUDED.style
  RETURNING * INTO result;

  RETURN result;
END;
$function$;