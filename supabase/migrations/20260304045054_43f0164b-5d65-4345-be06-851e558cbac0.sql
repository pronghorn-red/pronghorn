-- Increase statement timeout for commit and stage functions that handle large repos
ALTER FUNCTION public.commit_staged_with_token SET statement_timeout = '120s';
ALTER FUNCTION public.stage_file_change_with_token SET statement_timeout = '60s';
ALTER FUNCTION public.unstage_file_with_token SET statement_timeout = '60s';
ALTER FUNCTION public.unstage_files_with_token SET statement_timeout = '60s';
ALTER FUNCTION public.discard_staged_with_token SET statement_timeout = '60s';