-- Drop and recreate get_agent_sessions_with_token with optional agent_type filter
CREATE OR REPLACE FUNCTION public.get_agent_sessions_with_token(
  p_project_id uuid, 
  p_token uuid,
  p_agent_type text DEFAULT NULL
)
RETURNS SETOF public.agent_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  
  IF p_agent_type IS NOT NULL THEN
    RETURN QUERY 
      SELECT * FROM public.agent_sessions 
      WHERE project_id = p_project_id AND agent_type = p_agent_type
      ORDER BY created_at DESC;
  ELSE
    RETURN QUERY 
      SELECT * FROM public.agent_sessions 
      WHERE project_id = p_project_id 
      ORDER BY created_at DESC;
  END IF;
END;
$function$;