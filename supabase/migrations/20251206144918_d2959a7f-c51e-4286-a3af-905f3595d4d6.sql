-- Phase 5: Final cleanup - Drop any remaining orphaned agent_ prefixed functions
-- These were recreated in intermediate migrations but should now be removed

-- Drop any remaining agent_ prefixed functions that weren't caught earlier
DROP FUNCTION IF EXISTS public.agent_read_file_with_token(uuid, uuid);
DROP FUNCTION IF EXISTS public.agent_list_files_by_path_with_token(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.agent_get_artifacts_with_token(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.agent_search_files_with_token(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.agent_wildcard_search_with_token(uuid, uuid, text[]);
DROP FUNCTION IF EXISTS public.agent_read_multiple_files_with_token(uuid[], uuid);
DROP FUNCTION IF EXISTS public.agent_get_canvas_summary_with_token(uuid, uuid);
DROP FUNCTION IF EXISTS public.agent_get_project_metadata_with_token(uuid, uuid);
DROP FUNCTION IF EXISTS public.agent_get_tech_stacks_with_token(uuid, uuid);
DROP FUNCTION IF EXISTS public.agent_search_requirements_with_token(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.agent_search_standards_with_token(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.agent_create_file_with_token(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.agent_edit_lines_with_token(uuid, text, integer, integer, text, uuid);
DROP FUNCTION IF EXISTS public.agent_delete_file_with_token(uuid, text, uuid);

-- Also drop the old message functions if they still exist
DROP FUNCTION IF EXISTS public.get_agent_messages_by_project_with_token(uuid, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.get_agent_messages_for_chat_history_with_token(uuid, uuid, integer, timestamptz);