-- RPC functions for project_standards, project_tech_stacks, and requirement_standards with share token support

-- 1) PROJECT_STANDARDS: Select with token
CREATE OR REPLACE FUNCTION public.get_project_standards_with_token(
  p_project_id uuid,
  p_token uuid
)
RETURNS SETOF public.project_standards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.set_share_token(p_token::text);

  RETURN QUERY
    SELECT *
    FROM public.project_standards
    WHERE project_id = p_project_id;
END;
$$;

-- 2) PROJECT_STANDARDS: Insert with token
CREATE OR REPLACE FUNCTION public.insert_project_standard_with_token(
  p_project_id uuid,
  p_token uuid,
  p_standard_id uuid
)
RETURNS public.project_standards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.project_standards;
BEGIN
  PERFORM public.set_share_token(p_token::text);

  INSERT INTO public.project_standards (project_id, standard_id)
  VALUES (p_project_id, p_standard_id)
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- 3) PROJECT_STANDARDS: Delete with token
CREATE OR REPLACE FUNCTION public.delete_project_standard_with_token(
  p_id uuid,
  p_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.set_share_token(p_token::text);

  DELETE FROM public.project_standards
  WHERE id = p_id;
END;
$$;

-- 4) PROJECT_TECH_STACKS: Select with token
CREATE OR REPLACE FUNCTION public.get_project_tech_stacks_with_token(
  p_project_id uuid,
  p_token uuid
)
RETURNS SETOF public.project_tech_stacks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.set_share_token(p_token::text);

  RETURN QUERY
    SELECT *
    FROM public.project_tech_stacks
    WHERE project_id = p_project_id;
END;
$$;

-- 5) PROJECT_TECH_STACKS: Insert with token
CREATE OR REPLACE FUNCTION public.insert_project_tech_stack_with_token(
  p_project_id uuid,
  p_token uuid,
  p_tech_stack_id uuid
)
RETURNS public.project_tech_stacks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.project_tech_stacks;
BEGIN
  PERFORM public.set_share_token(p_token::text);

  INSERT INTO public.project_tech_stacks (project_id, tech_stack_id)
  VALUES (p_project_id, p_tech_stack_id)
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- 6) PROJECT_TECH_STACKS: Delete with token
CREATE OR REPLACE FUNCTION public.delete_project_tech_stack_with_token(
  p_id uuid,
  p_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.set_share_token(p_token::text);

  DELETE FROM public.project_tech_stacks
  WHERE id = p_id;
END;
$$;

-- 7) REQUIREMENT_STANDARDS: Select with token (by requirement_id)
CREATE OR REPLACE FUNCTION public.get_requirement_standards_with_token(
  p_requirement_id uuid,
  p_token uuid
)
RETURNS SETOF public.requirement_standards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.set_share_token(p_token::text);

  RETURN QUERY
    SELECT *
    FROM public.requirement_standards
    WHERE requirement_id = p_requirement_id;
END;
$$;

-- 8) REQUIREMENT_STANDARDS: Insert with token
CREATE OR REPLACE FUNCTION public.insert_requirement_standard_with_token(
  p_requirement_id uuid,
  p_token uuid,
  p_standard_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS public.requirement_standards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.requirement_standards;
BEGIN
  PERFORM public.set_share_token(p_token::text);

  INSERT INTO public.requirement_standards (requirement_id, standard_id, notes)
  VALUES (p_requirement_id, p_standard_id, p_notes)
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- 9) REQUIREMENT_STANDARDS: Update with token (for notes field)
CREATE OR REPLACE FUNCTION public.update_requirement_standard_with_token(
  p_id uuid,
  p_token uuid,
  p_notes text
)
RETURNS public.requirement_standards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.requirement_standards;
BEGIN
  PERFORM public.set_share_token(p_token::text);

  UPDATE public.requirement_standards
  SET notes = p_notes
  WHERE id = p_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- 10) REQUIREMENT_STANDARDS: Delete with token
CREATE OR REPLACE FUNCTION public.delete_requirement_standard_with_token(
  p_id uuid,
  p_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.set_share_token(p_token::text);

  DELETE FROM public.requirement_standards
  WHERE id = p_id;
END;
$$;