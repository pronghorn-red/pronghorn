-- Drop the older version that requires p_database_id
DROP FUNCTION IF EXISTS public.insert_saved_query_with_token(uuid, text, text, uuid, text);