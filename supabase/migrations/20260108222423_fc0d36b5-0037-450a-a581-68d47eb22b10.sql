-- Drop the simpler version without p_status
DROP FUNCTION IF EXISTS public.log_agent_operation_with_token(uuid, uuid, text, text, jsonb);

-- Update the version with p_status to use require_role instead of set_share_token
CREATE OR REPLACE FUNCTION public.log_agent_operation_with_token(
  p_session_id uuid,
  p_operation_type text,
  p_file_path text,
  p_status text,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_error_message text DEFAULT NULL,
  p_token uuid DEFAULT NULL
)
RETURNS agent_file_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_result public.agent_file_operations;
BEGIN
  v_project_id := public.get_project_id_from_session(p_session_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'editor');

  INSERT INTO public.agent_file_operations (
    session_id,
    operation_type,
    file_path,
    status,
    details,
    error_message,
    completed_at
  )
  VALUES (
    p_session_id,
    p_operation_type,
    p_file_path,
    p_status,
    p_details,
    p_error_message,
    CASE WHEN p_status IN ('completed', 'failed') THEN now() ELSE NULL END
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;