-- Add splash_image_url to projects table
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS splash_image_url text;

-- Fix publish_project_to_gallery to use is_admin_or_superadmin instead of is_admin
CREATE OR REPLACE FUNCTION public.publish_project_to_gallery(
  p_project_id uuid,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_category text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_published_id uuid;
  v_project_name text;
  v_project_description text;
  v_project_tags text[];
BEGIN
  -- Check if user is superadmin or admin
  IF NOT is_admin_or_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only superadmins and admins can publish projects to the gallery';
  END IF;

  -- Get project details if not provided
  SELECT name, description, tags INTO v_project_name, v_project_description, v_project_tags
  FROM projects WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  -- Insert or update the published project
  INSERT INTO published_projects (
    project_id,
    name,
    description,
    image_url,
    tags,
    category,
    published_by,
    is_visible
  ) VALUES (
    p_project_id,
    COALESCE(p_name, v_project_name),
    COALESCE(p_description, v_project_description),
    p_image_url,
    COALESCE(p_tags, v_project_tags),
    p_category,
    auth.uid(),
    true
  )
  ON CONFLICT (project_id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, published_projects.name),
    description = COALESCE(EXCLUDED.description, published_projects.description),
    image_url = COALESCE(EXCLUDED.image_url, published_projects.image_url),
    tags = COALESCE(EXCLUDED.tags, published_projects.tags),
    category = COALESCE(EXCLUDED.category, published_projects.category),
    updated_at = now()
  RETURNING id INTO v_published_id;

  RETURN v_published_id;
END;
$function$;

-- Update update_project_with_token to accept splash_image_url
CREATE OR REPLACE FUNCTION public.update_project_with_token(
  p_project_id uuid,
  p_token uuid,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_organization text DEFAULT NULL,
  p_budget numeric DEFAULT NULL,
  p_scope text DEFAULT NULL,
  p_timeline_start date DEFAULT NULL,
  p_timeline_end date DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_splash_image_url text DEFAULT NULL
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
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
    splash_image_url = COALESCE(p_splash_image_url, splash_image_url),
    updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO result;

  RETURN result;
END;
$function$;