-- Drop the older version of insert_migration_with_token that requires p_database_id
-- Keep the newer version that supports both p_database_id OR p_connection_id
DROP FUNCTION IF EXISTS public.insert_migration_with_token(uuid, text, text, text, uuid, text, text, text);