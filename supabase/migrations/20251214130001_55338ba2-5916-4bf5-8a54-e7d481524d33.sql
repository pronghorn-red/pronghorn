-- Drop the old 3-parameter version that's causing ambiguity
DROP FUNCTION IF EXISTS public.get_repo_files_with_token(uuid, uuid, text);