-- 1. Add agent_type column with default for backward compatibility
ALTER TABLE public.agent_sessions
ADD COLUMN IF NOT EXISTS agent_type text NOT NULL DEFAULT 'coding';

-- 2. Create CHECK constraint for valid agent types
ALTER TABLE public.agent_sessions
ADD CONSTRAINT agent_sessions_agent_type_check
CHECK (agent_type IN ('coding', 'database', 'collaboration', 'audit', 'presentation'));

-- 3. Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent_type 
ON public.agent_sessions(agent_type);

-- 4. Create compound index for project + agent_type queries
CREATE INDEX IF NOT EXISTS idx_agent_sessions_project_agent_type 
ON public.agent_sessions(project_id, agent_type);

-- 5. Update insert_agent_session_with_token to accept agent_type parameter
CREATE OR REPLACE FUNCTION public.insert_agent_session_with_token(
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
  result public.agent_sessions;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');

  INSERT INTO public.agent_sessions (project_id, mode, task_description, created_by, agent_type)
  VALUES (p_project_id, p_mode, p_task_description, auth.uid(), p_agent_type)
  RETURNING * INTO result;

  RETURN result;
END;
$function$;

-- 6. Update get_agent_messages_with_token to optionally filter by agent_type
CREATE OR REPLACE FUNCTION public.get_agent_messages_with_token(
  p_project_id uuid,
  p_token uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_agent_type text DEFAULT NULL
)
RETURNS SETOF public.agent_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');

  RETURN QUERY
  SELECT m.*
  FROM public.agent_messages m
  INNER JOIN public.agent_sessions s ON m.session_id = s.id
  WHERE s.project_id = p_project_id
    AND (p_agent_type IS NULL OR s.agent_type = p_agent_type)
  ORDER BY m.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;