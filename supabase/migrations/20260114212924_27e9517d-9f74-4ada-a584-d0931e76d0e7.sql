-- Drop the OLD 6-parameter version that doesn't support p_agent_type filtering
-- This keeps only the enhanced 7-parameter version

DROP FUNCTION IF EXISTS public.get_agent_messages_with_token(
  uuid, uuid, uuid, integer, integer, timestamp with time zone
);