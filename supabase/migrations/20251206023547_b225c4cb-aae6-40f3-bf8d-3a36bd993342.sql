-- Phase 2: Simplified Authorization Architecture
-- Creates 2 core functions + 3 lookup helpers + project_tokens table

-- ============================================
-- STEP 1: Create role enum
-- ============================================
CREATE TYPE public.project_token_role AS ENUM ('owner', 'editor', 'viewer');

-- ============================================
-- STEP 2: Create project_tokens table
-- ============================================
CREATE TABLE public.project_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  role project_token_role NOT NULL DEFAULT 'viewer',
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  expires_at timestamptz,
  last_used_at timestamptz,
  UNIQUE(token)
);

-- Index for fast token lookups
CREATE INDEX idx_project_tokens_token ON public.project_tokens(token);
CREATE INDEX idx_project_tokens_project_id ON public.project_tokens(project_id);

-- Enable RLS
ALTER TABLE public.project_tokens ENABLE ROW LEVEL SECURITY;

-- Only project owners can manage tokens
CREATE POLICY "Project owners can manage tokens"
ON public.project_tokens
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_tokens.project_id
      AND projects.created_by = auth.uid()
  )
);

-- ============================================
-- STEP 3: Core Function 1 - authorize_project_access
-- Returns role if access granted, raises exception otherwise
-- ============================================
CREATE OR REPLACE FUNCTION public.authorize_project_access(
  p_project_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS project_token_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role project_token_role;
  v_project_owner uuid;
  v_token_expires timestamptz;
BEGIN
  -- Check 1: Is the current user the project owner?
  SELECT created_by INTO v_project_owner
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0001';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() = v_project_owner THEN
    RETURN 'owner'::project_token_role;
  END IF;

  -- Check 2: Is a valid token provided?
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication or valid token required' USING ERRCODE = 'P0001';
  END IF;

  -- Look up token in project_tokens table
  SELECT pt.role, pt.expires_at INTO v_role, v_token_expires
  FROM public.project_tokens pt
  WHERE pt.token = p_token
    AND pt.project_id = p_project_id;

  IF NOT FOUND THEN
    -- Fallback: Check legacy share_token on projects table (for migration period)
    IF EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = p_project_id AND share_token = p_token
    ) THEN
      -- Legacy tokens get editor role by default
      RETURN 'editor'::project_token_role;
    END IF;
    
    RAISE EXCEPTION 'Invalid token for this project' USING ERRCODE = 'P0001';
  END IF;

  -- Check token expiration
  IF v_token_expires IS NOT NULL AND v_token_expires < now() THEN
    RAISE EXCEPTION 'Token has expired' USING ERRCODE = 'P0001';
  END IF;

  -- Update last_used_at (fire-and-forget, don't block on this)
  UPDATE public.project_tokens
  SET last_used_at = now()
  WHERE token = p_token;

  RETURN v_role;
END;
$function$;

-- ============================================
-- STEP 4: Core Function 2 - require_role
-- Enforces minimum role level, raises exception if insufficient
-- ============================================
CREATE OR REPLACE FUNCTION public.require_role(
  p_project_id uuid,
  p_token uuid,
  p_min_role project_token_role
)
RETURNS project_token_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_role project_token_role;
  v_role_level integer;
  v_min_level integer;
BEGIN
  -- Get current role (this will raise if no access)
  v_current_role := public.authorize_project_access(p_project_id, p_token);

  -- Define role hierarchy: owner > editor > viewer
  v_role_level := CASE v_current_role
    WHEN 'owner' THEN 3
    WHEN 'editor' THEN 2
    WHEN 'viewer' THEN 1
  END;

  v_min_level := CASE p_min_role
    WHEN 'owner' THEN 3
    WHEN 'editor' THEN 2
    WHEN 'viewer' THEN 1
  END;

  IF v_role_level < v_min_level THEN
    RAISE EXCEPTION 'Insufficient permissions: % role required, you have %', p_min_role, v_current_role
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_current_role;
END;
$function$;

-- ============================================
-- STEP 5: Lookup Helper 1 - get_project_id_from_repo
-- ============================================
CREATE OR REPLACE FUNCTION public.get_project_id_from_repo(p_repo_id uuid)
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
  FROM public.project_repos
  WHERE id = p_repo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repository not found' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_project_id;
END;
$function$;

-- ============================================
-- STEP 6: Lookup Helper 2 - get_project_id_from_session
-- ============================================
CREATE OR REPLACE FUNCTION public.get_project_id_from_session(p_session_id uuid)
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
  FROM public.agent_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_project_id;
END;
$function$;

-- ============================================
-- STEP 7: Lookup Helper 3 - get_project_id_from_file
-- ============================================
CREATE OR REPLACE FUNCTION public.get_project_id_from_file(p_file_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Try repo_files first
  SELECT project_id INTO v_project_id
  FROM public.repo_files
  WHERE id = p_file_id;

  IF FOUND THEN
    RETURN v_project_id;
  END IF;

  -- Try repo_staging
  SELECT project_id INTO v_project_id
  FROM public.repo_staging
  WHERE id = p_file_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'File not found' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_project_id;
END;
$function$;

-- ============================================
-- STEP 8: Migrate existing share_tokens to project_tokens
-- Each existing project gets an 'editor' token from its share_token
-- ============================================
INSERT INTO public.project_tokens (project_id, token, role, label, created_by, created_at)
SELECT 
  id as project_id,
  share_token as token,
  'editor'::project_token_role as role,
  'Migrated share token' as label,
  created_by,
  created_at
FROM public.projects
WHERE share_token IS NOT NULL
ON CONFLICT (token) DO NOTHING;

-- ============================================
-- STEP 9: Add Realtime support for project_tokens
-- ============================================
ALTER TABLE public.project_tokens REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_tokens;