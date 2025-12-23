-- Add version column to tech_stacks for package.json compatibility
ALTER TABLE public.tech_stacks ADD COLUMN IF NOT EXISTS version text;

-- Add version_constraint column for specifying version requirements (e.g., ">=", "^", "~")
ALTER TABLE public.tech_stacks ADD COLUMN IF NOT EXISTS version_constraint text DEFAULT '^';

COMMENT ON COLUMN public.tech_stacks.version IS 'Specific version number (e.g., 3.4.0)';
COMMENT ON COLUMN public.tech_stacks.version_constraint IS 'Version constraint prefix (e.g., ^, ~, >=, latest)';