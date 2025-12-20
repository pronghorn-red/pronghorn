-- =============================================
-- PHASE 1: Collaborative Artifact Editor Schema
-- =============================================

-- 1. Core collaboration sessions on artifacts
CREATE TABLE public.artifact_collaborations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES public.artifacts(id) ON DELETE CASCADE,
  title text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'merged')),
  current_content text NOT NULL,
  base_content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  merged_at timestamptz,
  merged_to_artifact boolean DEFAULT false
);

-- 2. Chat messages between humans and agent during collaboration
CREATE TABLE public.artifact_collaboration_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaboration_id uuid NOT NULL REFERENCES public.artifact_collaborations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  token_id uuid REFERENCES public.project_tokens(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Line-level change history for full rollback/rollforward
CREATE TABLE public.artifact_collaboration_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaboration_id uuid NOT NULL REFERENCES public.artifact_collaborations(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('human', 'agent')),
  actor_identifier text,
  operation_type text NOT NULL CHECK (operation_type IN ('edit', 'insert', 'delete', 'replace')),
  start_line integer NOT NULL,
  end_line integer NOT NULL,
  old_content text,
  new_content text,
  full_content_snapshot text,
  narrative text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(collaboration_id, version_number)
);

-- 4. Agent's blackboard for collaboration sessions
CREATE TABLE public.artifact_collaboration_blackboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaboration_id uuid NOT NULL REFERENCES public.artifact_collaborations(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('planning', 'progress', 'decision', 'reasoning', 'reflection', 'summary')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================
CREATE INDEX idx_artifact_collaborations_project ON public.artifact_collaborations(project_id);
CREATE INDEX idx_artifact_collaborations_artifact ON public.artifact_collaborations(artifact_id);
CREATE INDEX idx_artifact_collaborations_status ON public.artifact_collaborations(status);
CREATE INDEX idx_collab_messages_collaboration ON public.artifact_collaboration_messages(collaboration_id);
CREATE INDEX idx_collab_messages_created ON public.artifact_collaboration_messages(collaboration_id, created_at);
CREATE INDEX idx_collab_history_version ON public.artifact_collaboration_history(collaboration_id, version_number);
CREATE INDEX idx_collab_history_created ON public.artifact_collaboration_history(collaboration_id, created_at);
CREATE INDEX idx_collab_blackboard_collaboration ON public.artifact_collaboration_blackboard(collaboration_id);

-- =============================================
-- ENABLE ROW LEVEL SECURITY
-- =============================================
ALTER TABLE public.artifact_collaborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifact_collaboration_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifact_collaboration_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifact_collaboration_blackboard ENABLE ROW LEVEL SECURITY;

-- =============================================
-- HELPER: Get project_id from collaboration
-- =============================================
CREATE OR REPLACE FUNCTION public.get_project_id_from_collaboration(p_collaboration_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id
  FROM public.artifact_collaborations
  WHERE id = p_collaboration_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Collaboration not found';
  END IF;
  
  RETURN v_project_id;
END;
$function$;

-- =============================================
-- RPC FUNCTIONS: artifact_collaborations
-- =============================================

-- Create collaboration
CREATE OR REPLACE FUNCTION public.create_artifact_collaboration_with_token(
  p_project_id uuid,
  p_artifact_id uuid,
  p_token uuid,
  p_title text DEFAULT NULL
)
RETURNS public.artifact_collaborations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_artifact_content text;
  v_result public.artifact_collaborations;
BEGIN
  -- Validate access - require editor role
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  -- Get artifact content
  SELECT content INTO v_artifact_content
  FROM public.artifacts
  WHERE id = p_artifact_id AND project_id = p_project_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artifact not found';
  END IF;
  
  -- Create collaboration
  INSERT INTO public.artifact_collaborations (
    project_id, artifact_id, title, current_content, base_content, created_by
  )
  VALUES (
    p_project_id, p_artifact_id, p_title, v_artifact_content, v_artifact_content, auth.uid()
  )
  RETURNING * INTO v_result;
  
  -- Create initial version in history
  INSERT INTO public.artifact_collaboration_history (
    collaboration_id, version_number, actor_type, actor_identifier,
    operation_type, start_line, end_line, new_content, full_content_snapshot, narrative
  )
  VALUES (
    v_result.id, 0, 'human', 'System',
    'insert', 1, 1, v_artifact_content, v_artifact_content, 'Initial content from artifact'
  );
  
  RETURN v_result;
END;
$function$;

-- Get collaborations for project
CREATE OR REPLACE FUNCTION public.get_artifact_collaborations_with_token(
  p_project_id uuid,
  p_token uuid,
  p_artifact_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS SETOF public.artifact_collaborations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  
  RETURN QUERY
  SELECT * FROM public.artifact_collaborations
  WHERE project_id = p_project_id
    AND (p_artifact_id IS NULL OR artifact_id = p_artifact_id)
    AND (p_status IS NULL OR status = p_status)
  ORDER BY updated_at DESC;
END;
$function$;

-- Get single collaboration
CREATE OR REPLACE FUNCTION public.get_artifact_collaboration_with_token(
  p_collaboration_id uuid,
  p_token uuid
)
RETURNS public.artifact_collaborations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_result public.artifact_collaborations;
BEGIN
  v_project_id := public.get_project_id_from_collaboration(p_collaboration_id);
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  SELECT * INTO v_result
  FROM public.artifact_collaborations
  WHERE id = p_collaboration_id;
  
  RETURN v_result;
END;
$function$;

-- Update collaboration content
CREATE OR REPLACE FUNCTION public.update_artifact_collaboration_with_token(
  p_collaboration_id uuid,
  p_token uuid,
  p_current_content text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS public.artifact_collaborations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_result public.artifact_collaborations;
BEGIN
  v_project_id := public.get_project_id_from_collaboration(p_collaboration_id);
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  UPDATE public.artifact_collaborations SET
    current_content = COALESCE(p_current_content, current_content),
    title = COALESCE(p_title, title),
    status = COALESCE(p_status, status),
    updated_at = now(),
    merged_at = CASE WHEN p_status = 'merged' THEN now() ELSE merged_at END,
    merged_to_artifact = CASE WHEN p_status = 'merged' THEN true ELSE merged_to_artifact END
  WHERE id = p_collaboration_id
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$function$;

-- Delete collaboration
CREATE OR REPLACE FUNCTION public.delete_artifact_collaboration_with_token(
  p_collaboration_id uuid,
  p_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  v_project_id := public.get_project_id_from_collaboration(p_collaboration_id);
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  DELETE FROM public.artifact_collaborations WHERE id = p_collaboration_id;
END;
$function$;

-- Merge collaboration back to artifact
CREATE OR REPLACE FUNCTION public.merge_collaboration_to_artifact_with_token(
  p_collaboration_id uuid,
  p_token uuid
)
RETURNS public.artifacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_artifact_id uuid;
  v_current_content text;
  v_result public.artifacts;
BEGIN
  -- Get collaboration details
  SELECT project_id, artifact_id, current_content
  INTO v_project_id, v_artifact_id, v_current_content
  FROM public.artifact_collaborations
  WHERE id = p_collaboration_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Collaboration not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Update artifact with collaborated content
  UPDATE public.artifacts SET
    content = v_current_content,
    updated_at = now()
  WHERE id = v_artifact_id
  RETURNING * INTO v_result;
  
  -- Mark collaboration as merged
  UPDATE public.artifact_collaborations SET
    status = 'merged',
    merged_at = now(),
    merged_to_artifact = true,
    updated_at = now()
  WHERE id = p_collaboration_id;
  
  RETURN v_result;
END;
$function$;

-- =============================================
-- RPC FUNCTIONS: artifact_collaboration_messages
-- =============================================

-- Get messages
CREATE OR REPLACE FUNCTION public.get_collaboration_messages_with_token(
  p_collaboration_id uuid,
  p_token uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.artifact_collaboration_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  v_project_id := public.get_project_id_from_collaboration(p_collaboration_id);
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  RETURN QUERY
  SELECT * FROM public.artifact_collaboration_messages
  WHERE collaboration_id = p_collaboration_id
  ORDER BY created_at ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- Insert message
CREATE OR REPLACE FUNCTION public.insert_collaboration_message_with_token(
  p_collaboration_id uuid,
  p_token uuid,
  p_role text,
  p_content text,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS public.artifact_collaboration_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_token_id uuid;
  v_result public.artifact_collaboration_messages;
BEGIN
  v_project_id := public.get_project_id_from_collaboration(p_collaboration_id);
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Get token_id for attribution
  SELECT id INTO v_token_id FROM public.project_tokens WHERE token = p_token;
  
  INSERT INTO public.artifact_collaboration_messages (
    collaboration_id, role, content, metadata, token_id
  )
  VALUES (
    p_collaboration_id, p_role, p_content, p_metadata, v_token_id
  )
  RETURNING * INTO v_result;
  
  -- Update collaboration updated_at
  UPDATE public.artifact_collaborations SET updated_at = now() WHERE id = p_collaboration_id;
  
  RETURN v_result;
END;
$function$;

-- =============================================
-- RPC FUNCTIONS: artifact_collaboration_history
-- =============================================

-- Get history
CREATE OR REPLACE FUNCTION public.get_collaboration_history_with_token(
  p_collaboration_id uuid,
  p_token uuid,
  p_from_version integer DEFAULT NULL,
  p_to_version integer DEFAULT NULL
)
RETURNS SETOF public.artifact_collaboration_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  v_project_id := public.get_project_id_from_collaboration(p_collaboration_id);
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  RETURN QUERY
  SELECT * FROM public.artifact_collaboration_history
  WHERE collaboration_id = p_collaboration_id
    AND (p_from_version IS NULL OR version_number >= p_from_version)
    AND (p_to_version IS NULL OR version_number <= p_to_version)
  ORDER BY version_number ASC;
END;
$function$;

-- Get latest version number
CREATE OR REPLACE FUNCTION public.get_collaboration_latest_version_with_token(
  p_collaboration_id uuid,
  p_token uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_version integer;
BEGIN
  v_project_id := public.get_project_id_from_collaboration(p_collaboration_id);
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  SELECT COALESCE(MAX(version_number), 0) INTO v_version
  FROM public.artifact_collaboration_history
  WHERE collaboration_id = p_collaboration_id;
  
  RETURN v_version;
END;
$function$;

-- Insert edit (creates history entry)
CREATE OR REPLACE FUNCTION public.insert_collaboration_edit_with_token(
  p_collaboration_id uuid,
  p_token uuid,
  p_actor_type text,
  p_actor_identifier text,
  p_operation_type text,
  p_start_line integer,
  p_end_line integer,
  p_old_content text,
  p_new_content text,
  p_narrative text,
  p_new_full_content text
)
RETURNS public.artifact_collaboration_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_next_version integer;
  v_result public.artifact_collaboration_history;
BEGIN
  v_project_id := public.get_project_id_from_collaboration(p_collaboration_id);
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM public.artifact_collaboration_history
  WHERE collaboration_id = p_collaboration_id;
  
  -- Insert history entry
  INSERT INTO public.artifact_collaboration_history (
    collaboration_id, version_number, actor_type, actor_identifier,
    operation_type, start_line, end_line, old_content, new_content,
    full_content_snapshot, narrative
  )
  VALUES (
    p_collaboration_id, v_next_version, p_actor_type, p_actor_identifier,
    p_operation_type, p_start_line, p_end_line, p_old_content, p_new_content,
    p_new_full_content, p_narrative
  )
  RETURNING * INTO v_result;
  
  -- Update collaboration current_content
  UPDATE public.artifact_collaborations SET
    current_content = p_new_full_content,
    updated_at = now()
  WHERE id = p_collaboration_id;
  
  RETURN v_result;
END;
$function$;

-- Restore to version
CREATE OR REPLACE FUNCTION public.restore_collaboration_version_with_token(
  p_collaboration_id uuid,
  p_token uuid,
  p_version_number integer,
  p_actor_identifier text DEFAULT 'System'
)
RETURNS public.artifact_collaboration_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_snapshot text;
  v_current_content text;
  v_next_version integer;
  v_result public.artifact_collaboration_history;
BEGIN
  v_project_id := public.get_project_id_from_collaboration(p_collaboration_id);
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Get the snapshot at target version
  SELECT full_content_snapshot INTO v_snapshot
  FROM public.artifact_collaboration_history
  WHERE collaboration_id = p_collaboration_id AND version_number = p_version_number;
  
  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Version % not found or has no snapshot', p_version_number;
  END IF;
  
  -- Get current content
  SELECT current_content INTO v_current_content
  FROM public.artifact_collaborations
  WHERE id = p_collaboration_id;
  
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM public.artifact_collaboration_history
  WHERE collaboration_id = p_collaboration_id;
  
  -- Create restore entry
  INSERT INTO public.artifact_collaboration_history (
    collaboration_id, version_number, actor_type, actor_identifier,
    operation_type, start_line, end_line, old_content, new_content,
    full_content_snapshot, narrative
  )
  VALUES (
    p_collaboration_id, v_next_version, 'human', p_actor_identifier,
    'replace', 1, 1, v_current_content, v_snapshot,
    v_snapshot, 'Restored to version ' || p_version_number
  )
  RETURNING * INTO v_result;
  
  -- Update current content
  UPDATE public.artifact_collaborations SET
    current_content = v_snapshot,
    updated_at = now()
  WHERE id = p_collaboration_id;
  
  RETURN v_result;
END;
$function$;

-- =============================================
-- RPC FUNCTIONS: artifact_collaboration_blackboard
-- =============================================

-- Get blackboard entries
CREATE OR REPLACE FUNCTION public.get_collaboration_blackboard_with_token(
  p_collaboration_id uuid,
  p_token uuid,
  p_entry_type text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS SETOF public.artifact_collaboration_blackboard
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  v_project_id := public.get_project_id_from_collaboration(p_collaboration_id);
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  RETURN QUERY
  SELECT * FROM public.artifact_collaboration_blackboard
  WHERE collaboration_id = p_collaboration_id
    AND (p_entry_type IS NULL OR entry_type = p_entry_type)
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$function$;

-- Insert blackboard entry
CREATE OR REPLACE FUNCTION public.insert_collaboration_blackboard_with_token(
  p_collaboration_id uuid,
  p_token uuid,
  p_entry_type text,
  p_content text,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS public.artifact_collaboration_blackboard
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_result public.artifact_collaboration_blackboard;
BEGIN
  v_project_id := public.get_project_id_from_collaboration(p_collaboration_id);
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  INSERT INTO public.artifact_collaboration_blackboard (
    collaboration_id, entry_type, content, metadata
  )
  VALUES (
    p_collaboration_id, p_entry_type, p_content, p_metadata
  )
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$function$;

-- =============================================
-- RLS POLICIES (Restrictive - use RPC functions)
-- =============================================

-- artifact_collaborations policies
CREATE POLICY "No direct access to collaborations"
ON public.artifact_collaborations
FOR ALL
USING (false);

-- artifact_collaboration_messages policies
CREATE POLICY "No direct access to collaboration messages"
ON public.artifact_collaboration_messages
FOR ALL
USING (false);

-- artifact_collaboration_history policies
CREATE POLICY "No direct access to collaboration history"
ON public.artifact_collaboration_history
FOR ALL
USING (false);

-- artifact_collaboration_blackboard policies
CREATE POLICY "No direct access to collaboration blackboard"
ON public.artifact_collaboration_blackboard
FOR ALL
USING (false);

-- =============================================
-- TRIGGER: Update timestamp
-- =============================================
CREATE TRIGGER update_artifact_collaborations_updated_at
BEFORE UPDATE ON public.artifact_collaborations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();