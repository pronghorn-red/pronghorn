-- Add p_phase and p_graph_complete_votes parameters to update_audit_session_with_token
CREATE OR REPLACE FUNCTION public.update_audit_session_with_token(
  p_session_id UUID,
  p_token UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_phase TEXT DEFAULT NULL,
  p_current_iteration INTEGER DEFAULT NULL,
  p_problem_shape JSONB DEFAULT NULL,
  p_tesseract_dimensions JSONB DEFAULT NULL,
  p_venn_result JSONB DEFAULT NULL,
  p_consensus_votes JSONB DEFAULT NULL,
  p_graph_complete_votes JSONB DEFAULT NULL,
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
    phase = COALESCE(p_phase, phase),
    current_iteration = COALESCE(p_current_iteration, current_iteration),
    problem_shape = COALESCE(p_problem_shape, problem_shape),
    tesseract_dimensions = COALESCE(p_tesseract_dimensions, tesseract_dimensions),
    venn_result = COALESCE(p_venn_result, venn_result),
    consensus_votes = COALESCE(p_consensus_votes, consensus_votes),
    graph_complete_votes = COALESCE(p_graph_complete_votes, graph_complete_votes),
    consensus_reached = COALESCE(p_consensus_reached, consensus_reached),
    updated_at = now(),
    completed_at = CASE WHEN p_status IN ('completed', 'completed_max_iterations', 'failed', 'stopped') THEN now() ELSE completed_at END
  WHERE id = p_session_id
  RETURNING * INTO result;
  
  RETURN result;
END;
$$;