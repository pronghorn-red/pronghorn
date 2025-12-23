-- Drop all existing overloaded versions of insert_artifact_with_token
DROP FUNCTION IF EXISTS public.insert_artifact_with_token(uuid, uuid, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.insert_artifact_with_token(uuid, uuid, text, text, uuid, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.insert_artifact_with_token(uuid, uuid, text, text, uuid, text, text, text, text, integer, integer);

-- Create single unified function with all 11 parameters (all optional params have DEFAULTs)
CREATE OR REPLACE FUNCTION public.insert_artifact_with_token(
  p_project_id uuid,
  p_token uuid,
  p_content text,
  p_source_type text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_ai_title text DEFAULT NULL,
  p_provenance_id text DEFAULT NULL,
  p_provenance_path text DEFAULT NULL,
  p_provenance_page integer DEFAULT NULL,
  p_provenance_total_pages integer DEFAULT NULL
)
RETURNS public.artifacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.artifacts;
BEGIN
  -- Validate access - require at least editor role
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  INSERT INTO public.artifacts (
    project_id, content, source_type, source_id, image_url, 
    ai_title, provenance_id, provenance_path, provenance_page, 
    provenance_total_pages, created_by
  )
  VALUES (
    p_project_id, p_content, p_source_type, p_source_id, p_image_url, 
    p_ai_title, p_provenance_id, p_provenance_path, p_provenance_page, 
    p_provenance_total_pages, auth.uid()
  )
  RETURNING * INTO result;
  
  RETURN result;
END;
$function$;