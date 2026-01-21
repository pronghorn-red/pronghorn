-- Add status and notes columns to requirements table
ALTER TABLE public.requirements 
ADD COLUMN IF NOT EXISTS status text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL;

-- Add check constraint for valid status values
ALTER TABLE public.requirements
ADD CONSTRAINT requirements_status_check 
CHECK (status IS NULL OR status IN ('pending', 'in_progress', 'under_review', 'partially_completed', 'completed', 'cancelled'));

-- Add comments for documentation
COMMENT ON COLUMN public.requirements.status IS 'Workflow status: pending (null/default), in_progress, under_review, partially_completed, completed, cancelled';
COMMENT ON COLUMN public.requirements.notes IS 'Free-form notes for tracking progress, blockers, or decisions';

-- Drop existing function and recreate with new parameters
DROP FUNCTION IF EXISTS public.update_requirement_with_token(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.update_requirement_with_token(
  p_id uuid, 
  p_token uuid, 
  p_title text, 
  p_content text,
  p_status text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS requirements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  updated public.requirements;
BEGIN
  SELECT project_id INTO v_project_id FROM public.requirements WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Requirement not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  UPDATE public.requirements 
  SET 
    title = COALESCE(p_title, title), 
    content = p_content, 
    status = p_status,
    notes = p_notes,
    updated_at = now() 
  WHERE id = p_id 
  RETURNING * INTO updated;
  
  RETURN updated;
END;
$function$;