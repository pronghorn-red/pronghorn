-- Drop the duplicate insert_project_with_token function with text p_status parameter
-- Keep only the version with proper project_status enum type

DROP FUNCTION IF EXISTS public.insert_project_with_token(
  p_name text,
  p_org_id uuid,
  p_description text,
  p_organization text,
  p_budget numeric,
  p_scope text,
  p_status text
);