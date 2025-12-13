-- Phase 1: Add new columns to project_specifications table
ALTER TABLE public.project_specifications ADD COLUMN IF NOT EXISTS agent_id TEXT;
ALTER TABLE public.project_specifications ADD COLUMN IF NOT EXISTS agent_title TEXT;
ALTER TABLE public.project_specifications ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE public.project_specifications ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT true;
ALTER TABLE public.project_specifications ADD COLUMN IF NOT EXISTS generated_by_user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.project_specifications ADD COLUMN IF NOT EXISTS generated_by_token UUID;

-- Create unique constraint for (project_id, agent_id, version)
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_spec_agent_version 
  ON public.project_specifications (project_id, agent_id, version);

-- Index for fast retrieval of latest versions
CREATE INDEX IF NOT EXISTS idx_project_spec_latest 
  ON public.project_specifications (project_id, agent_id, is_latest) WHERE is_latest = true;

-- Phase 2: RPC Functions

-- 2.1. Insert new specification version
CREATE OR REPLACE FUNCTION public.insert_specification_with_token(
  p_project_id UUID,
  p_token UUID,
  p_agent_id TEXT,
  p_agent_title TEXT,
  p_generated_spec TEXT,
  p_raw_data JSONB DEFAULT NULL
)
RETURNS project_specifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_max_version INTEGER;
  v_user_id UUID;
  result public.project_specifications;
BEGIN
  -- Validate access - require at least editor role
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  -- Get current user if authenticated
  v_user_id := auth.uid();
  
  -- Find the max version for this project+agent combination
  SELECT COALESCE(MAX(version), 0) INTO v_max_version
  FROM public.project_specifications
  WHERE project_id = p_project_id AND agent_id = p_agent_id;
  
  -- Set is_latest=false for the current latest version
  UPDATE public.project_specifications
  SET is_latest = false, updated_at = now()
  WHERE project_id = p_project_id 
    AND agent_id = p_agent_id 
    AND is_latest = true;
  
  -- Insert new version as latest
  INSERT INTO public.project_specifications (
    project_id, agent_id, agent_title, version, is_latest,
    generated_spec, raw_data, generated_by_user_id, generated_by_token
  )
  VALUES (
    p_project_id, p_agent_id, p_agent_title, v_max_version + 1, true,
    p_generated_spec, p_raw_data, v_user_id, p_token
  )
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- 2.2. Get all specifications for a project (optionally filtered)
CREATE OR REPLACE FUNCTION public.get_project_specifications_with_token(
  p_project_id UUID,
  p_token UUID,
  p_agent_id TEXT DEFAULT NULL,
  p_latest_only BOOLEAN DEFAULT true
)
RETURNS SETOF project_specifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate access - require at least viewer role
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  
  RETURN QUERY
  SELECT * FROM public.project_specifications
  WHERE project_id = p_project_id
    AND (p_agent_id IS NULL OR agent_id = p_agent_id)
    AND (p_latest_only = false OR is_latest = true)
  ORDER BY agent_id, version DESC;
END;
$function$;

-- 2.3. Get a specific specification by ID
CREATE OR REPLACE FUNCTION public.get_specification_by_id_with_token(
  p_specification_id UUID,
  p_token UUID
)
RETURNS project_specifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
  result public.project_specifications;
BEGIN
  -- Get project_id from specification
  SELECT project_id INTO v_project_id 
  FROM public.project_specifications 
  WHERE id = p_specification_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Specification not found';
  END IF;
  
  -- Validate access
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  SELECT * INTO result FROM public.project_specifications WHERE id = p_specification_id;
  RETURN result;
END;
$function$;

-- 2.4. Get all versions for a specific agent
CREATE OR REPLACE FUNCTION public.get_specification_versions_with_token(
  p_project_id UUID,
  p_token UUID,
  p_agent_id TEXT
)
RETURNS SETOF project_specifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate access
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  
  RETURN QUERY
  SELECT * FROM public.project_specifications
  WHERE project_id = p_project_id AND agent_id = p_agent_id
  ORDER BY version DESC;
END;
$function$;

-- 2.5. Set a specific version as "latest"
CREATE OR REPLACE FUNCTION public.set_specification_latest_with_token(
  p_specification_id UUID,
  p_token UUID
)
RETURNS project_specifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
  v_agent_id TEXT;
  result public.project_specifications;
BEGIN
  -- Get project_id and agent_id from specification
  SELECT project_id, agent_id INTO v_project_id, v_agent_id 
  FROM public.project_specifications 
  WHERE id = p_specification_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Specification not found';
  END IF;
  
  -- Validate access - require editor role
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Set all other versions of this agent as not latest
  UPDATE public.project_specifications
  SET is_latest = false, updated_at = now()
  WHERE project_id = v_project_id 
    AND agent_id = v_agent_id 
    AND is_latest = true;
  
  -- Set the specified version as latest
  UPDATE public.project_specifications
  SET is_latest = true, updated_at = now()
  WHERE id = p_specification_id
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;

-- 2.6. Delete a specific specification version
CREATE OR REPLACE FUNCTION public.delete_specification_with_token(
  p_specification_id UUID,
  p_token UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
  v_agent_id TEXT;
  v_was_latest BOOLEAN;
  v_next_latest_id UUID;
BEGIN
  -- Get specification details
  SELECT project_id, agent_id, is_latest INTO v_project_id, v_agent_id, v_was_latest
  FROM public.project_specifications 
  WHERE id = p_specification_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Specification not found';
  END IF;
  
  -- Validate access - require editor role
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  -- Delete the specification
  DELETE FROM public.project_specifications WHERE id = p_specification_id;
  
  -- If it was the latest, set the next highest version as latest
  IF v_was_latest THEN
    SELECT id INTO v_next_latest_id
    FROM public.project_specifications
    WHERE project_id = v_project_id AND agent_id = v_agent_id
    ORDER BY version DESC
    LIMIT 1;
    
    IF v_next_latest_id IS NOT NULL THEN
      UPDATE public.project_specifications
      SET is_latest = true, updated_at = now()
      WHERE id = v_next_latest_id;
    END IF;
  END IF;
END;
$function$;