-- =====================================================
-- COMPREHENSIVE AUDIT TABLES CLEANUP MIGRATION
-- =====================================================

-- =====================================================
-- PHASE 1: DROP OBSOLETE RPC FUNCTIONS
-- =====================================================

DROP FUNCTION IF EXISTS get_audit_agent_instances_with_token(uuid, uuid);
DROP FUNCTION IF EXISTS insert_audit_agent_instance_with_token(uuid, uuid, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS update_audit_agent_status_with_token(uuid, uuid, text, boolean, boolean);

-- =====================================================
-- PHASE 2: DROP OBSOLETE TABLES
-- =====================================================

DROP TABLE IF EXISTS audit_agent_instances CASCADE;
DROP TABLE IF EXISTS audit_runs CASCADE;
DROP TABLE IF EXISTS audit_findings CASCADE;

-- =====================================================
-- PHASE 3: DROP FK CONSTRAINTS FIRST, THEN ALTER TYPES
-- =====================================================

-- Drop FK constraints on edges BEFORE changing column types
ALTER TABLE audit_graph_edges DROP CONSTRAINT IF EXISTS audit_graph_edges_source_node_id_fkey;
ALTER TABLE audit_graph_edges DROP CONSTRAINT IF EXISTS audit_graph_edges_target_node_id_fkey;

-- Now change column types
ALTER TABLE audit_graph_nodes 
ALTER COLUMN source_element_ids TYPE text[] USING source_element_ids::text[];

ALTER TABLE audit_tesseract_cells 
ALTER COLUMN x_element_id TYPE text USING x_element_id::text;

ALTER TABLE audit_graph_edges 
ALTER COLUMN source_node_id TYPE text USING source_node_id::text;

ALTER TABLE audit_graph_edges 
ALTER COLUMN target_node_id TYPE text USING target_node_id::text;

-- =====================================================
-- PHASE 4: UPDATE BATCH INSERT FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION insert_audit_graph_nodes_batch_with_token(
  p_session_id uuid,
  p_token uuid,
  p_nodes jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_count integer := 0;
  v_node jsonb;
BEGIN
  SELECT project_id INTO v_project_id FROM audit_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;

  PERFORM require_role(v_project_id, p_token, 'editor');

  FOR v_node IN SELECT * FROM jsonb_array_elements(p_nodes)
  LOOP
    INSERT INTO audit_graph_nodes (
      id, session_id, label, description, node_type, source_dataset,
      source_element_ids, created_by_agent, x_position, y_position, color, size, metadata
    ) VALUES (
      COALESCE((v_node->>'id')::uuid, gen_random_uuid()),
      p_session_id,
      COALESCE(v_node->>'label', 'Unlabeled'),
      v_node->>'description',
      COALESCE(v_node->>'node_type', 'concept'),
      v_node->>'source_dataset',
      CASE 
        WHEN v_node->'source_element_ids' IS NOT NULL AND jsonb_typeof(v_node->'source_element_ids') = 'array' 
        THEN ARRAY(SELECT jsonb_array_elements_text(v_node->'source_element_ids'))
        ELSE '{}'::text[]
      END,
      COALESCE(v_node->>'created_by_agent', 'pipeline'),
      COALESCE((v_node->>'x_position')::double precision, 0),
      COALESCE((v_node->>'y_position')::double precision, 0),
      v_node->>'color',
      COALESCE((v_node->>'size')::integer, 15),
      COALESCE(v_node->'metadata', '{}'::jsonb)
    )
    ON CONFLICT (id) DO UPDATE SET
      label = EXCLUDED.label, description = EXCLUDED.description, node_type = EXCLUDED.node_type,
      source_dataset = EXCLUDED.source_dataset, source_element_ids = EXCLUDED.source_element_ids,
      x_position = EXCLUDED.x_position, y_position = EXCLUDED.y_position,
      color = EXCLUDED.color, size = EXCLUDED.size, metadata = EXCLUDED.metadata, updated_at = now();
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION insert_audit_graph_edges_batch_with_token(
  p_session_id uuid,
  p_token uuid,
  p_edges jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_count integer := 0;
  v_edge jsonb;
BEGIN
  SELECT project_id INTO v_project_id FROM audit_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;

  PERFORM require_role(v_project_id, p_token, 'editor');

  FOR v_edge IN SELECT * FROM jsonb_array_elements(p_edges)
  LOOP
    INSERT INTO audit_graph_edges (
      id, session_id, source_node_id, target_node_id, label, edge_type, weight, created_by_agent, metadata
    ) VALUES (
      COALESCE((v_edge->>'id')::uuid, gen_random_uuid()),
      p_session_id,
      COALESCE(v_edge->>'source_node_id', v_edge->>'source'),
      COALESCE(v_edge->>'target_node_id', v_edge->>'target'),
      v_edge->>'label',
      COALESCE(v_edge->>'edge_type', 'defines'),
      COALESCE((v_edge->>'weight')::double precision, 1.0),
      COALESCE(v_edge->>'created_by_agent', 'pipeline'),
      COALESCE(v_edge->'metadata', '{}'::jsonb)
    )
    ON CONFLICT (id) DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION insert_audit_tesseract_cells_batch_with_token(
  p_session_id uuid,
  p_token uuid,
  p_cells jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_count integer := 0;
  v_cell jsonb;
BEGIN
  SELECT project_id INTO v_project_id FROM audit_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;

  PERFORM require_role(v_project_id, p_token, 'editor');

  FOR v_cell IN SELECT * FROM jsonb_array_elements(p_cells)
  LOOP
    INSERT INTO audit_tesseract_cells (
      id, session_id, x_index, x_element_id, x_element_type, x_element_label,
      y_step, y_step_label, z_polarity, z_criticality, evidence_summary, evidence_refs, contributing_agents
    ) VALUES (
      COALESCE((v_cell->>'id')::uuid, gen_random_uuid()),
      p_session_id,
      COALESCE((v_cell->>'x_index')::integer, 0),
      COALESCE(v_cell->>'x_element_id', 'unknown'),
      COALESCE(v_cell->>'x_element_type', 'concept'),
      v_cell->>'x_element_label',
      COALESCE((v_cell->>'y_step')::integer, 0),
      v_cell->>'y_step_label',
      COALESCE((v_cell->>'z_polarity')::double precision, 0),
      v_cell->>'z_criticality',
      v_cell->>'evidence_summary',
      COALESCE(v_cell->'evidence_refs', '{}'::jsonb),
      CASE 
        WHEN v_cell->'contributing_agents' IS NOT NULL AND jsonb_typeof(v_cell->'contributing_agents') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(v_cell->'contributing_agents'))
        ELSE '{}'::text[]
      END
    )
    ON CONFLICT (id) DO UPDATE SET
      x_index = EXCLUDED.x_index, x_element_id = EXCLUDED.x_element_id, x_element_type = EXCLUDED.x_element_type,
      x_element_label = EXCLUDED.x_element_label, y_step = EXCLUDED.y_step, y_step_label = EXCLUDED.y_step_label,
      z_polarity = EXCLUDED.z_polarity, z_criticality = EXCLUDED.z_criticality,
      evidence_summary = EXCLUDED.evidence_summary, evidence_refs = EXCLUDED.evidence_refs,
      contributing_agents = EXCLUDED.contributing_agents, updated_at = now();
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION upsert_audit_tesseract_cell_with_token(
  p_session_id uuid,
  p_token uuid,
  p_x_index integer,
  p_x_element_id text,
  p_x_element_type text,
  p_x_element_label text DEFAULT NULL,
  p_y_step integer DEFAULT 0,
  p_y_step_label text DEFAULT NULL,
  p_z_polarity double precision DEFAULT 0,
  p_z_criticality text DEFAULT NULL,
  p_evidence_summary text DEFAULT NULL,
  p_evidence_refs jsonb DEFAULT NULL,
  p_contributing_agents text[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_cell_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM audit_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;

  PERFORM require_role(v_project_id, p_token, 'editor');

  INSERT INTO audit_tesseract_cells (
    session_id, x_index, x_element_id, x_element_type, x_element_label,
    y_step, y_step_label, z_polarity, z_criticality,
    evidence_summary, evidence_refs, contributing_agents
  ) VALUES (
    p_session_id, p_x_index, p_x_element_id, p_x_element_type, p_x_element_label,
    p_y_step, p_y_step_label, p_z_polarity, p_z_criticality,
    p_evidence_summary, COALESCE(p_evidence_refs, '{}'::jsonb), p_contributing_agents
  )
  ON CONFLICT (session_id, x_index, y_step) DO UPDATE SET
    x_element_id = EXCLUDED.x_element_id, x_element_type = EXCLUDED.x_element_type,
    x_element_label = EXCLUDED.x_element_label, y_step_label = EXCLUDED.y_step_label,
    z_polarity = EXCLUDED.z_polarity, z_criticality = EXCLUDED.z_criticality,
    evidence_summary = EXCLUDED.evidence_summary, evidence_refs = EXCLUDED.evidence_refs,
    contributing_agents = EXCLUDED.contributing_agents, updated_at = now()
  RETURNING id INTO v_cell_id;

  RETURN v_cell_id;
END;
$function$;

CREATE OR REPLACE FUNCTION delete_audit_graph_node_with_token(
  p_node_id uuid,
  p_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_session_id uuid;
BEGIN
  SELECT session_id INTO v_session_id FROM audit_graph_nodes WHERE id = p_node_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Node not found'; END IF;

  SELECT project_id INTO v_project_id FROM audit_sessions WHERE id = v_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;

  PERFORM require_role(v_project_id, p_token, 'editor');

  DELETE FROM audit_graph_edges WHERE source_node_id = p_node_id::text OR target_node_id = p_node_id::text;
  DELETE FROM audit_graph_nodes WHERE id = p_node_id;
END;
$function$;