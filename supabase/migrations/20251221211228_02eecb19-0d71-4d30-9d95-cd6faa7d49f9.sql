-- Update the function to allow explicitly setting splash_image_url to null
-- We use a sentinel approach: if the caller passes p_splash_image_url, we always use it (including null)
-- by adding a separate boolean parameter to control this

CREATE OR REPLACE FUNCTION public.update_project_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_organization text DEFAULT NULL,
  p_budget numeric DEFAULT NULL,
  p_scope text DEFAULT NULL,
  p_timeline_start date DEFAULT NULL,
  p_timeline_end date DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_status public.project_status DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_splash_image_url text DEFAULT '__UNCHANGED__'
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result public.projects;
BEGIN
  -- Require editor role
  PERFORM public.require_role(p_project_id, p_token, 'editor');

  UPDATE public.projects SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    organization = COALESCE(p_organization, organization),
    budget = COALESCE(p_budget, budget),
    scope = COALESCE(p_scope, scope),
    timeline_start = COALESCE(p_timeline_start, timeline_start),
    timeline_end = COALESCE(p_timeline_end, timeline_end),
    priority = COALESCE(p_priority, priority),
    tags = COALESCE(p_tags, tags),
    -- For splash_image_url: if '__UNCHANGED__' keep existing, otherwise use provided value (even if null)
    splash_image_url = CASE 
      WHEN p_splash_image_url = '__UNCHANGED__' THEN splash_image_url 
      ELSE p_splash_image_url 
    END,
    updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;