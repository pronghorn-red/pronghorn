-- Drop the 3-param version (redundant since 4-param version has p_notes DEFAULT NULL)
DROP FUNCTION IF EXISTS public.insert_requirement_standard_with_token(uuid, uuid, uuid);