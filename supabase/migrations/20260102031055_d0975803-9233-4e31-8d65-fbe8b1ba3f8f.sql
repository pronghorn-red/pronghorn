-- Fix presentation RPC functions - remove set_share_token calls
-- Following the modern pattern from other RPC functions

-- RPC: Get presentations with token (fixed)
CREATE OR REPLACE FUNCTION public.get_project_presentations_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS SETOF public.project_presentations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate access - require at least viewer role
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  
  RETURN QUERY
  SELECT * FROM public.project_presentations
  WHERE project_id = p_project_id
  ORDER BY created_at DESC;
END;
$$;

-- RPC: Insert presentation with token (fixed)
CREATE OR REPLACE FUNCTION public.insert_presentation_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL,
  p_name text DEFAULT 'New Presentation',
  p_initial_prompt text DEFAULT NULL,
  p_mode text DEFAULT 'concise',
  p_target_slides integer DEFAULT 15
)
RETURNS public.project_presentations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result public.project_presentations;
BEGIN
  -- Validate access - require at least editor role
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  INSERT INTO public.project_presentations (
    project_id, name, initial_prompt, mode, target_slides, status, created_by
  ) VALUES (
    p_project_id, p_name, p_initial_prompt, p_mode, p_target_slides, 'draft', auth.uid()
  )
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$$;

-- RPC: Update presentation with token (fixed)
CREATE OR REPLACE FUNCTION public.update_presentation_with_token(
  p_presentation_id uuid,
  p_token uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_slides jsonb DEFAULT NULL,
  p_blackboard jsonb DEFAULT NULL,
  p_cover_image_url text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS public.project_presentations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
  v_result public.project_presentations;
BEGIN
  -- Get project_id from presentation
  SELECT project_id INTO v_project_id 
  FROM public.project_presentations 
  WHERE id = p_presentation_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Presentation not found';
  END IF;
  
  -- Validate access - require at least editor role
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  UPDATE public.project_presentations
  SET
    name = COALESCE(p_name, name),
    slides = COALESCE(p_slides, slides),
    blackboard = COALESCE(p_blackboard, blackboard),
    cover_image_url = COALESCE(p_cover_image_url, cover_image_url),
    metadata = COALESCE(p_metadata, metadata),
    status = COALESCE(p_status, status),
    updated_at = now()
  WHERE id = p_presentation_id
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$$;

-- RPC: Append to blackboard (fixed)
CREATE OR REPLACE FUNCTION public.append_presentation_blackboard_with_token(
  p_presentation_id uuid,
  p_token uuid DEFAULT NULL,
  p_entry jsonb DEFAULT NULL
)
RETURNS public.project_presentations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
  v_result public.project_presentations;
BEGIN
  -- Get project_id from presentation
  SELECT project_id INTO v_project_id 
  FROM public.project_presentations 
  WHERE id = p_presentation_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Presentation not found';
  END IF;
  
  -- Validate access - require at least editor role
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  UPDATE public.project_presentations
  SET
    blackboard = blackboard || p_entry,
    updated_at = now()
  WHERE id = p_presentation_id
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$$;

-- RPC: Delete presentation with token (fixed)
CREATE OR REPLACE FUNCTION public.delete_presentation_with_token(
  p_presentation_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from presentation
  SELECT project_id INTO v_project_id 
  FROM public.project_presentations 
  WHERE id = p_presentation_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Presentation not found';
  END IF;
  
  -- Validate access - require at least editor role
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  DELETE FROM public.project_presentations WHERE id = p_presentation_id;
END;
$$;