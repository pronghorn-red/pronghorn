-- Update the update_project_with_token function to include all metadata fields
CREATE OR REPLACE FUNCTION public.update_project_with_token(
  p_project_id uuid,
  p_token uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_github_repo text DEFAULT NULL,
  p_organization text DEFAULT NULL,
  p_budget numeric DEFAULT NULL,
  p_scope text DEFAULT NULL,
  p_timeline_start date DEFAULT NULL,
  p_timeline_end date DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_tags text[] DEFAULT NULL
)
RETURNS projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result public.projects;
BEGIN
  -- Set the share token for this session so existing RLS policies can use it
  PERFORM public.set_share_token(p_token::text);

  UPDATE public.projects
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    github_repo = COALESCE(p_github_repo, github_repo),
    organization = COALESCE(p_organization, organization),
    budget = COALESCE(p_budget, budget),
    scope = COALESCE(p_scope, scope),
    timeline_start = COALESCE(p_timeline_start, timeline_start),
    timeline_end = COALESCE(p_timeline_end, timeline_end),
    priority = COALESCE(p_priority, priority),
    tags = COALESCE(p_tags, tags),
    updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;