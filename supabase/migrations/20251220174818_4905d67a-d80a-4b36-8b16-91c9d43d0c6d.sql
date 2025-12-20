-- Drop the existing text version and recreate with proper null handling
DROP FUNCTION IF EXISTS public.insert_artifact_with_token(uuid, uuid, text, text, text, text);

-- Recreate with uuid parameter that accepts null properly
CREATE OR REPLACE FUNCTION public.insert_artifact_with_token(
  p_project_id uuid,
  p_token uuid,
  p_content text,
  p_source_type text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL,
  p_image_url text DEFAULT NULL
)
RETURNS artifacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.artifacts;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  INSERT INTO public.artifacts (project_id, content, source_type, source_id, image_url, created_by)
  VALUES (p_project_id, p_content, p_source_type, p_source_id, p_image_url, auth.uid())
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;