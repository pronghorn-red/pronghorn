-- Batch insert RPC functions for saving audit pipeline results

-- 1. Batch insert graph nodes
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
    COALESCE((n->>'id')::uuid, gen_random_uuid()),
    p_session_id,
    n->>'label',
    n->>'description',
    COALESCE(n->>'node_type', 'concept'),
    n->>'source_dataset',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(n->'source_element_ids')), ARRAY[]::text[]),
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

-- 2. Batch insert graph edges
CREATE OR REPLACE FUNCTION public.insert_audit_graph_edges_batch_with_token(
  p_session_id uuid,
  p_token uuid,
  p_edges jsonb
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
  
  -- Insert edges from JSONB array
  INSERT INTO public.audit_graph_edges (
    id, session_id, source_node_id, target_node_id, edge_type, label, weight, created_by_agent, metadata
  )
  SELECT 
    COALESCE((e->>'id')::uuid, gen_random_uuid()),
    p_session_id,
    (e->>'source_node_id')::uuid,
    (e->>'target_node_id')::uuid,
    COALESCE(e->>'edge_type', 'defines'),
    e->>'label',
    COALESCE((e->>'weight')::numeric, 1.0),
    COALESCE(e->>'created_by_agent', 'pipeline'),
    COALESCE(e->'metadata', '{}'::jsonb)
  FROM jsonb_array_elements(p_edges) AS e
  ON CONFLICT (id) DO NOTHING;
  
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count;
END;
$function$;

-- 3. Batch insert tesseract cells
CREATE OR REPLACE FUNCTION public.insert_audit_tesseract_cells_batch_with_token(
  p_session_id uuid,
  p_token uuid,
  p_cells jsonb
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
  
  -- Insert cells from JSONB array
  INSERT INTO public.audit_tesseract_cells (
    id, session_id, x_index, x_element_id, x_element_type, x_element_label,
    y_step, y_step_label, z_polarity, z_criticality, evidence_summary, evidence_refs, contributing_agents
  )
  SELECT 
    COALESCE((c->>'id')::uuid, gen_random_uuid()),
    p_session_id,
    COALESCE((c->>'x_index')::integer, 0),
    COALESCE(c->>'x_element_id', gen_random_uuid()::text),
    COALESCE(c->>'x_element_type', 'concept'),
    c->>'x_element_label',
    COALESCE((c->>'y_step')::integer, 0),
    c->>'y_step_label',
    COALESCE((c->>'z_polarity')::numeric, 0),
    c->>'z_criticality',
    c->>'evidence_summary',
    c->'evidence_refs',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(c->'contributing_agents')), ARRAY['pipeline']::text[])
  FROM jsonb_array_elements(p_cells) AS c
  ON CONFLICT (id) DO UPDATE SET
    z_polarity = EXCLUDED.z_polarity,
    evidence_summary = EXCLUDED.evidence_summary,
    updated_at = now();
  
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count;
END;
$function$;

-- 4. Batch insert activity stream entries
CREATE OR REPLACE FUNCTION public.insert_audit_activity_batch_with_token(
  p_session_id uuid,
  p_token uuid,
  p_activities jsonb
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
  
  -- Insert activities from JSONB array
  INSERT INTO public.audit_activity_stream (
    id, session_id, agent_role, activity_type, title, content, metadata
  )
  SELECT 
    COALESCE((a->>'id')::uuid, gen_random_uuid()),
    p_session_id,
    a->>'agent_role',
    COALESCE(a->>'activity_type', 'pipeline_step'),
    COALESCE(a->>'title', 'Pipeline Activity'),
    a->>'content',
    COALESCE(a->'metadata', '{}'::jsonb)
  FROM jsonb_array_elements(p_activities) AS a
  ON CONFLICT (id) DO NOTHING;
  
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count;
END;
$function$;

-- 5. Update session venn result
CREATE OR REPLACE FUNCTION public.update_audit_session_venn_with_token(
  p_session_id uuid,
  p_token uuid,
  p_venn_result jsonb,
  p_status text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from session
  SELECT project_id INTO v_project_id FROM public.audit_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  
  -- Validate access (require editor role)
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Update session with venn result and optionally status
  UPDATE public.audit_sessions
  SET 
    venn_result = p_venn_result,
    status = COALESCE(p_status, status),
    completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE completed_at END,
    updated_at = now()
  WHERE id = p_session_id;
END;
$function$;