-- Drop the version without p_completed_at
DROP FUNCTION IF EXISTS public.update_agent_session_status_with_token(uuid, uuid, text);

-- Update the version with p_completed_at to use require_role
CREATE OR REPLACE FUNCTION public.update_agent_session_status_with_token(
  p_session_id uuid,
  p_token uuid,
  p_status text,
  p_completed_at timestamp with time zone DEFAULT NULL
)
RETURNS agent_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_result public.agent_sessions;
BEGIN
  v_project_id := public.get_project_id_from_session(p_session_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'editor');

  UPDATE public.agent_sessions
  SET 
    status = p_status,
    completed_at = COALESCE(p_completed_at, completed_at),
    updated_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;