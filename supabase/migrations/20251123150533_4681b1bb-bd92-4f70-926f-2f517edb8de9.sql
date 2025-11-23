-- Add LLM configuration fields to projects table
ALTER TABLE public.projects
ADD COLUMN selected_model text DEFAULT 'gemini-2.5-flash',
ADD COLUMN max_tokens integer DEFAULT 32768,
ADD COLUMN thinking_enabled boolean DEFAULT false,
ADD COLUMN thinking_budget integer DEFAULT -1;

-- Create artifacts table for reusable knowledge blocks
CREATE TABLE public.artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  content text NOT NULL,
  ai_title text,
  ai_summary text,
  source_type text, -- 'manual', 'chat_message', 'chat_conversation'
  source_id uuid, -- reference to chat_message or chat_session if applicable
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

-- Enable RLS on artifacts
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;

-- RLS policy for artifacts
CREATE POLICY "Users can access artifacts"
ON public.artifacts
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM projects
    WHERE projects.id = artifacts.project_id
      AND (
        projects.created_by = auth.uid()
        OR 
        projects.share_token = (current_setting('app.share_token'::text, true))::uuid
      )
  )
);

-- Create chat_sessions table
CREATE TABLE public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text,
  ai_title text,
  ai_summary text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

-- Enable RLS on chat_sessions
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policy for chat_sessions
CREATE POLICY "Users can access chat sessions"
ON public.chat_sessions
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM projects
    WHERE projects.id = chat_sessions.project_id
      AND (
        projects.created_by = auth.uid()
        OR 
        projects.share_token = (current_setting('app.share_token'::text, true))::uuid
      )
  )
);

-- Create chat_messages table
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL, -- 'user' or 'assistant'
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

-- Enable RLS on chat_messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS policy for chat_messages
CREATE POLICY "Users can access chat messages"
ON public.chat_messages
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM chat_sessions
    JOIN projects ON projects.id = chat_sessions.project_id
    WHERE chat_sessions.id = chat_messages.chat_session_id
      AND (
        projects.created_by = auth.uid()
        OR 
        projects.share_token = (current_setting('app.share_token'::text, true))::uuid
      )
  )
);

-- Create RPC functions for artifacts
CREATE OR REPLACE FUNCTION public.get_artifacts_with_token(
  p_project_id uuid,
  p_token uuid
)
RETURNS SETOF artifacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate access first
  PERFORM public.validate_project_access(p_project_id, p_token);

  RETURN QUERY
    SELECT *
    FROM public.artifacts
    WHERE project_id = p_project_id
    ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_artifact_with_token(
  p_project_id uuid,
  p_token uuid,
  p_content text,
  p_source_type text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL
)
RETURNS artifacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_artifact public.artifacts;
BEGIN
  -- Validate access first
  PERFORM public.validate_project_access(p_project_id, p_token);

  INSERT INTO public.artifacts (project_id, content, source_type, source_id, created_by)
  VALUES (p_project_id, p_content, p_source_type, p_source_id, auth.uid())
  RETURNING * INTO new_artifact;

  RETURN new_artifact;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_artifact_with_token(
  p_id uuid,
  p_token uuid,
  p_content text DEFAULT NULL,
  p_ai_title text DEFAULT NULL,
  p_ai_summary text DEFAULT NULL
)
RETURNS artifacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
  updated public.artifacts;
BEGIN
  -- Get project_id from artifact
  SELECT project_id INTO v_project_id
  FROM public.artifacts
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artifact not found' USING ERRCODE = 'P0001';
  END IF;

  -- Validate access
  PERFORM public.validate_project_access(v_project_id, p_token);

  UPDATE public.artifacts
  SET
    content = COALESCE(p_content, content),
    ai_title = COALESCE(p_ai_title, ai_title),
    ai_summary = COALESCE(p_ai_summary, ai_summary),
    updated_at = now()
  WHERE id = p_id
  RETURNING * INTO updated;

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_artifact_with_token(
  p_id uuid,
  p_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from artifact
  SELECT project_id INTO v_project_id
  FROM public.artifacts
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artifact not found' USING ERRCODE = 'P0001';
  END IF;

  -- Validate access
  PERFORM public.validate_project_access(v_project_id, p_token);

  DELETE FROM public.artifacts
  WHERE id = p_id;
END;
$$;

-- Create RPC functions for chat sessions
CREATE OR REPLACE FUNCTION public.get_chat_sessions_with_token(
  p_project_id uuid,
  p_token uuid
)
RETURNS SETOF chat_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate access first
  PERFORM public.validate_project_access(p_project_id, p_token);

  RETURN QUERY
    SELECT *
    FROM public.chat_sessions
    WHERE project_id = p_project_id
    ORDER BY updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_chat_session_with_token(
  p_project_id uuid,
  p_token uuid,
  p_title text DEFAULT 'New Chat'
)
RETURNS chat_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_session public.chat_sessions;
BEGIN
  -- Validate access first
  PERFORM public.validate_project_access(p_project_id, p_token);

  INSERT INTO public.chat_sessions (project_id, title, created_by)
  VALUES (p_project_id, p_title, auth.uid())
  RETURNING * INTO new_session;

  RETURN new_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_chat_session_with_token(
  p_id uuid,
  p_token uuid,
  p_title text DEFAULT NULL,
  p_ai_title text DEFAULT NULL,
  p_ai_summary text DEFAULT NULL
)
RETURNS chat_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
  updated public.chat_sessions;
BEGIN
  -- Get project_id from chat session
  SELECT project_id INTO v_project_id
  FROM public.chat_sessions
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat session not found' USING ERRCODE = 'P0001';
  END IF;

  -- Validate access
  PERFORM public.validate_project_access(v_project_id, p_token);

  UPDATE public.chat_sessions
  SET
    title = COALESCE(p_title, title),
    ai_title = COALESCE(p_ai_title, ai_title),
    ai_summary = COALESCE(p_ai_summary, ai_summary),
    updated_at = now()
  WHERE id = p_id
  RETURNING * INTO updated;

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_chat_session_with_token(
  p_id uuid,
  p_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from chat session
  SELECT project_id INTO v_project_id
  FROM public.chat_sessions
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat session not found' USING ERRCODE = 'P0001';
  END IF;

  -- Validate access
  PERFORM public.validate_project_access(v_project_id, p_token);

  DELETE FROM public.chat_sessions
  WHERE id = p_id;
END;
$$;

-- Create RPC functions for chat messages
CREATE OR REPLACE FUNCTION public.get_chat_messages_with_token(
  p_chat_session_id uuid,
  p_token uuid
)
RETURNS SETOF chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from chat session
  SELECT project_id INTO v_project_id
  FROM public.chat_sessions
  WHERE id = p_chat_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat session not found' USING ERRCODE = 'P0001';
  END IF;

  -- Validate access
  PERFORM public.validate_project_access(v_project_id, p_token);

  RETURN QUERY
    SELECT *
    FROM public.chat_messages
    WHERE chat_session_id = p_chat_session_id
    ORDER BY created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_chat_message_with_token(
  p_chat_session_id uuid,
  p_token uuid,
  p_role text,
  p_content text
)
RETURNS chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
  new_message public.chat_messages;
BEGIN
  -- Get project_id from chat session
  SELECT project_id INTO v_project_id
  FROM public.chat_sessions
  WHERE id = p_chat_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat session not found' USING ERRCODE = 'P0001';
  END IF;

  -- Validate access
  PERFORM public.validate_project_access(v_project_id, p_token);

  INSERT INTO public.chat_messages (chat_session_id, role, content, created_by)
  VALUES (p_chat_session_id, p_role, p_content, auth.uid())
  RETURNING * INTO new_message;

  -- Update chat session updated_at
  UPDATE public.chat_sessions
  SET updated_at = now()
  WHERE id = p_chat_session_id;

  RETURN new_message;
END;
$$;