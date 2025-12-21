-- Add missing tables to realtime publication for postgres_changes fallback
ALTER TABLE public.chat_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.project_databases REPLICA IDENTITY FULL;
ALTER TABLE public.project_deployments REPLICA IDENTITY FULL;

-- Add tables to supabase_realtime publication (ignore if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_sessions;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'project_databases'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_databases;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'project_deployments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_deployments;
  END IF;
END $$;