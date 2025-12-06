-- Drop the existing function first to change return type
DROP FUNCTION IF EXISTS public.insert_project_with_token(text, uuid, text, text, numeric, text, project_status);

-- Recreate with TABLE return type that includes share_token from project_tokens
CREATE OR REPLACE FUNCTION public.insert_project_with_token(
  p_name text,
  p_org_id uuid,
  p_description text DEFAULT NULL,
  p_organization text DEFAULT NULL,
  p_budget numeric DEFAULT NULL,
  p_scope text DEFAULT NULL,
  p_status project_status DEFAULT 'DESIGN'
)
RETURNS TABLE(id uuid, share_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_token uuid;
  v_user_id uuid;
BEGIN
  -- Get current user if authenticated
  v_user_id := auth.uid();
  
  -- Insert the project
  INSERT INTO public.projects (name, org_id, description, organization, budget, scope, status, created_by)
  VALUES (p_name, p_org_id, p_description, p_organization, p_budget, p_scope, p_status, v_user_id)
  RETURNING projects.id INTO v_project_id;
  
  -- Create an owner token in project_tokens table
  INSERT INTO public.project_tokens (project_id, role, label, created_by)
  VALUES (v_project_id, 'owner', 'Default Owner Token', v_user_id)
  RETURNING token INTO v_token;
  
  -- Return both the project ID and the token
  RETURN QUERY SELECT v_project_id AS id, v_token AS share_token;
END;
$function$;