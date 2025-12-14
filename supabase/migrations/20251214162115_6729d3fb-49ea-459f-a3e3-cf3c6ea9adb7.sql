-- Create agent_llm_logs table for raw LLM input/output capture
CREATE TABLE public.agent_llm_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  iteration INTEGER NOT NULL,
  model TEXT NOT NULL,
  
  -- Input data
  input_prompt TEXT NOT NULL,
  input_char_count INTEGER NOT NULL,
  
  -- Output data  
  output_raw TEXT,
  output_char_count INTEGER,
  
  -- Metadata
  was_parse_success BOOLEAN NOT NULL DEFAULT true,
  parse_error_message TEXT,
  api_response_status INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_agent_llm_logs_session ON public.agent_llm_logs(session_id, iteration);
CREATE INDEX idx_agent_llm_logs_project ON public.agent_llm_logs(project_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.agent_llm_logs ENABLE ROW LEVEL SECURITY;

-- RLS policy matching other agent tables
CREATE POLICY "Users can access agent_llm_logs via token or auth"
ON public.agent_llm_logs
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM agent_sessions ags
    JOIN projects p ON p.id = ags.project_id
    WHERE ags.id = agent_llm_logs.session_id
    AND (
      p.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM project_tokens pt
        WHERE pt.project_id = p.id
        AND pt.token = (current_setting('app.share_token', true))::uuid
        AND (pt.expires_at IS NULL OR pt.expires_at > now())
      )
    )
  )
);

-- RPC function to insert a log entry
CREATE OR REPLACE FUNCTION public.insert_agent_llm_log_with_token(
  p_session_id UUID,
  p_project_id UUID,
  p_token UUID,
  p_iteration INTEGER,
  p_model TEXT,
  p_input_prompt TEXT,
  p_output_raw TEXT DEFAULT NULL,
  p_was_parse_success BOOLEAN DEFAULT true,
  p_parse_error_message TEXT DEFAULT NULL,
  p_api_response_status INTEGER DEFAULT NULL
)
RETURNS agent_llm_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.agent_llm_logs;
BEGIN
  -- Validate access
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  
  INSERT INTO public.agent_llm_logs (
    session_id, project_id, iteration, model,
    input_prompt, input_char_count,
    output_raw, output_char_count,
    was_parse_success, parse_error_message, api_response_status
  )
  VALUES (
    p_session_id, p_project_id, p_iteration, p_model,
    p_input_prompt, COALESCE(length(p_input_prompt), 0),
    p_output_raw, COALESCE(length(p_output_raw), 0),
    p_was_parse_success, p_parse_error_message, p_api_response_status
  )
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- RPC function to update parse status (when parsing fails after initial insert)
CREATE OR REPLACE FUNCTION public.update_agent_llm_log_parse_status_with_token(
  p_session_id UUID,
  p_iteration INTEGER,
  p_token UUID,
  p_was_parse_success BOOLEAN,
  p_parse_error_message TEXT DEFAULT NULL
)
RETURNS agent_llm_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
  result public.agent_llm_logs;
BEGIN
  -- Get project_id from session
  SELECT project_id INTO v_project_id FROM public.agent_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  
  -- Validate access
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  UPDATE public.agent_llm_logs
  SET was_parse_success = p_was_parse_success,
      parse_error_message = p_parse_error_message
  WHERE session_id = p_session_id AND iteration = p_iteration
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- RPC function to get logs for a session
CREATE OR REPLACE FUNCTION public.get_agent_llm_logs_with_token(
  p_session_id UUID,
  p_token UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS SETOF agent_llm_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
BEGIN
  -- Get project_id from session
  SELECT project_id INTO v_project_id FROM public.agent_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  
  -- Validate access
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  RETURN QUERY
  SELECT * FROM public.agent_llm_logs
  WHERE session_id = p_session_id
  ORDER BY iteration ASC
  LIMIT p_limit;
END;
$function$;