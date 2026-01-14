-- Update create_agent_session_with_token to include agent_type parameter
CREATE OR REPLACE FUNCTION public.create_agent_session_with_token(
  p_project_id uuid,
  p_mode text,
  p_task_description text,
  p_token uuid,
  p_agent_type text DEFAULT 'coding'
)
RETURNS public.agent_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result public.agent_sessions;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  INSERT INTO public.agent_sessions (project_id, mode, task_description, created_by, agent_type)
  VALUES (p_project_id, p_mode, p_task_description, auth.uid(), p_agent_type)
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$function$;