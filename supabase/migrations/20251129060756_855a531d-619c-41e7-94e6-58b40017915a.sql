-- Add image_url field to artifacts table
ALTER TABLE public.artifacts 
ADD COLUMN image_url text;

-- Create storage bucket for artifact images
INSERT INTO storage.buckets (id, name, public)
VALUES ('artifact-images', 'artifact-images', true);

-- RLS policies for artifact-images bucket
CREATE POLICY "Anyone can view artifact images"
ON storage.objects FOR SELECT
USING (bucket_id = 'artifact-images');

CREATE POLICY "Authenticated users can upload artifact images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'artifact-images' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Token holders can upload artifact images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'artifact-images'
  AND (current_setting('app.share_token'::text, true))::uuid IS NOT NULL
);

-- Update insert_artifact_with_token to accept image_url
CREATE OR REPLACE FUNCTION public.insert_artifact_with_token(
  p_project_id uuid,
  p_token uuid,
  p_content text,
  p_source_type text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL,
  p_image_url text DEFAULT NULL
)
RETURNS artifacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_artifact public.artifacts;
BEGIN
  -- Validate access first
  PERFORM public.validate_project_access(p_project_id, p_token);

  INSERT INTO public.artifacts (project_id, content, source_type, source_id, created_by, image_url)
  VALUES (p_project_id, p_content, p_source_type, p_source_id, auth.uid(), p_image_url)
  RETURNING * INTO new_artifact;

  RETURN new_artifact;
END;
$function$;

-- Update update_artifact_with_token to accept image_url
CREATE OR REPLACE FUNCTION public.update_artifact_with_token(
  p_id uuid,
  p_token uuid,
  p_content text DEFAULT NULL,
  p_ai_title text DEFAULT NULL,
  p_ai_summary text DEFAULT NULL,
  p_image_url text DEFAULT NULL
)
RETURNS artifacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  updated public.artifacts;
BEGIN
  -- Get project_id from artifact
  SELECT project_id INTO v_project_id
  FROM public.artifacts
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artifact not found' USING ERRCODE = 'P0001';
  END IF;

  -- Validate access
  PERFORM public.validate_project_access(v_project_id, p_token);

  UPDATE public.artifacts
  SET
    content = COALESCE(p_content, content),
    ai_title = COALESCE(p_ai_title, ai_title),
    ai_summary = COALESCE(p_ai_summary, ai_summary),
    image_url = COALESCE(p_image_url, image_url),
    updated_at = now()
  WHERE id = p_id
  RETURNING * INTO updated;

  RETURN updated;
END;
$function$;