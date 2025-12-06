-- Get all tokens for a project (owner only)
CREATE OR REPLACE FUNCTION public.get_project_tokens_with_token(
  p_project_id uuid,
  p_token uuid
)
RETURNS SETOF project_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Require owner role
  PERFORM public.require_role(p_project_id, p_token, 'owner');
  
  RETURN QUERY
    SELECT *
    FROM public.project_tokens
    WHERE project_id = p_project_id
    ORDER BY created_at DESC;
END;
$function$;

-- Create a new token with role and label (owner only)
CREATE OR REPLACE FUNCTION public.create_project_token_with_token(
  p_project_id uuid,
  p_token uuid,
  p_role project_token_role,
  p_label text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS project_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_token public.project_tokens;
BEGIN
  -- Require owner role
  PERFORM public.require_role(p_project_id, p_token, 'owner');
  
  -- Only allow creating editor or viewer tokens (not owner)
  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot create owner tokens' USING ERRCODE = 'P0001';
  END IF;
  
  INSERT INTO public.project_tokens (project_id, role, label, expires_at, created_by)
  VALUES (p_project_id, p_role, p_label, p_expires_at, auth.uid())
  RETURNING * INTO new_token;
  
  RETURN new_token;
END;
$function$;

-- Delete a token by ID (owner only)
CREATE OR REPLACE FUNCTION public.delete_project_token_with_token(
  p_token_id uuid,
  p_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from the token being deleted
  SELECT project_id INTO v_project_id
  FROM public.project_tokens
  WHERE id = p_token_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token not found' USING ERRCODE = 'P0001';
  END IF;
  
  -- Require owner role on that project
  PERFORM public.require_role(v_project_id, p_token, 'owner');
  
  DELETE FROM public.project_tokens WHERE id = p_token_id;
END;
$function$;

-- Update token label/expiry (owner only)
CREATE OR REPLACE FUNCTION public.update_project_token_with_token(
  p_token_id uuid,
  p_token uuid,
  p_label text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS project_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  updated public.project_tokens;
BEGIN
  -- Get project_id from the token being updated
  SELECT project_id INTO v_project_id
  FROM public.project_tokens
  WHERE id = p_token_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token not found' USING ERRCODE = 'P0001';
  END IF;
  
  -- Require owner role on that project
  PERFORM public.require_role(v_project_id, p_token, 'owner');
  
  UPDATE public.project_tokens
  SET 
    label = COALESCE(p_label, label),
    expires_at = p_expires_at
  WHERE id = p_token_id
  RETURNING * INTO updated;
  
  RETURN updated;
END;
$function$;