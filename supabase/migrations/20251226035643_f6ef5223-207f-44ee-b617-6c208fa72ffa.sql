-- Drop the existing function with old signature
DROP FUNCTION IF EXISTS public.insert_audit_activity_with_token(uuid,uuid,text,text,text,text,jsonb);

-- Recreate with correct return type
CREATE OR REPLACE FUNCTION public.insert_audit_activity_with_token(
  p_session_id uuid,
  p_token uuid,
  p_agent_role text,
  p_activity_type text,
  p_title text,
  p_content text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS audit_activity_stream
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
  result public.audit_activity_stream;
BEGIN
  SELECT project_id INTO v_project_id
  FROM public.audit_sessions WHERE id = p_session_id;
  
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  
  INSERT INTO public.audit_activity_stream (
    session_id, agent_role, activity_type, title, content, metadata
  ) VALUES (
    p_session_id, p_agent_role, p_activity_type, p_title, p_content, p_metadata
  )
  RETURNING * INTO result;
  
  RETURN result;
END;
$$;

-- Add unique constraint for tesseract cell upsert if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'audit_tesseract_cells_session_element_step_key'
  ) THEN
    ALTER TABLE public.audit_tesseract_cells 
    ADD CONSTRAINT audit_tesseract_cells_session_element_step_key 
    UNIQUE (session_id, x_element_id, y_step);
  END IF;
END $$;