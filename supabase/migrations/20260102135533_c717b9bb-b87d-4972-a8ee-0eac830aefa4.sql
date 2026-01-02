-- Create a lightweight RPC that returns only presentation metadata (not slides/blackboard content)
CREATE OR REPLACE FUNCTION public.get_project_presentations_list_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  project_id uuid,
  name text,
  initial_prompt text,
  mode text,
  target_slides integer,
  status text,
  slide_count integer,
  cover_image_url text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  version integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate access - require at least viewer
  PERFORM public.require_role(p_project_id, p_token, 'viewer');

  RETURN QUERY 
  SELECT 
    pp.id,
    pp.project_id,
    pp.name,
    pp.initial_prompt,
    pp.mode,
    pp.target_slides,
    pp.status,
    COALESCE(jsonb_array_length(pp.slides::jsonb), 0)::integer as slide_count,
    pp.cover_image_url,
    pp.metadata::jsonb,
    pp.created_at,
    pp.updated_at,
    pp.created_by,
    pp.version
  FROM public.project_presentations pp
  WHERE pp.project_id = p_project_id
  ORDER BY pp.created_at DESC;
END;
$function$;

-- Also create a function to get a single presentation's full content
CREATE OR REPLACE FUNCTION public.get_presentation_with_token(
  p_presentation_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS SETOF public.project_presentations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from presentation
  SELECT project_id INTO v_project_id FROM public.project_presentations WHERE id = p_presentation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Presentation not found'; END IF;

  -- Validate access - require at least viewer
  PERFORM public.require_role(v_project_id, p_token, 'viewer');

  RETURN QUERY SELECT * FROM public.project_presentations WHERE id = p_presentation_id;
END;
$function$;