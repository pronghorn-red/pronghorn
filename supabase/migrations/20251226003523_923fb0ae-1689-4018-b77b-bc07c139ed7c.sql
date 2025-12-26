-- Create audit activity stream table for real-time transparency
CREATE TABLE public.audit_activity_stream (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
  agent_role text,
  activity_type text NOT NULL, -- 'thinking', 'tool_call', 'response', 'error', 'phase_change', 'node_insert', 'blackboard_write'
  title text NOT NULL,
  content text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add index for fast session lookups
CREATE INDEX idx_audit_activity_stream_session ON public.audit_activity_stream(session_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.audit_activity_stream ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Users can access audit activity stream"
ON public.audit_activity_stream FOR ALL
USING (EXISTS (
  SELECT 1 FROM audit_sessions s
  JOIN projects p ON p.id = s.project_id
  WHERE s.id = audit_activity_stream.session_id
  AND (p.created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM project_tokens pt
    WHERE pt.project_id = p.id
    AND pt.token = (current_setting('app.share_token', true))::uuid
    AND (pt.expires_at IS NULL OR pt.expires_at > now())
  ))
));

-- Enable realtime
ALTER TABLE public.audit_activity_stream REPLICA IDENTITY FULL;

-- RPC to insert activity
CREATE OR REPLACE FUNCTION public.insert_audit_activity_with_token(
  p_session_id uuid,
  p_token uuid,
  p_agent_role text DEFAULT NULL,
  p_activity_type text DEFAULT 'info',
  p_title text DEFAULT '',
  p_content text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
  v_id uuid;
BEGIN
  -- Get project_id from session
  SELECT project_id INTO v_project_id
  FROM public.audit_sessions WHERE id = p_session_id;
  
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;
  
  -- Validate access
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  INSERT INTO public.audit_activity_stream (
    session_id, agent_role, activity_type, title, content, metadata
  ) VALUES (
    p_session_id, p_agent_role, p_activity_type, p_title, p_content, p_metadata
  ) RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- RPC to get activity stream
CREATE OR REPLACE FUNCTION public.get_audit_activity_stream_with_token(
  p_session_id uuid,
  p_token uuid,
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.audit_activity_stream
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id
  FROM public.audit_sessions WHERE id = p_session_id;
  
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  RETURN QUERY
  SELECT * FROM public.audit_activity_stream
  WHERE session_id = p_session_id
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$$;