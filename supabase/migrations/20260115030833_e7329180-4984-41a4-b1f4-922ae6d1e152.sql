-- Drop the existing function to avoid overload conflicts
DROP FUNCTION IF EXISTS public.get_agent_operations_by_project_with_token(uuid, uuid, integer, integer);

-- Create the updated function with p_agent_type parameter
CREATE OR REPLACE FUNCTION public.get_agent_operations_by_project_with_token(
  p_project_id uuid,
  p_token uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_agent_type text DEFAULT 'coding'
)
RETURNS TABLE(
  id uuid,
  session_id uuid,
  operation_type text,
  file_path text,
  status text,
  details jsonb,
  error_message text,
  created_at timestamp with time zone,
  completed_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- SECURITY: Validate project access first
  PERFORM public.validate_project_access(p_project_id, p_token);

  RETURN QUERY
  SELECT afo.id, afo.session_id, afo.operation_type, afo.file_path, afo.status, 
         afo.details, afo.error_message, afo.created_at, afo.completed_at
  FROM public.agent_file_operations afo
  INNER JOIN public.agent_sessions ags ON ags.id = afo.session_id
  WHERE ags.project_id = p_project_id
    AND ags.agent_type = p_agent_type
  ORDER BY afo.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;