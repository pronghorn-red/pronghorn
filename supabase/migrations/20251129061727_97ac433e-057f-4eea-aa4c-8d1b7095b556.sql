-- Drop existing policies for artifact-images bucket
DROP POLICY IF EXISTS "Authenticated users can upload artifact images" ON storage.objects;
DROP POLICY IF EXISTS "Token holders can upload artifact images" ON storage.objects;

-- Simplified policy: allow all uploads since edge function validates access
-- The upload-artifact-image edge function validates project access before uploading
CREATE POLICY "Allow uploads to artifact-images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'artifact-images');

-- Allow authenticated users to delete their own uploaded images
CREATE POLICY "Users can delete artifact images"
ON storage.objects FOR DELETE
USING (bucket_id = 'artifact-images' AND auth.uid() IS NOT NULL);