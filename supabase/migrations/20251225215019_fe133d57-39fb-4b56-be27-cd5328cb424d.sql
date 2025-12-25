-- =============================================
-- AUDIT AGENT SYSTEM - Database Schema
-- Phase 2 of Audit Feature Implementation
-- =============================================

-- Audit sessions - tracks complete audit execution
CREATE TABLE public.audit_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  
  -- Dataset configuration
  dataset_1_type TEXT NOT NULL,
  dataset_1_ids UUID[],
  dataset_2_type TEXT NOT NULL,
  dataset_2_ids UUID[],
  
  -- Agent configuration
  agent_definitions JSONB DEFAULT '[]'::jsonb,
  max_iterations INTEGER NOT NULL DEFAULT 500,
  current_iteration INTEGER NOT NULL DEFAULT 0,
  
  -- Results
  problem_shape JSONB,
  tesseract_dimensions JSONB,
  venn_result JSONB,
  
  -- Consensus tracking
  consensus_votes JSONB DEFAULT '{}'::jsonb,
  consensus_reached BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id)
);

-- Blackboard entries - shared agent memory
CREATE TABLE public.audit_blackboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
  iteration INTEGER NOT NULL,
  agent_role TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  content TEXT NOT NULL,
  evidence JSONB DEFAULT '[]'::jsonb,
  confidence FLOAT,
  target_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tesseract cells - 3D evidence grid
CREATE TABLE public.audit_tesseract_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
  
  -- X-axis: Dataset 1 element
  x_element_id UUID NOT NULL,
  x_element_type TEXT NOT NULL,
  x_element_label TEXT,
  x_index INTEGER NOT NULL,
  
  -- Y-axis: Evidence step
  y_step INTEGER NOT NULL,
  y_step_label TEXT,
  
  -- Z-axis: Polarity
  z_polarity FLOAT NOT NULL DEFAULT 0,
  z_criticality TEXT DEFAULT 'info',
  
  -- Evidence
  evidence_summary TEXT,
  evidence_refs JSONB DEFAULT '[]'::jsonb,
  contributing_agents TEXT[],
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(session_id, x_element_id, y_step)
);

-- Agent instances per session
CREATE TABLE public.audit_agent_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
  agent_role TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  sector_start INTEGER,
  sector_end INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  sector_complete BOOLEAN DEFAULT FALSE,
  consensus_vote BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  
  UNIQUE(session_id, agent_role)
);

-- Create indexes for performance
CREATE INDEX idx_audit_sessions_project ON public.audit_sessions(project_id);
CREATE INDEX idx_audit_sessions_status ON public.audit_sessions(status);
CREATE INDEX idx_audit_blackboard_session ON public.audit_blackboard(session_id);
CREATE INDEX idx_audit_blackboard_iteration ON public.audit_blackboard(session_id, iteration);
CREATE INDEX idx_audit_tesseract_session ON public.audit_tesseract_cells(session_id);
CREATE INDEX idx_audit_tesseract_element ON public.audit_tesseract_cells(session_id, x_element_id);
CREATE INDEX idx_audit_agent_instances_session ON public.audit_agent_instances(session_id);

-- Enable RLS on all tables
ALTER TABLE public.audit_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_blackboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_tesseract_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_agent_instances ENABLE ROW LEVEL SECURITY;

-- RLS Policies using project_tokens pattern
CREATE POLICY "Users can access audit sessions"
ON public.audit_sessions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = audit_sessions.project_id
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

CREATE POLICY "Users can access audit blackboard"
ON public.audit_blackboard FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM audit_sessions s
    JOIN projects p ON p.id = s.project_id
    WHERE s.id = audit_blackboard.session_id
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

CREATE POLICY "Users can access audit tesseract cells"
ON public.audit_tesseract_cells FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM audit_sessions s
    JOIN projects p ON p.id = s.project_id
    WHERE s.id = audit_tesseract_cells.session_id
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

CREATE POLICY "Users can access audit agent instances"
ON public.audit_agent_instances FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM audit_sessions s
    JOIN projects p ON p.id = s.project_id
    WHERE s.id = audit_agent_instances.session_id
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

-- Helper to get project_id from audit session
CREATE OR REPLACE FUNCTION public.get_project_id_from_audit_session(p_session_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT project_id FROM audit_sessions WHERE id = p_session_id;
$$;

-- =============================================
-- RPC FUNCTIONS - All use _with_token pattern
-- =============================================

-- INSERT AUDIT SESSION (editor role required)
CREATE OR REPLACE FUNCTION public.insert_audit_session_with_token(
  p_project_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_dataset_1_type TEXT DEFAULT 'requirements',
  p_dataset_1_ids UUID[] DEFAULT NULL,
  p_dataset_2_type TEXT DEFAULT 'canvas',
  p_dataset_2_ids UUID[] DEFAULT NULL,
  p_agent_definitions JSONB DEFAULT '[]'::jsonb,
  p_max_iterations INTEGER DEFAULT 500,
  p_token UUID DEFAULT NULL
)
RETURNS public.audit_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.audit_sessions;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  INSERT INTO public.audit_sessions (
    project_id, name, description,
    dataset_1_type, dataset_1_ids,
    dataset_2_type, dataset_2_ids,
    agent_definitions, max_iterations,
    created_by
  ) VALUES (
    p_project_id, p_name, p_description,
    p_dataset_1_type, p_dataset_1_ids,
    p_dataset_2_type, p_dataset_2_ids,
    p_agent_definitions, p_max_iterations,
    auth.uid()
  )
  RETURNING * INTO result;
  
  RETURN result;
END;
$$;

-- GET AUDIT SESSION (viewer role)
CREATE OR REPLACE FUNCTION public.get_audit_session_with_token(
  p_session_id UUID,
  p_token UUID DEFAULT NULL
)
RETURNS public.audit_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
  result public.audit_sessions;
BEGIN
  v_project_id := public.get_project_id_from_audit_session(p_session_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Audit session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  SELECT * INTO result FROM public.audit_sessions WHERE id = p_session_id;
  RETURN result;
END;
$$;

-- GET AUDIT SESSIONS BY PROJECT (viewer role)
CREATE OR REPLACE FUNCTION public.get_audit_sessions_with_token(
  p_project_id UUID,
  p_token UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS SETOF public.audit_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  
  RETURN QUERY
  SELECT * FROM public.audit_sessions
  WHERE project_id = p_project_id
  ORDER BY created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- UPDATE AUDIT SESSION (editor role)
CREATE OR REPLACE FUNCTION public.update_audit_session_with_token(
  p_session_id UUID,
  p_token UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_current_iteration INTEGER DEFAULT NULL,
  p_problem_shape JSONB DEFAULT NULL,
  p_tesseract_dimensions JSONB DEFAULT NULL,
  p_venn_result JSONB DEFAULT NULL,
  p_consensus_votes JSONB DEFAULT NULL,
  p_consensus_reached BOOLEAN DEFAULT NULL
)
RETURNS public.audit_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
  result public.audit_sessions;
BEGIN
  v_project_id := public.get_project_id_from_audit_session(p_session_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Audit session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  UPDATE public.audit_sessions SET
    status = COALESCE(p_status, status),
    current_iteration = COALESCE(p_current_iteration, current_iteration),
    problem_shape = COALESCE(p_problem_shape, problem_shape),
    tesseract_dimensions = COALESCE(p_tesseract_dimensions, tesseract_dimensions),
    venn_result = COALESCE(p_venn_result, venn_result),
    consensus_votes = COALESCE(p_consensus_votes, consensus_votes),
    consensus_reached = COALESCE(p_consensus_reached, consensus_reached),
    updated_at = now(),
    completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN now() ELSE completed_at END
  WHERE id = p_session_id
  RETURNING * INTO result;
  
  RETURN result;
END;
$$;

-- INSERT BLACKBOARD ENTRY (editor role)
CREATE OR REPLACE FUNCTION public.insert_audit_blackboard_with_token(
  p_session_id UUID,
  p_iteration INTEGER,
  p_agent_role TEXT,
  p_entry_type TEXT,
  p_content TEXT,
  p_token UUID DEFAULT NULL,
  p_evidence JSONB DEFAULT '[]'::jsonb,
  p_confidence FLOAT DEFAULT NULL,
  p_target_agent TEXT DEFAULT NULL
)
RETURNS public.audit_blackboard
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
  result public.audit_blackboard;
BEGIN
  v_project_id := public.get_project_id_from_audit_session(p_session_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Audit session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  INSERT INTO public.audit_blackboard (
    session_id, iteration, agent_role, entry_type,
    content, evidence, confidence, target_agent
  ) VALUES (
    p_session_id, p_iteration, p_agent_role, p_entry_type,
    p_content, p_evidence, p_confidence, p_target_agent
  )
  RETURNING * INTO result;
  
  RETURN result;
END;
$$;

-- GET BLACKBOARD ENTRIES (viewer role)
CREATE OR REPLACE FUNCTION public.get_audit_blackboard_with_token(
  p_session_id UUID,
  p_token UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_agent_role TEXT DEFAULT NULL,
  p_entry_type TEXT DEFAULT NULL
)
RETURNS SETOF public.audit_blackboard
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  v_project_id := public.get_project_id_from_audit_session(p_session_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Audit session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  RETURN QUERY
  SELECT * FROM public.audit_blackboard
  WHERE session_id = p_session_id
  AND (p_agent_role IS NULL OR agent_role = p_agent_role)
  AND (p_entry_type IS NULL OR entry_type = p_entry_type)
  ORDER BY created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- UPSERT TESSERACT CELL (editor role)
CREATE OR REPLACE FUNCTION public.upsert_audit_tesseract_cell_with_token(
  p_session_id UUID,
  p_x_element_id UUID,
  p_x_element_type TEXT,
  p_x_index INTEGER,
  p_y_step INTEGER,
  p_z_polarity FLOAT,
  p_token UUID DEFAULT NULL,
  p_x_element_label TEXT DEFAULT NULL,
  p_y_step_label TEXT DEFAULT NULL,
  p_z_criticality TEXT DEFAULT 'info',
  p_evidence_summary TEXT DEFAULT NULL,
  p_evidence_refs JSONB DEFAULT '[]'::jsonb,
  p_contributing_agents TEXT[] DEFAULT '{}'::text[]
)
RETURNS public.audit_tesseract_cells
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
  result public.audit_tesseract_cells;
BEGIN
  v_project_id := public.get_project_id_from_audit_session(p_session_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Audit session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  INSERT INTO public.audit_tesseract_cells (
    session_id, x_element_id, x_element_type, x_element_label, x_index,
    y_step, y_step_label, z_polarity, z_criticality,
    evidence_summary, evidence_refs, contributing_agents
  ) VALUES (
    p_session_id, p_x_element_id, p_x_element_type, p_x_element_label, p_x_index,
    p_y_step, p_y_step_label, p_z_polarity, p_z_criticality,
    p_evidence_summary, p_evidence_refs, p_contributing_agents
  )
  ON CONFLICT (session_id, x_element_id, y_step) DO UPDATE SET
    z_polarity = EXCLUDED.z_polarity,
    z_criticality = EXCLUDED.z_criticality,
    evidence_summary = EXCLUDED.evidence_summary,
    evidence_refs = EXCLUDED.evidence_refs,
    contributing_agents = array_cat(
      audit_tesseract_cells.contributing_agents,
      EXCLUDED.contributing_agents
    ),
    updated_at = now()
  RETURNING * INTO result;
  
  RETURN result;
END;
$$;

-- GET TESSERACT CELLS (viewer role)
CREATE OR REPLACE FUNCTION public.get_audit_tesseract_cells_with_token(
  p_session_id UUID,
  p_token UUID DEFAULT NULL,
  p_x_element_id UUID DEFAULT NULL,
  p_y_step_min INTEGER DEFAULT NULL,
  p_y_step_max INTEGER DEFAULT NULL,
  p_polarity_min FLOAT DEFAULT NULL,
  p_polarity_max FLOAT DEFAULT NULL,
  p_limit INTEGER DEFAULT 1000
)
RETURNS SETOF public.audit_tesseract_cells
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  v_project_id := public.get_project_id_from_audit_session(p_session_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Audit session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  RETURN QUERY
  SELECT * FROM public.audit_tesseract_cells
  WHERE session_id = p_session_id
  AND (p_x_element_id IS NULL OR x_element_id = p_x_element_id)
  AND (p_y_step_min IS NULL OR y_step >= p_y_step_min)
  AND (p_y_step_max IS NULL OR y_step <= p_y_step_max)
  AND (p_polarity_min IS NULL OR z_polarity >= p_polarity_min)
  AND (p_polarity_max IS NULL OR z_polarity <= p_polarity_max)
  ORDER BY x_index, y_step
  LIMIT p_limit;
END;
$$;

-- GET TESSERACT SUMMARY (viewer role)
CREATE OR REPLACE FUNCTION public.get_audit_tesseract_summary_with_token(
  p_session_id UUID,
  p_token UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
  result JSONB;
BEGIN
  v_project_id := public.get_project_id_from_audit_session(p_session_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Audit session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  SELECT jsonb_build_object(
    'totalCells', COUNT(*),
    'polarityDistribution', jsonb_build_object(
      'positive', COUNT(*) FILTER (WHERE z_polarity > 0.5),
      'neutral', COUNT(*) FILTER (WHERE z_polarity BETWEEN -0.5 AND 0.5),
      'negative', COUNT(*) FILTER (WHERE z_polarity < -0.5)
    ),
    'criticalityDistribution', jsonb_build_object(
      'critical', COUNT(*) FILTER (WHERE z_criticality = 'critical'),
      'major', COUNT(*) FILTER (WHERE z_criticality = 'major'),
      'minor', COUNT(*) FILTER (WHERE z_criticality = 'minor'),
      'info', COUNT(*) FILTER (WHERE z_criticality = 'info')
    ),
    'uniqueElements', COUNT(DISTINCT x_element_id),
    'maxStep', MAX(y_step),
    'avgPolarity', AVG(z_polarity)
  ) INTO result
  FROM public.audit_tesseract_cells
  WHERE session_id = p_session_id;
  
  RETURN result;
END;
$$;

-- INSERT AGENT INSTANCE (editor role)
CREATE OR REPLACE FUNCTION public.insert_audit_agent_instance_with_token(
  p_session_id UUID,
  p_agent_role TEXT,
  p_agent_name TEXT,
  p_system_prompt TEXT,
  p_token UUID DEFAULT NULL,
  p_sector_start INTEGER DEFAULT NULL,
  p_sector_end INTEGER DEFAULT NULL
)
RETURNS public.audit_agent_instances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
  result public.audit_agent_instances;
BEGIN
  v_project_id := public.get_project_id_from_audit_session(p_session_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Audit session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  INSERT INTO public.audit_agent_instances (
    session_id, agent_role, agent_name, system_prompt,
    sector_start, sector_end
  ) VALUES (
    p_session_id, p_agent_role, p_agent_name, p_system_prompt,
    p_sector_start, p_sector_end
  )
  RETURNING * INTO result;
  
  RETURN result;
END;
$$;

-- GET AGENT INSTANCES (viewer role)
CREATE OR REPLACE FUNCTION public.get_audit_agent_instances_with_token(
  p_session_id UUID,
  p_token UUID DEFAULT NULL
)
RETURNS SETOF public.audit_agent_instances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  v_project_id := public.get_project_id_from_audit_session(p_session_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Audit session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  RETURN QUERY
  SELECT * FROM public.audit_agent_instances
  WHERE session_id = p_session_id
  ORDER BY created_at;
END;
$$;

-- UPDATE AGENT STATUS (editor role)
CREATE OR REPLACE FUNCTION public.update_audit_agent_status_with_token(
  p_session_id UUID,
  p_agent_role TEXT,
  p_token UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_sector_complete BOOLEAN DEFAULT NULL,
  p_consensus_vote BOOLEAN DEFAULT NULL
)
RETURNS public.audit_agent_instances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
  result public.audit_agent_instances;
BEGIN
  v_project_id := public.get_project_id_from_audit_session(p_session_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Audit session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  UPDATE public.audit_agent_instances SET
    status = COALESCE(p_status, status),
    sector_complete = COALESCE(p_sector_complete, sector_complete),
    consensus_vote = COALESCE(p_consensus_vote, consensus_vote),
    completed_at = CASE WHEN p_status IN ('completed', 'terminated') THEN now() ELSE completed_at END
  WHERE session_id = p_session_id AND agent_role = p_agent_role
  RETURNING * INTO result;
  
  RETURN result;
END;
$$;

-- GET CONSENSUS STATE (viewer role)
CREATE OR REPLACE FUNCTION public.get_audit_consensus_state_with_token(
  p_session_id UUID,
  p_token UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
  result JSONB;
BEGIN
  v_project_id := public.get_project_id_from_audit_session(p_session_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Audit session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  SELECT jsonb_build_object(
    'totalAgents', COUNT(*) FILTER (WHERE status = 'active'),
    'votedComplete', COUNT(*) FILTER (WHERE consensus_vote = true),
    'votedContinue', COUNT(*) FILTER (WHERE consensus_vote = false),
    'notYetVoted', COUNT(*) FILTER (WHERE consensus_vote IS NULL AND status = 'active'),
    'consensusReached', bool_and(COALESCE(consensus_vote, false)) FILTER (WHERE status = 'active'),
    'allSectorsComplete', bool_and(COALESCE(sector_complete, false)) FILTER (WHERE status = 'active'),
    'votes', jsonb_agg(jsonb_build_object(
      'role', agent_role,
      'name', agent_name,
      'vote', consensus_vote,
      'sectorComplete', sector_complete
    ))
  ) INTO result
  FROM public.audit_agent_instances
  WHERE session_id = p_session_id;
  
  RETURN result;
END;
$$;

-- DELETE AUDIT SESSION (editor role)
CREATE OR REPLACE FUNCTION public.delete_audit_session_with_token(
  p_session_id UUID,
  p_token UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  v_project_id := public.get_project_id_from_audit_session(p_session_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Audit session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  DELETE FROM public.audit_sessions WHERE id = p_session_id;
  
  RETURN TRUE;
END;
$$;