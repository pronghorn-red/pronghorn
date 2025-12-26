-- UPDATE INSERT AUDIT SESSION to support new JSONB content columns
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
  p_token UUID DEFAULT NULL,
  p_dataset_1_content JSONB DEFAULT NULL,
  p_dataset_2_content JSONB DEFAULT NULL
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
    dataset_1_content, dataset_2_content,
    created_by
  ) VALUES (
    p_project_id, p_name, p_description,
    p_dataset_1_type, p_dataset_1_ids,
    p_dataset_2_type, p_dataset_2_ids,
    p_agent_definitions, p_max_iterations,
    p_dataset_1_content, p_dataset_2_content,
    auth.uid()
  )
  RETURNING * INTO result;
  
  RETURN result;
END;
$$;