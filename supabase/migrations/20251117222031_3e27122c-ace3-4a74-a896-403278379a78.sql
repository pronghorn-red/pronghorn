-- Create requirement-sources storage bucket for source requirement documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'requirement-sources',
  'requirement-sources',
  true,
  10485760, -- 10MB
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for requirement-sources bucket
CREATE POLICY "Anyone can view requirement source files"
ON storage.objects FOR SELECT
USING (bucket_id = 'requirement-sources');

CREATE POLICY "Admins can upload requirement source files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'requirement-sources');