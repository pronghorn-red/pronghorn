-- Enable REPLICA IDENTITY FULL for all tables that need it
ALTER TABLE public.artifacts REPLICA IDENTITY FULL;
ALTER TABLE public.project_repos REPLICA IDENTITY FULL;
ALTER TABLE public.projects REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.project_specifications REPLICA IDENTITY FULL;

-- Add only the tables that are not already in the publication
-- Use DO block to handle already-exists errors gracefully
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_repos;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'project_repos already in publication';
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'projects already in publication';
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'chat_messages already in publication';
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_specifications;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'project_specifications already in publication';
  END;
END $$;