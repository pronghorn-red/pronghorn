-- =====================================================
-- PHASE 1: Enhance original create_agent_session_with_token with agent_type
-- Original signature: (p_project_id uuid, p_token uuid, p_mode text, p_task_description text)
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_agent_session_with_token(
  p_project_id uuid,
  p_token uuid,
  p_mode text,
  p_task_description text,
  p_agent_type text DEFAULT 'coding'
)
RETURNS public.agent_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.agent_sessions;
BEGIN
  -- Validate access - require at least editor role
  PERFORM public.require_role(p_project_id, p_token, 'editor');

  INSERT INTO public.agent_sessions (project_id, mode, task_description, created_by, agent_type)
  VALUES (p_project_id, p_mode, p_task_description, auth.uid(), p_agent_type)
  RETURNING * INTO result;

  RETURN result;
END;
$function$;

-- =====================================================
-- PHASE 2: Drop the NEW overload of create_agent_session_with_token
-- New signature had different param order: (p_project_id, p_mode, p_task_description, p_token, p_agent_type)
-- =====================================================

DROP FUNCTION IF EXISTS public.create_agent_session_with_token(uuid, text, text, uuid, text);

-- =====================================================
-- PHASE 3: Enhance original get_agent_messages_with_token with agent_type filter
-- Original signature: (p_token uuid, p_project_id uuid, p_session_id uuid, p_limit integer, p_offset integer, p_since timestamp)
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_agent_messages_with_token(
  p_token uuid,
  p_project_id uuid,
  p_session_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_since timestamp with time zone DEFAULT NULL,
  p_agent_type text DEFAULT NULL
)
RETURNS TABLE(
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
  -- Validate access
  PERFORM public.require_role(p_project_id, p_token, 'viewer');

  RETURN QUERY
  SELECT 
    am.id,
    am.session_id,
    am.role,
    am.content,
    am.metadata,
    am.created_at
  FROM public.agent_messages am
  INNER JOIN public.agent_sessions s ON s.id = am.session_id
  WHERE s.project_id = p_project_id
    AND (p_session_id IS NULL OR am.session_id = p_session_id)
    AND (p_since IS NULL OR am.created_at > p_since)
    AND (p_agent_type IS NULL OR s.agent_type = p_agent_type)
  ORDER BY am.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- =====================================================
-- PHASE 4: Drop the NEW overload of get_agent_messages_with_token
-- New signature: (p_project_id uuid, p_token uuid, p_limit integer, p_offset integer, p_agent_type text)
-- =====================================================

DROP FUNCTION IF EXISTS public.get_agent_messages_with_token(uuid, uuid, integer, integer, text);