-- Fix insert_artifact_with_token to set share_token session variable before INSERT
-- This allows the RLS policy to validate the token properly

CREATE OR REPLACE FUNCTION public.insert_artifact_with_token(
  p_project_id uuid,
  p_token uuid,
  p_content text,
  p_source_type text DEFAULT NULL,
  p_source_id text DEFAULT NULL,
  p_image_url text DEFAULT NULL
)
RETURNS public.artifacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_artifact public.artifacts;
BEGIN
  -- Validate access - require at least editor role
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  -- Set the share_token session variable for RLS policies
  PERFORM set_config('app.share_token', p_token::text, true);
  
  -- Insert the artifact
  INSERT INTO public.artifacts (project_id, content, source_type, source_id, created_by, image_url)
  VALUES (p_project_id, p_content, p_source_type, p_source_id, auth.uid(), p_image_url)
  RETURNING * INTO new_artifact;
  
  RETURN new_artifact;
END;
$function$;