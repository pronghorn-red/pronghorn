-- Phase 3: Consolidate Message Functions
-- Replace 3 separate functions with 1 flexible function

-- Drop the redundant functions
DROP FUNCTION IF EXISTS public.get_agent_messages_by_project_with_token(uuid, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.get_agent_messages_for_chat_history_with_token(uuid, uuid, integer, timestamptz);

-- Drop the old session-only version
DROP FUNCTION IF EXISTS public.get_agent_messages_with_token(uuid, uuid);

-- Create the unified flexible function
CREATE OR REPLACE FUNCTION public.get_agent_messages_with_token(
  p_token uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_since timestamptz DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  session_id uuid,
  role text,
  content text,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Must provide either project_id or session_id
  IF p_project_id IS NULL AND p_session_id IS NULL THEN
    RAISE EXCEPTION 'Either p_project_id or p_session_id must be provided';
  END IF;

  -- Validate access based on what was provided
  IF p_session_id IS NOT NULL THEN
    -- Validate via session
    IF NOT public.validate_session_access(p_session_id, p_token) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
    
    -- Query by session
    IF p_since IS NOT NULL THEN
      RETURN QUERY
        SELECT am.id, am.session_id, am.role, am.content, am.metadata, am.created_at
        FROM public.agent_messages am
        WHERE am.session_id = p_session_id
          AND am.created_at >= p_since
        ORDER BY am.created_at DESC
        LIMIT p_limit OFFSET p_offset;
    ELSE
      RETURN QUERY
        SELECT am.id, am.session_id, am.role, am.content, am.metadata, am.created_at
        FROM public.agent_messages am
        WHERE am.session_id = p_session_id
        ORDER BY am.created_at DESC
        LIMIT p_limit OFFSET p_offset;
    END IF;
    
  ELSE
    -- Validate via project
    PERFORM public.require_role(p_project_id, p_token, 'viewer');
    
    -- Query by project
    IF p_since IS NOT NULL THEN
      RETURN QUERY
        SELECT am.id, am.session_id, am.role, am.content, am.metadata, am.created_at
        FROM public.agent_messages am
        INNER JOIN public.agent_sessions ags ON ags.id = am.session_id
        WHERE ags.project_id = p_project_id
          AND am.created_at >= p_since
        ORDER BY am.created_at DESC
        LIMIT p_limit OFFSET p_offset;
    ELSE
      RETURN QUERY
        SELECT am.id, am.session_id, am.role, am.content, am.metadata, am.created_at
        FROM public.agent_messages am
        INNER JOIN public.agent_sessions ags ON ags.id = am.session_id
        WHERE ags.project_id = p_project_id
        ORDER BY am.created_at DESC
        LIMIT p_limit OFFSET p_offset;
    END IF;
  END IF;
END;
$function$;