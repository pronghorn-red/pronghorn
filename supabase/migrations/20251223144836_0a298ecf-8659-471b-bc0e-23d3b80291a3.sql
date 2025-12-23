-- Add prompt column for custom AI agent prompt
ALTER TABLE public.build_books
ADD COLUMN prompt text DEFAULT NULL;

COMMENT ON COLUMN public.build_books.prompt IS 'Custom AI agent prompt for the Build Book assistant';