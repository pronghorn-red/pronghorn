-- Enable realtime for repository tables
ALTER TABLE public.repo_files REPLICA IDENTITY FULL;
ALTER TABLE public.repo_staging REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.repo_files;
ALTER PUBLICATION supabase_realtime ADD TABLE public.repo_staging;