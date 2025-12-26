-- Function to delete an audit graph node
CREATE OR REPLACE FUNCTION public.delete_audit_graph_node_with_token(
  p_node_id uuid,
  p_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_session_id uuid;
  v_project_id uuid;
BEGIN
  -- Get the session and project from the node
  SELECT n.session_id, s.project_id INTO v_session_id, v_project_id
  FROM public.audit_graph_nodes n
  JOIN public.audit_sessions s ON s.id = n.session_id
  WHERE n.id = p_node_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Node not found';
  END IF;
  
  -- Validate access - require at least editor role
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Delete any edges connected to this node first (cascade)
  DELETE FROM public.audit_graph_edges
  WHERE source_node_id = p_node_id OR target_node_id = p_node_id;
  
  -- Delete the node
  DELETE FROM public.audit_graph_nodes WHERE id = p_node_id;
END;
$function$;