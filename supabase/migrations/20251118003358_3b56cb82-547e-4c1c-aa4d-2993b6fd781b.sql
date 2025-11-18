-- Update RLS policies for requirement-sources bucket to allow updates
-- First, check if policies exist and drop them if needed
DROP POLICY IF EXISTS "Public can view requirement sources" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload requirement sources" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update requirement sources" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete requirement sources" ON storage.objects;

-- Create comprehensive policies for requirement-sources bucket
CREATE POLICY "Public can view requirement sources"
ON storage.objects
FOR SELECT
USING (bucket_id = 'requirement-sources');

CREATE POLICY "Anyone can upload requirement sources"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'requirement-sources');

CREATE POLICY "Anyone can update requirement sources"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'requirement-sources');

CREATE POLICY "Anyone can delete requirement sources"
ON storage.objects
FOR DELETE
USING (bucket_id = 'requirement-sources');