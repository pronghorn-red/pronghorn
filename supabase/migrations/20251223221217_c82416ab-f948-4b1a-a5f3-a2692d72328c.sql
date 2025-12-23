-- Add deploy_count column to build_books table
ALTER TABLE build_books ADD COLUMN deploy_count integer NOT NULL DEFAULT 0;

-- Create function to increment deploy count
CREATE OR REPLACE FUNCTION increment_build_book_deploy_count(p_build_book_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE build_books 
  SET deploy_count = deploy_count + 1 
  WHERE id = p_build_book_id;
END;
$$;