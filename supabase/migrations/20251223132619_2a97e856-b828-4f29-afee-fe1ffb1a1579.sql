-- Create build-book-covers storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('build-book-covers', 'build-book-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Anyone can view build book covers"
ON storage.objects FOR SELECT
USING (bucket_id = 'build-book-covers');

-- Allow admins to upload/manage build book covers
CREATE POLICY "Admins can manage build book covers"
ON storage.objects FOR ALL
USING (bucket_id = 'build-book-covers' AND is_admin_or_superadmin(auth.uid()))
WITH CHECK (bucket_id = 'build-book-covers' AND is_admin_or_superadmin(auth.uid()));

-- Alter build_book_standards to reference standards directly instead of categories
ALTER TABLE public.build_book_standards 
DROP CONSTRAINT IF EXISTS build_book_standards_standard_category_id_fkey;

ALTER TABLE public.build_book_standards
RENAME COLUMN standard_category_id TO standard_id;

ALTER TABLE public.build_book_standards
ADD CONSTRAINT build_book_standards_standard_id_fkey 
FOREIGN KEY (standard_id) REFERENCES public.standards(id) ON DELETE CASCADE;