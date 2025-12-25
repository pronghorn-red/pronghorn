-- Create table for knowledge graph nodes (concepts extracted by agents)
CREATE TABLE public.audit_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text,
  node_type text NOT NULL DEFAULT 'concept', -- 'concept', 'theme', 'gap', 'risk', 'opportunity'
  source_dataset text, -- 'd1', 'd2', 'both', null for emergent
  source_element_ids uuid[] DEFAULT '{}',
  created_by_agent text NOT NULL,
  x_position double precision DEFAULT 0,
  y_position double precision DEFAULT 0,
  color text,
  size integer DEFAULT 10,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create table for knowledge graph edges (relationships between concepts)
CREATE TABLE public.audit_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES public.audit_graph_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.audit_graph_nodes(id) ON DELETE CASCADE,
  label text,
  edge_type text NOT NULL DEFAULT 'relates_to', -- 'relates_to', 'depends_on', 'contradicts', 'supports', 'covers'
  weight double precision DEFAULT 1.0,
  created_by_agent text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add phase tracking to audit_sessions
ALTER TABLE public.audit_sessions 
  ADD COLUMN IF NOT EXISTS phase text DEFAULT 'conference',
  ADD COLUMN IF NOT EXISTS graph_complete_votes jsonb DEFAULT '{}';

-- Enable RLS
ALTER TABLE public.audit_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_graph_edges ENABLE ROW LEVEL SECURITY;

-- RLS Policies for graph nodes
CREATE POLICY "Users can access audit graph nodes"
ON public.audit_graph_nodes
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM audit_sessions s
    JOIN projects p ON p.id = s.project_id
    WHERE s.id = audit_graph_nodes.session_id
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

-- RLS Policies for graph edges
CREATE POLICY "Users can access audit graph edges"
ON public.audit_graph_edges
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM audit_sessions s
    JOIN projects p ON p.id = s.project_id
    WHERE s.id = audit_graph_edges.session_id
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

-- Enable realtime
ALTER TABLE public.audit_graph_nodes REPLICA IDENTITY FULL;
ALTER TABLE public.audit_graph_edges REPLICA IDENTITY FULL;

-- RPC function to get graph nodes with token
CREATE OR REPLACE FUNCTION public.get_audit_graph_nodes_with_token(
  p_session_id uuid,
  p_token uuid
)
RETURNS SETOF public.audit_graph_nodes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM audit_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  RETURN QUERY SELECT * FROM public.audit_graph_nodes WHERE session_id = p_session_id ORDER BY created_at;
END;
$function$;

-- RPC function to get graph edges with token
CREATE OR REPLACE FUNCTION public.get_audit_graph_edges_with_token(
  p_session_id uuid,
  p_token uuid
)
RETURNS SETOF public.audit_graph_edges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM audit_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  RETURN QUERY SELECT * FROM public.audit_graph_edges WHERE session_id = p_session_id ORDER BY created_at;
END;
$function$;

-- RPC function to upsert graph node with token
CREATE OR REPLACE FUNCTION public.upsert_audit_graph_node_with_token(
  p_session_id uuid,
  p_token uuid,
  p_label text,
  p_description text DEFAULT NULL,
  p_node_type text DEFAULT 'concept',
  p_source_dataset text DEFAULT NULL,
  p_source_element_ids uuid[] DEFAULT '{}',
  p_created_by_agent text DEFAULT 'orchestrator',
  p_x_position double precision DEFAULT 0,
  p_y_position double precision DEFAULT 0,
  p_color text DEFAULT NULL,
  p_size integer DEFAULT 10,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS public.audit_graph_nodes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_result public.audit_graph_nodes;
BEGIN
  SELECT project_id INTO v_project_id FROM audit_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  INSERT INTO public.audit_graph_nodes (
    session_id, label, description, node_type, source_dataset,
    source_element_ids, created_by_agent, x_position, y_position,
    color, size, metadata
  ) VALUES (
    p_session_id, p_label, p_description, p_node_type, p_source_dataset,
    p_source_element_ids, p_created_by_agent, p_x_position, p_y_position,
    p_color, p_size, p_metadata
  )
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$function$;

-- RPC function to insert graph edge with token
CREATE OR REPLACE FUNCTION public.insert_audit_graph_edge_with_token(
  p_session_id uuid,
  p_token uuid,
  p_source_node_id uuid,
  p_target_node_id uuid,
  p_label text DEFAULT NULL,
  p_edge_type text DEFAULT 'relates_to',
  p_weight double precision DEFAULT 1.0,
  p_created_by_agent text DEFAULT 'orchestrator',
  p_metadata jsonb DEFAULT '{}'
)
RETURNS public.audit_graph_edges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_result public.audit_graph_edges;
BEGIN
  SELECT project_id INTO v_project_id FROM audit_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  INSERT INTO public.audit_graph_edges (
    session_id, source_node_id, target_node_id, label,
    edge_type, weight, created_by_agent, metadata
  ) VALUES (
    p_session_id, p_source_node_id, p_target_node_id, p_label,
    p_edge_type, p_weight, p_created_by_agent, p_metadata
  )
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$function$;

-- RPC function to update session phase
CREATE OR REPLACE FUNCTION public.update_audit_session_phase_with_token(
  p_session_id uuid,
  p_token uuid,
  p_phase text,
  p_graph_complete_votes jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM audit_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  UPDATE public.audit_sessions 
  SET phase = p_phase,
      graph_complete_votes = COALESCE(p_graph_complete_votes, graph_complete_votes),
      updated_at = now()
  WHERE id = p_session_id;
END;
$function$;