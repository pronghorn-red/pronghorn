-- Fix get_audit_tesseract_cells_with_token to use TEXT for p_x_element_id
CREATE OR REPLACE FUNCTION public.get_audit_tesseract_cells_with_token(
  p_session_id UUID,
  p_token UUID DEFAULT NULL,
  p_x_element_id TEXT DEFAULT NULL,
  p_y_step_min INTEGER DEFAULT NULL,
  p_y_step_max INTEGER DEFAULT NULL,
  p_polarity_min DOUBLE PRECISION DEFAULT NULL,
  p_polarity_max DOUBLE PRECISION DEFAULT NULL,
  p_limit INTEGER DEFAULT 1000
)
RETURNS SETOF public.audit_tesseract_cells
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id UUID;
BEGIN
  v_project_id := public.get_project_id_from_audit_session(p_session_id);
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Audit session not found';
  END IF;
  
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  
  RETURN QUERY
  SELECT * FROM public.audit_tesseract_cells
  WHERE session_id = p_session_id
  AND (p_x_element_id IS NULL OR x_element_id = p_x_element_id)
  AND (p_y_step_min IS NULL OR y_step >= p_y_step_min)
  AND (p_y_step_max IS NULL OR y_step <= p_y_step_max)
  AND (p_polarity_min IS NULL OR z_polarity >= p_polarity_min)
  AND (p_polarity_max IS NULL OR z_polarity <= p_polarity_max)
  ORDER BY x_index, y_step
  LIMIT p_limit;
END;
$function$;