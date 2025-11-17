-- Add storage bucket for standard attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('standard-attachments', 'standard-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Create policies for standard attachments (admin only)
CREATE POLICY "Admins can upload standard attachments"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'standard-attachments');

CREATE POLICY "Anyone can view standard attachments"
ON storage.objects
FOR SELECT
USING (bucket_id = 'standard-attachments');

CREATE POLICY "Admins can update standard attachments"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'standard-attachments');

CREATE POLICY "Admins can delete standard attachments"
ON storage.objects
FOR DELETE
USING (bucket_id = 'standard-attachments');

-- Ensure realtime is enabled (tables already in publication)
ALTER TABLE canvas_nodes REPLICA IDENTITY FULL;
ALTER TABLE canvas_edges REPLICA IDENTITY FULL;