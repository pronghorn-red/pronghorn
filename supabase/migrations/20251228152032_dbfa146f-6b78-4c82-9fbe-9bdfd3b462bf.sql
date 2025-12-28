-- Update insert_audit_graph_nodes_batch_with_token to accept text IDs
-- The column was changed to text type, but the function still casts to uuid

CREATE OR REPLACE FUNCTION public.insert_audit_graph_nodes_batch_with_token(
  p_session_id uuid,
  p_token uuid,
  p_nodes jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_inserted_count integer;
BEGIN
  -- Get project_id from session
  SELECT project_id INTO v_project_id FROM public.audit_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  
  -- Validate access (require editor role)
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Insert nodes from JSONB array
  INSERT INTO public.audit_graph_nodes (
    id, session_id, label, description, node_type, source_dataset, 
    source_element_ids, created_by_agent, color, size, metadata
  )
  SELECT 
    -- Use text ID directly, generate UUID as text if not provided
    COALESCE(n->>'id', gen_random_uuid()::text),
    p_session_id,
    n->>'label',
    n->>'description',
    COALESCE(n->>'node_type', 'concept'),
    n->>'source_dataset',
    COALESCE(
      (SELECT array_agg(elem::text) FROM jsonb_array_elements_text(n->'source_element_ids') AS elem WHERE elem IS NOT NULL AND elem != ''),
      ARRAY[]::text[]
    ),
    COALESCE(n->>'created_by_agent', 'pipeline'),
    n->>'color',
    COALESCE((n->>'size')::numeric, 15),
    COALESCE(n->'metadata', '{}'::jsonb)
  FROM jsonb_array_elements(p_nodes) AS n
  ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    updated_at = now();
  
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count;
END;
$function$;