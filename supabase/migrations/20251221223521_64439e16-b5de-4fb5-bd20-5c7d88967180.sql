-- Drop existing function to change return type
DROP FUNCTION IF EXISTS public.get_linked_projects();

-- Recreate get_linked_projects with proper token validation
-- Uses SECURITY DEFINER to read projects, but validates via INNER JOIN on project_tokens
-- If token is revoked/expired, the project will not appear
CREATE OR REPLACE FUNCTION public.get_linked_projects()
RETURNS TABLE(
  id uuid,
  project_id uuid,
  project_name text,
  project_status public.project_status,
  project_updated_at timestamptz,
  project_description text,
  project_splash_image_url text,
  role public.project_token_role,
  is_valid boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- User must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
    SELECT 
      plp.id,
      plp.project_id,
      p.name AS project_name,
      p.status AS project_status,
      p.updated_at AS project_updated_at,
      p.description AS project_description,
      p.splash_image_url AS project_splash_image_url,
      pt.role,
      -- Token is valid if it exists and is not expired
      (pt.id IS NOT NULL AND (pt.expires_at IS NULL OR pt.expires_at > now())) AS is_valid
    FROM public.profile_linked_projects plp
    -- INNER JOIN ensures we only return projects where the token still exists
    INNER JOIN public.project_tokens pt ON pt.token = plp.token AND pt.project_id = plp.project_id
    INNER JOIN public.projects p ON p.id = plp.project_id
    WHERE plp.user_id = auth.uid()
      -- Additional validation: token must not be expired
      AND (pt.expires_at IS NULL OR pt.expires_at > now())
    ORDER BY plp.created_at DESC;
END;
$function$;