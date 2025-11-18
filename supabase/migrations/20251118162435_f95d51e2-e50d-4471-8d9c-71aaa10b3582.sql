-- Helper functions to work with projects using share tokens in a single database transaction

-- Fetch a project by id using a share token (for anonymous access)
CREATE OR REPLACE FUNCTION public.get_project_with_token(
  p_project_id uuid,
  p_token uuid
) RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.projects;
BEGIN
  -- Set the share token for this session so existing RLS policies can use it
  PERFORM public.set_share_token(p_token::text);

  SELECT *
  INTO result
  FROM public.projects
  WHERE id = p_project_id;

  RETURN result;
END;
$$;

-- Update basic project details using a share token (for anonymous collaborators)
CREATE OR REPLACE FUNCTION public.update_project_with_token(
  p_project_id uuid,
  p_token uuid,
  p_name text,
  p_description text,
  p_github_repo text
) RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.projects;
BEGIN
  -- Set the share token for this session so existing RLS policies can use it
  PERFORM public.set_share_token(p_token::text);

  UPDATE public.projects
  SET
    name = p_name,
    description = p_description,
    github_repo = p_github_repo,
    updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;