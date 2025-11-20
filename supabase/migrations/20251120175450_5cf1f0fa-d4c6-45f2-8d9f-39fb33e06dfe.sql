-- Create RPC function to delete canvas node with token validation
CREATE OR REPLACE FUNCTION public.delete_canvas_node_with_token(p_id uuid, p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.set_share_token(p_token::text);

  DELETE FROM public.canvas_nodes
  WHERE id = p_id;
END;
$function$;

-- Create RPC function to delete canvas edge with token validation
CREATE OR REPLACE FUNCTION public.delete_canvas_edge_with_token(p_id uuid, p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.set_share_token(p_token::text);

  DELETE FROM public.canvas_edges
  WHERE id = p_id;
END;
$function$;