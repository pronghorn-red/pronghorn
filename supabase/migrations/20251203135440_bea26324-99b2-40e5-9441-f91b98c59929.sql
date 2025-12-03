-- Drop the old function overload without p_is_binary parameter
-- This resolves the PGRST203 "Could not choose the best candidate function" error
-- The remaining function has p_is_binary DEFAULT false, so existing callers work unchanged

DROP FUNCTION IF EXISTS public.stage_file_change_with_token(
  uuid,   -- p_repo_id
  uuid,   -- p_token
  text,   -- p_operation_type
  text,   -- p_file_path
  text,   -- p_old_content
  text,   -- p_new_content
  text    -- p_old_path
);