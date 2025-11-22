-- Enforce share_token or ownership inside get_project_with_token
CREATE OR REPLACE FUNCTION public.get_project_with_token(
  p_project_id uuid,
  p_token uuid
)
RETURNS projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.projects;
BEGIN
  -- First, allow authenticated owners regardless of token
  IF auth.uid() IS NOT NULL THEN
    SELECT *
    INTO result
    FROM public.projects
    WHERE id = p_project_id
      AND created_by = auth.uid();

    IF FOUND THEN
      RETURN result;
    END IF;
  END IF;

  -- For token-based access, a non-null token must match the project share_token
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'Share token is required for this project' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO result
  FROM public.projects
  WHERE id = p_project_id
    AND share_token = p_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid share token for this project' USING ERRCODE = 'P0001';
  END IF;

  RETURN result;
END;
$function$;