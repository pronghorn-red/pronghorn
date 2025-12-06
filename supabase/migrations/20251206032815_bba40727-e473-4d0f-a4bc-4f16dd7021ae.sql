-- Fix: Change default token from 'owner' to 'editor' for new projects
-- Creator already has inherent owner access via created_by = auth.uid()

CREATE OR REPLACE FUNCTION public.insert_project_with_token(
  p_name text,
  p_org_id uuid,
  p_description text DEFAULT NULL,
  p_organization text DEFAULT NULL,
  p_budget numeric DEFAULT NULL,
  p_scope text DEFAULT NULL,
  p_status text DEFAULT 'DESIGN'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_project public.projects;
  new_token public.project_tokens;
BEGIN
  -- Insert new project
  INSERT INTO public.projects (name, org_id, description, organization, budget, scope, status, created_by)
  VALUES (p_name, p_org_id, p_description, p_organization, p_budget, p_scope, p_status::project_status, auth.uid())
  RETURNING * INTO new_project;

  -- Auto-create an EDITOR token (not owner - creator has inherent owner access)
  INSERT INTO public.project_tokens (project_id, token, role, label, created_by)
  VALUES (new_project.id, gen_random_uuid(), 'editor', 'Default Share Token', auth.uid())
  RETURNING * INTO new_token;

  -- Return project data with token for backward compatibility
  RETURN jsonb_build_object(
    'id', new_project.id,
    'name', new_project.name,
    'share_token', new_token.token,
    'created_by', new_project.created_by
  );
END;
$function$;