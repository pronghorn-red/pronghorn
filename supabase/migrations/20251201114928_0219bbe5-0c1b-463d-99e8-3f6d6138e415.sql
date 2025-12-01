-- Phase 3: Agent Memory System
-- Tables for agent sessions, blackboard (episodic memory), and session context

-- Agent Sessions Table
CREATE TABLE IF NOT EXISTS public.agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'error')),
  mode TEXT NOT NULL CHECK (mode IN ('task', 'iterative_loop', 'continuous_improvement')),
  task_description TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent Blackboard Table (Episodic Memory)
CREATE TABLE IF NOT EXISTS public.agent_blackboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('planning', 'progress', 'decision', 'reasoning', 'next_steps', 'reflection')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent Session Context Table
CREATE TABLE IF NOT EXISTS public.agent_session_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL CHECK (context_type IN ('project_metadata', 'requirements', 'standards', 'tech_stacks', 'canvas', 'artifacts', 'chats')),
  context_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_blackboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_session_context ENABLE ROW LEVEL SECURITY;

-- RLS Policies for agent_sessions
CREATE POLICY "Users can access agent_sessions via token or auth"
ON public.agent_sessions
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.projects
    WHERE projects.id = agent_sessions.project_id
      AND (
        projects.created_by = auth.uid()
        OR 
        projects.share_token = (current_setting('app.share_token', true))::uuid
      )
  )
);

-- RLS Policies for agent_blackboard
CREATE POLICY "Users can access agent_blackboard via token or auth"
ON public.agent_blackboard
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.agent_sessions
    JOIN public.projects ON projects.id = agent_sessions.project_id
    WHERE agent_sessions.id = agent_blackboard.session_id
      AND (
        projects.created_by = auth.uid()
        OR 
        projects.share_token = (current_setting('app.share_token', true))::uuid
      )
  )
);

-- RLS Policies for agent_session_context
CREATE POLICY "Users can access agent_session_context via token or auth"
ON public.agent_session_context
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.agent_sessions
    JOIN public.projects ON projects.id = agent_sessions.project_id
    WHERE agent_sessions.id = agent_session_context.session_id
      AND (
        projects.created_by = auth.uid()
        OR 
        projects.share_token = (current_setting('app.share_token', true))::uuid
      )
  )
);

-- Indexes for performance
CREATE INDEX idx_agent_sessions_project_id ON public.agent_sessions(project_id);
CREATE INDEX idx_agent_sessions_status ON public.agent_sessions(status);
CREATE INDEX idx_agent_blackboard_session_id ON public.agent_blackboard(session_id);
CREATE INDEX idx_agent_blackboard_created_at ON public.agent_blackboard(created_at);
CREATE INDEX idx_agent_session_context_session_id ON public.agent_session_context(session_id);

-- RPC: Create Agent Session
CREATE OR REPLACE FUNCTION public.create_agent_session_with_token(
  p_project_id UUID,
  p_token UUID,
  p_mode TEXT,
  p_task_description TEXT DEFAULT NULL
)
RETURNS public.agent_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session public.agent_sessions;
BEGIN
  PERFORM public.set_share_token(p_token::text);

  INSERT INTO public.agent_sessions (project_id, mode, task_description, created_by)
  VALUES (p_project_id, p_mode, p_task_description, auth.uid())
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

-- RPC: Get Agent Sessions
CREATE OR REPLACE FUNCTION public.get_agent_sessions_with_token(
  p_project_id UUID,
  p_token UUID
)
RETURNS SETOF public.agent_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.set_share_token(p_token::text);

  RETURN QUERY
    SELECT *
    FROM public.agent_sessions
    WHERE project_id = p_project_id
    ORDER BY started_at DESC;
END;
$$;

-- RPC: Update Agent Session Status
CREATE OR REPLACE FUNCTION public.update_agent_session_status_with_token(
  p_session_id UUID,
  p_token UUID,
  p_status TEXT,
  p_completed_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.agent_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session public.agent_sessions;
BEGIN
  PERFORM public.set_share_token(p_token::text);

  UPDATE public.agent_sessions
  SET 
    status = p_status,
    completed_at = COALESCE(p_completed_at, completed_at),
    updated_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

-- RPC: Add Blackboard Entry
CREATE OR REPLACE FUNCTION public.add_blackboard_entry_with_token(
  p_session_id UUID,
  p_token UUID,
  p_entry_type TEXT,
  p_content TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS public.agent_blackboard
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_entry public.agent_blackboard;
BEGIN
  PERFORM public.set_share_token(p_token::text);

  INSERT INTO public.agent_blackboard (session_id, entry_type, content, metadata)
  VALUES (p_session_id, p_entry_type, p_content, p_metadata)
  RETURNING * INTO v_entry;

  RETURN v_entry;
END;
$$;

-- RPC: Get Blackboard Entries
CREATE OR REPLACE FUNCTION public.get_blackboard_entries_with_token(
  p_session_id UUID,
  p_token UUID
)
RETURNS SETOF public.agent_blackboard
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.set_share_token(p_token::text);

  RETURN QUERY
    SELECT *
    FROM public.agent_blackboard
    WHERE session_id = p_session_id
    ORDER BY created_at ASC;
END;
$$;

-- RPC: Add Session Context
CREATE OR REPLACE FUNCTION public.add_session_context_with_token(
  p_session_id UUID,
  p_token UUID,
  p_context_type TEXT,
  p_context_data JSONB
)
RETURNS public.agent_session_context
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_context public.agent_session_context;
BEGIN
  PERFORM public.set_share_token(p_token::text);

  INSERT INTO public.agent_session_context (session_id, context_type, context_data)
  VALUES (p_session_id, p_context_type, p_context_data)
  RETURNING * INTO v_context;

  RETURN v_context;
END;
$$;

-- RPC: Get Session Context
CREATE OR REPLACE FUNCTION public.get_session_context_with_token(
  p_session_id UUID,
  p_token UUID
)
RETURNS SETOF public.agent_session_context
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.set_share_token(p_token::text);

  RETURN QUERY
    SELECT *
    FROM public.agent_session_context
    WHERE session_id = p_session_id
    ORDER BY created_at ASC;
END;
$$;