-- Create project_presentations table for storing generated presentations
CREATE TABLE public.project_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  initial_prompt text,
  mode text NOT NULL DEFAULT 'concise', -- 'concise' or 'detailed'
  target_slides integer DEFAULT 15,
  version integer NOT NULL DEFAULT 1,
  slides jsonb NOT NULL DEFAULT '[]'::jsonb, -- Array of slide objects
  blackboard jsonb NOT NULL DEFAULT '[]'::jsonb, -- Array of blackboard entries (insights accumulated)
  cover_image_url text,
  metadata jsonb DEFAULT '{}'::jsonb, -- Stats, completion estimates, etc.
  status text NOT NULL DEFAULT 'draft', -- 'draft', 'generating', 'completed', 'error'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.project_presentations ENABLE ROW LEVEL SECURITY;

-- Create RLS policy following existing project pattern
CREATE POLICY "Users can access project presentations" 
ON public.project_presentations 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM projects p
  WHERE p.id = project_presentations.project_id 
  AND (
    p.created_by = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM project_tokens pt
      WHERE pt.project_id = p.id 
      AND pt.token = (current_setting('app.share_token'::text, true))::uuid
      AND (pt.expires_at IS NULL OR pt.expires_at > now())
    )
  )
));

-- Create index for faster lookups
CREATE INDEX idx_project_presentations_project_id ON public.project_presentations(project_id);
CREATE INDEX idx_project_presentations_status ON public.project_presentations(status);

-- Create updated_at trigger
CREATE TRIGGER update_project_presentations_updated_at
  BEFORE UPDATE ON public.project_presentations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: Get presentations with token
CREATE OR REPLACE FUNCTION public.get_project_presentations_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS SETOF public.project_presentations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.set_share_token(p_token);
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  
  RETURN QUERY
  SELECT * FROM public.project_presentations
  WHERE project_id = p_project_id
  ORDER BY created_at DESC;
END;
$$;

-- RPC: Insert presentation with token
CREATE OR REPLACE FUNCTION public.insert_presentation_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL,
  p_name text DEFAULT 'New Presentation',
  p_initial_prompt text DEFAULT NULL,
  p_mode text DEFAULT 'concise',
  p_target_slides integer DEFAULT 15
)
RETURNS public.project_presentations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result public.project_presentations;
BEGIN
  PERFORM public.set_share_token(p_token);
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  
  INSERT INTO public.project_presentations (
    project_id, name, initial_prompt, mode, target_slides, status
  ) VALUES (
    p_project_id, p_name, p_initial_prompt, p_mode, p_target_slides, 'draft'
  )
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$$;

-- RPC: Update presentation with token (for slides, blackboard, status updates)
CREATE OR REPLACE FUNCTION public.update_presentation_with_token(
  p_presentation_id uuid,
  p_token uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_slides jsonb DEFAULT NULL,
  p_blackboard jsonb DEFAULT NULL,
  p_cover_image_url text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS public.project_presentations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
  v_result public.project_presentations;
BEGIN
  -- Get project_id from presentation
  SELECT project_id INTO v_project_id 
  FROM public.project_presentations 
  WHERE id = p_presentation_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Presentation not found';
  END IF;
  
  PERFORM public.set_share_token(p_token);
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  UPDATE public.project_presentations
  SET
    name = COALESCE(p_name, name),
    slides = COALESCE(p_slides, slides),
    blackboard = COALESCE(p_blackboard, blackboard),
    cover_image_url = COALESCE(p_cover_image_url, cover_image_url),
    metadata = COALESCE(p_metadata, metadata),
    status = COALESCE(p_status, status),
    updated_at = now()
  WHERE id = p_presentation_id
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$$;

-- RPC: Append to blackboard (for streaming updates)
CREATE OR REPLACE FUNCTION public.append_presentation_blackboard_with_token(
  p_presentation_id uuid,
  p_token uuid DEFAULT NULL,
  p_entry jsonb DEFAULT NULL
)
RETURNS public.project_presentations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
  v_result public.project_presentations;
BEGIN
  -- Get project_id from presentation
  SELECT project_id INTO v_project_id 
  FROM public.project_presentations 
  WHERE id = p_presentation_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Presentation not found';
  END IF;
  
  PERFORM public.set_share_token(p_token);
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  UPDATE public.project_presentations
  SET
    blackboard = blackboard || p_entry,
    updated_at = now()
  WHERE id = p_presentation_id
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$$;

-- RPC: Delete presentation with token
CREATE OR REPLACE FUNCTION public.delete_presentation_with_token(
  p_presentation_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from presentation
  SELECT project_id INTO v_project_id 
  FROM public.project_presentations 
  WHERE id = p_presentation_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Presentation not found';
  END IF;
  
  PERFORM public.set_share_token(p_token);
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  DELETE FROM public.project_presentations WHERE id = p_presentation_id;
END;
$$;

-- Enable realtime for presentations
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_presentations;