-- Add is_binary flag to repo_files
ALTER TABLE public.repo_files 
ADD COLUMN IF NOT EXISTS is_binary boolean NOT NULL DEFAULT false;

-- Add is_binary flag to repo_staging  
ALTER TABLE public.repo_staging
ADD COLUMN IF NOT EXISTS is_binary boolean NOT NULL DEFAULT false;