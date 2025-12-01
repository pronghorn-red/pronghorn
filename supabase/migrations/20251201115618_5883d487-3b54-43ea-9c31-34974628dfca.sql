-- Phase 5: Real-Time Progress Visualization
-- Agent file operations tracking table

CREATE TABLE IF NOT EXISTS public.agent_file_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  details JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_file_operations_session ON public.agent_file_operations(session_id);
CREATE INDEX idx_agent_file_operations_created_at ON public.agent_file_operations(created_at DESC);

ALTER TABLE public.agent_file_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access agent_file_operations via token or auth"
ON public.agent_file_operations
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM agent_sessions
    JOIN projects ON projects.id = agent_sessions.project_id
    WHERE agent_sessions.id = agent_file_operations.session_id
      AND (
        projects.created_by = auth.uid()
        OR projects.share_token = (current_setting('app.share_token', true))::uuid
      )
  )
);

CREATE OR REPLACE FUNCTION public.log_agent_operation_with_token(
  p_session_id UUID,
  p_operation_type TEXT,
  p_file_path TEXT,
  p_status TEXT,
  p_details JSONB DEFAULT '{}'::jsonb,
  p_error_message TEXT DEFAULT NULL,
  p_token UUID DEFAULT NULL
)
RETURNS public.agent_file_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result public.agent_file_operations;
BEGIN
  PERFORM public.set_share_token(p_token::text);

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
  RETURNING * INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agent_operation_status_with_token(
  p_operation_id UUID,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_token UUID DEFAULT NULL
)
RETURNS public.agent_file_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result public.agent_file_operations;
BEGIN
  PERFORM public.set_share_token(p_token::text);

  UPDATE public.agent_file_operations
  SET 
    status = p_status,
    error_message = p_error_message,
    completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN now() ELSE completed_at END
  WHERE id = p_operation_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agent_operations_with_token(
  p_session_id UUID,
  p_token UUID DEFAULT NULL
)
RETURNS SETOF public.agent_file_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.set_share_token(p_token::text);

  RETURN QUERY
    SELECT *
    FROM public.agent_file_operations
    WHERE session_id = p_session_id
    ORDER BY created_at DESC;
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_file_operations;