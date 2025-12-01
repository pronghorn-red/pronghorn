-- RPC function to get agent messages by project with pagination
CREATE OR REPLACE FUNCTION public.get_agent_messages_by_project_with_token(
  p_project_id uuid,
  p_token uuid,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  session_id uuid,
  role text,
  content text,
  metadata jsonb,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Set share token in session
  PERFORM public.set_share_token(p_token::text);

  -- Return messages from all sessions for this project, ordered by most recent
  RETURN QUERY
    SELECT 
      am.id,
      am.session_id,
      am.role,
      am.content,
      am.metadata,
      am.created_at
    FROM public.agent_messages am
    INNER JOIN public.agent_sessions ags ON ags.id = am.session_id
    WHERE ags.project_id = p_project_id
    ORDER BY am.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$function$;

-- RPC function to get agent operations by project with pagination
CREATE OR REPLACE FUNCTION public.get_agent_operations_by_project_with_token(
  p_project_id uuid,
  p_token uuid,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  session_id uuid,
  operation_type text,
  file_path text,
  status text,
  details jsonb,
  error_message text,
  created_at timestamp with time zone,
  completed_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Set share token in session
  PERFORM public.set_share_token(p_token::text);

  -- Return operations from all sessions for this project, ordered by most recent
  RETURN QUERY
    SELECT 
      afo.id,
      afo.session_id,
      afo.operation_type,
      afo.file_path,
      afo.status,
      afo.details,
      afo.error_message,
      afo.created_at,
      afo.completed_at
    FROM public.agent_file_operations afo
    INNER JOIN public.agent_sessions ags ON ags.id = afo.session_id
    WHERE ags.project_id = p_project_id
    ORDER BY afo.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$function$;