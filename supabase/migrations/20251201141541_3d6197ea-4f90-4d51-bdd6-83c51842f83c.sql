-- Update insert_agent_message_with_token to accept metadata parameter
CREATE OR REPLACE FUNCTION public.insert_agent_message_with_token(
  p_session_id uuid,
  p_token uuid,
  p_role text,
  p_content text,
  p_metadata jsonb DEFAULT NULL
)
RETURNS agent_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  new_message public.agent_messages;
BEGIN
  -- Get project_id from agent session
  SELECT project_id INTO v_project_id
  FROM public.agent_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent session not found' USING ERRCODE = 'P0001';
  END IF;

  -- Validate access
  PERFORM public.validate_project_access(v_project_id, p_token);

  INSERT INTO public.agent_messages (session_id, role, content, metadata)
  VALUES (p_session_id, p_role, p_content, p_metadata)
  RETURNING * INTO new_message;

  RETURN new_message;
END;
$function$;