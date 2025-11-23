-- Add LLM configuration update RPC function
CREATE OR REPLACE FUNCTION public.update_project_llm_settings_with_token(
  p_project_id uuid,
  p_token uuid,
  p_selected_model text,
  p_max_tokens integer,
  p_thinking_enabled boolean,
  p_thinking_budget integer
)
RETURNS projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.projects;
BEGIN
  -- Validate access first
  PERFORM public.validate_project_access(p_project_id, p_token);

  UPDATE public.projects
  SET
    selected_model = p_selected_model,
    max_tokens = p_max_tokens,
    thinking_enabled = p_thinking_enabled,
    thinking_budget = p_thinking_budget,
    updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO result;

  RETURN result;
END;
$function$;