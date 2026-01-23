-- Add is_published column to artifacts table
ALTER TABLE public.artifacts 
ADD COLUMN is_published boolean NOT NULL DEFAULT false;

-- Create index for efficient lookup of published artifacts
CREATE INDEX idx_artifacts_published ON public.artifacts(id) WHERE is_published = true;

-- Add comment for documentation
COMMENT ON COLUMN public.artifacts.is_published IS 'When true, artifact is publicly accessible at /viewer/{id}';

-- Create public RPC to fetch a published artifact (no authentication required)
CREATE OR REPLACE FUNCTION public.get_published_artifact(p_artifact_id uuid)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  content text,
  ai_title text,
  ai_summary text,
  source_type text,
  image_url text,
  is_folder boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id, a.project_id, a.content, a.ai_title, a.ai_summary,
    a.source_type, a.image_url, a.is_folder, a.created_at, a.updated_at
  FROM public.artifacts a
  WHERE a.id = p_artifact_id AND a.is_published = true AND a.is_folder = false;
END;
$$;

-- Create RPC to update artifact published status (requires editor role)
CREATE OR REPLACE FUNCTION public.update_artifact_published_with_token(
  p_id uuid,
  p_token uuid,
  p_is_published boolean
)
RETURNS public.artifacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
  result public.artifacts;
BEGIN
  -- Get project ID from artifact
  SELECT project_id INTO v_project_id FROM public.artifacts WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Artifact not found'; END IF;

  -- Validate editor access
  PERFORM public.require_role(v_project_id, p_token, 'editor');

  -- Update published status
  UPDATE public.artifacts
  SET is_published = p_is_published, updated_at = now()
  WHERE id = p_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;