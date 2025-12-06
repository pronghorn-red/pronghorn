-- Phase 4: Replace legacy validate_* functions with thin wrappers
-- This maintains backwards compatibility while consolidating authorization

-- ============================================
-- STEP 1: Replace validate_project_access with wrapper
-- Now calls authorize_project_access and returns boolean
-- ============================================
CREATE OR REPLACE FUNCTION public.validate_project_access(
  p_project_id uuid,
  p_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Call the new authorization function (will raise on failure)
  PERFORM public.authorize_project_access(p_project_id, p_token);
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$function$;

-- ============================================
-- STEP 2: Replace validate_repo_access with wrapper
-- ============================================
CREATE OR REPLACE FUNCTION public.validate_repo_access(
  p_repo_id uuid,
  p_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  v_project_id := public.get_project_id_from_repo(p_repo_id);
  PERFORM public.authorize_project_access(v_project_id, p_token);
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$function$;

-- ============================================
-- STEP 3: Replace validate_session_access with wrapper
-- ============================================
CREATE OR REPLACE FUNCTION public.validate_session_access(
  p_session_id uuid,
  p_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  v_project_id := public.get_project_id_from_session(p_session_id);
  PERFORM public.authorize_project_access(v_project_id, p_token);
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$function$;

-- ============================================
-- STEP 4: Replace validate_file_access with wrapper
-- ============================================
CREATE OR REPLACE FUNCTION public.validate_file_access(
  p_file_id uuid,
  p_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  v_project_id := public.get_project_id_from_file(p_file_id);
  PERFORM public.authorize_project_access(v_project_id, p_token);
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$function$;

-- ============================================
-- STEP 5: Keep set_share_token for RLS policy compatibility
-- but make it a no-op since we no longer use session variables
-- ============================================
CREATE OR REPLACE FUNCTION public.set_share_token(token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- No-op: Token validation now happens via authorize_project_access
  -- This function is kept for backwards compatibility with RLS policies
  -- that still reference current_setting('app.share_token')
  PERFORM set_config('app.share_token', COALESCE(token, ''), false);
END;
$function$;

-- ============================================
-- STEP 6: Update remaining RPC functions to use new pattern
-- These were missed in Phase 3
-- ============================================

-- get_requirements_with_token
CREATE OR REPLACE FUNCTION public.get_requirements_with_token(p_project_id uuid, p_token uuid)
RETURNS SETOF requirements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  RETURN QUERY SELECT * FROM public.requirements WHERE project_id = p_project_id ORDER BY order_index ASC;
END;
$function$;

-- insert_requirement_with_token
CREATE OR REPLACE FUNCTION public.insert_requirement_with_token(p_project_id uuid, p_token uuid, p_parent_id uuid, p_type requirement_type, p_title text)
RETURNS requirements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_req public.requirements;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  INSERT INTO public.requirements (project_id, parent_id, type, title)
  VALUES (p_project_id, p_parent_id, p_type, p_title)
  RETURNING * INTO new_req;
  RETURN new_req;
END;
$function$;

-- update_requirement_with_token
CREATE OR REPLACE FUNCTION public.update_requirement_with_token(p_id uuid, p_token uuid, p_title text, p_content text)
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
  UPDATE public.requirements SET title = COALESCE(p_title, title), content = p_content, updated_at = now() WHERE id = p_id RETURNING * INTO updated;
  RETURN updated;
END;
$function$;

-- delete_requirement_with_token
CREATE OR REPLACE FUNCTION public.delete_requirement_with_token(p_id uuid, p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM public.requirements WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Requirement not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  DELETE FROM public.requirements WHERE id = p_id;
END;
$function$;

-- get_artifacts_with_token
CREATE OR REPLACE FUNCTION public.get_artifacts_with_token(p_project_id uuid, p_token uuid)
RETURNS SETOF artifacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  RETURN QUERY SELECT * FROM public.artifacts WHERE project_id = p_project_id ORDER BY created_at DESC;
END;
$function$;

-- insert_artifact_with_token
CREATE OR REPLACE FUNCTION public.insert_artifact_with_token(p_project_id uuid, p_token uuid, p_content text, p_source_type text DEFAULT NULL, p_source_id uuid DEFAULT NULL, p_image_url text DEFAULT NULL)
RETURNS artifacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_artifact public.artifacts;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  INSERT INTO public.artifacts (project_id, content, source_type, source_id, created_by, image_url)
  VALUES (p_project_id, p_content, p_source_type, p_source_id, auth.uid(), p_image_url)
  RETURNING * INTO new_artifact;
  RETURN new_artifact;
END;
$function$;

-- update_artifact_with_token
CREATE OR REPLACE FUNCTION public.update_artifact_with_token(p_id uuid, p_token uuid, p_content text DEFAULT NULL, p_ai_title text DEFAULT NULL, p_ai_summary text DEFAULT NULL, p_image_url text DEFAULT NULL)
RETURNS artifacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  updated public.artifacts;
BEGIN
  SELECT project_id INTO v_project_id FROM public.artifacts WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Artifact not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  UPDATE public.artifacts SET content = COALESCE(p_content, content), ai_title = COALESCE(p_ai_title, ai_title), ai_summary = COALESCE(p_ai_summary, ai_summary), image_url = COALESCE(p_image_url, image_url), updated_at = now() WHERE id = p_id RETURNING * INTO updated;
  RETURN updated;
END;
$function$;

-- delete_artifact_with_token
CREATE OR REPLACE FUNCTION public.delete_artifact_with_token(p_id uuid, p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM public.artifacts WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Artifact not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  DELETE FROM public.artifacts WHERE id = p_id;
END;
$function$;

-- get_canvas_nodes_with_token
CREATE OR REPLACE FUNCTION public.get_canvas_nodes_with_token(p_project_id uuid, p_token uuid)
RETURNS SETOF canvas_nodes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  RETURN QUERY SELECT * FROM public.canvas_nodes WHERE project_id = p_project_id;
END;
$function$;

-- get_canvas_edges_with_token
CREATE OR REPLACE FUNCTION public.get_canvas_edges_with_token(p_project_id uuid, p_token uuid)
RETURNS SETOF canvas_edges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  RETURN QUERY SELECT * FROM public.canvas_edges WHERE project_id = p_project_id;
END;
$function$;

-- get_canvas_layers_with_token
CREATE OR REPLACE FUNCTION public.get_canvas_layers_with_token(p_project_id uuid, p_token uuid DEFAULT NULL)
RETURNS SETOF canvas_layers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  RETURN QUERY SELECT * FROM public.canvas_layers WHERE project_id = p_project_id ORDER BY created_at ASC;
END;
$function$;

-- upsert_canvas_node_with_token
CREATE OR REPLACE FUNCTION public.upsert_canvas_node_with_token(p_id uuid, p_project_id uuid, p_token uuid, p_type node_type, p_position jsonb, p_data jsonb)
RETURNS canvas_nodes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.canvas_nodes;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  INSERT INTO public.canvas_nodes (id, project_id, type, position, data)
  VALUES (p_id, p_project_id, p_type, p_position, p_data)
  ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, position = EXCLUDED.position, data = EXCLUDED.data, updated_at = now()
  RETURNING * INTO result;
  RETURN result;
END;
$function$;

-- upsert_canvas_edge_with_token
CREATE OR REPLACE FUNCTION public.upsert_canvas_edge_with_token(p_id uuid, p_project_id uuid, p_token uuid, p_source_id uuid, p_target_id uuid, p_label text, p_edge_type text DEFAULT 'default', p_style jsonb DEFAULT '{}'::jsonb)
RETURNS canvas_edges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.canvas_edges;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  INSERT INTO public.canvas_edges (id, project_id, source_id, target_id, label, edge_type, style)
  VALUES (p_id, p_project_id, p_source_id, p_target_id, p_label, p_edge_type, p_style)
  ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, target_id = EXCLUDED.target_id, label = EXCLUDED.label, edge_type = EXCLUDED.edge_type, style = EXCLUDED.style
  RETURNING * INTO result;
  RETURN result;
END;
$function$;

-- upsert_canvas_layer_with_token
CREATE OR REPLACE FUNCTION public.upsert_canvas_layer_with_token(p_id uuid, p_project_id uuid, p_token uuid DEFAULT NULL, p_name text DEFAULT 'Untitled Layer', p_node_ids text[] DEFAULT '{}', p_visible boolean DEFAULT true)
RETURNS canvas_layers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.canvas_layers;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  INSERT INTO public.canvas_layers (id, project_id, name, node_ids, visible)
  VALUES (p_id, p_project_id, p_name, p_node_ids, p_visible)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, node_ids = EXCLUDED.node_ids, visible = EXCLUDED.visible, updated_at = now()
  RETURNING * INTO result;
  RETURN result;
END;
$function$;

-- delete_canvas_node_with_token
CREATE OR REPLACE FUNCTION public.delete_canvas_node_with_token(p_id uuid, p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM public.canvas_nodes WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Canvas node not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  DELETE FROM public.canvas_nodes WHERE id = p_id;
END;
$function$;

-- delete_canvas_edge_with_token
CREATE OR REPLACE FUNCTION public.delete_canvas_edge_with_token(p_id uuid, p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM public.canvas_edges WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Canvas edge not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  DELETE FROM public.canvas_edges WHERE id = p_id;
END;
$function$;

-- delete_canvas_layer_with_token
CREATE OR REPLACE FUNCTION public.delete_canvas_layer_with_token(p_id uuid, p_token uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM public.canvas_layers WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Canvas layer not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  DELETE FROM public.canvas_layers WHERE id = p_id;
END;
$function$;

-- get_chat_sessions_with_token
CREATE OR REPLACE FUNCTION public.get_chat_sessions_with_token(p_project_id uuid, p_token uuid)
RETURNS SETOF chat_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  RETURN QUERY SELECT * FROM public.chat_sessions WHERE project_id = p_project_id ORDER BY updated_at DESC;
END;
$function$;

-- insert_chat_session_with_token
CREATE OR REPLACE FUNCTION public.insert_chat_session_with_token(p_project_id uuid, p_token uuid, p_title text DEFAULT 'New Chat')
RETURNS chat_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_session public.chat_sessions;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  INSERT INTO public.chat_sessions (project_id, title, created_by) VALUES (p_project_id, p_title, auth.uid()) RETURNING * INTO new_session;
  RETURN new_session;
END;
$function$;

-- update_chat_session_with_token
CREATE OR REPLACE FUNCTION public.update_chat_session_with_token(p_id uuid, p_token uuid, p_title text DEFAULT NULL, p_ai_title text DEFAULT NULL, p_ai_summary text DEFAULT NULL)
RETURNS chat_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  updated public.chat_sessions;
BEGIN
  SELECT project_id INTO v_project_id FROM public.chat_sessions WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chat session not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  UPDATE public.chat_sessions SET title = COALESCE(p_title, title), ai_title = COALESCE(p_ai_title, ai_title), ai_summary = COALESCE(p_ai_summary, ai_summary), updated_at = now() WHERE id = p_id RETURNING * INTO updated;
  RETURN updated;
END;
$function$;

-- delete_chat_session_with_token
CREATE OR REPLACE FUNCTION public.delete_chat_session_with_token(p_id uuid, p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM public.chat_sessions WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chat session not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  DELETE FROM public.chat_sessions WHERE id = p_id;
END;
$function$;

-- get_chat_messages_with_token
CREATE OR REPLACE FUNCTION public.get_chat_messages_with_token(p_chat_session_id uuid, p_token uuid)
RETURNS SETOF chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM public.chat_sessions WHERE id = p_chat_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chat session not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'viewer');
  RETURN QUERY SELECT * FROM public.chat_messages WHERE chat_session_id = p_chat_session_id ORDER BY created_at ASC;
END;
$function$;

-- insert_chat_message_with_token
CREATE OR REPLACE FUNCTION public.insert_chat_message_with_token(p_chat_session_id uuid, p_token uuid, p_role text, p_content text)
RETURNS chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  new_message public.chat_messages;
BEGIN
  SELECT project_id INTO v_project_id FROM public.chat_sessions WHERE id = p_chat_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chat session not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  INSERT INTO public.chat_messages (chat_session_id, role, content, created_by) VALUES (p_chat_session_id, p_role, p_content, auth.uid()) RETURNING * INTO new_message;
  UPDATE public.chat_sessions SET updated_at = now() WHERE id = p_chat_session_id;
  RETURN new_message;
END;
$function$;

-- get_project_repos_with_token
CREATE OR REPLACE FUNCTION public.get_project_repos_with_token(p_project_id uuid, p_token uuid)
RETURNS SETOF project_repos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  RETURN QUERY SELECT * FROM public.project_repos WHERE project_id = p_project_id ORDER BY is_default DESC, created_at ASC;
END;
$function$;

-- get_project_standards_with_token
CREATE OR REPLACE FUNCTION public.get_project_standards_with_token(p_project_id uuid, p_token uuid)
RETURNS SETOF project_standards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  RETURN QUERY SELECT * FROM public.project_standards WHERE project_id = p_project_id;
END;
$function$;

-- insert_project_standard_with_token
CREATE OR REPLACE FUNCTION public.insert_project_standard_with_token(p_project_id uuid, p_token uuid, p_standard_id uuid)
RETURNS project_standards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.project_standards;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  INSERT INTO public.project_standards (project_id, standard_id) VALUES (p_project_id, p_standard_id) RETURNING * INTO result;
  RETURN result;
END;
$function$;

-- delete_project_standard_with_token
CREATE OR REPLACE FUNCTION public.delete_project_standard_with_token(p_id uuid, p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM public.project_standards WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project standard not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  DELETE FROM public.project_standards WHERE id = p_id;
END;
$function$;

-- get_project_tech_stacks_with_token
CREATE OR REPLACE FUNCTION public.get_project_tech_stacks_with_token(p_project_id uuid, p_token uuid)
RETURNS SETOF project_tech_stacks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  RETURN QUERY SELECT * FROM public.project_tech_stacks WHERE project_id = p_project_id;
END;
$function$;

-- insert_project_tech_stack_with_token
CREATE OR REPLACE FUNCTION public.insert_project_tech_stack_with_token(p_project_id uuid, p_token uuid, p_tech_stack_id uuid)
RETURNS project_tech_stacks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.project_tech_stacks;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  INSERT INTO public.project_tech_stacks (project_id, tech_stack_id) VALUES (p_project_id, p_tech_stack_id) RETURNING * INTO result;
  RETURN result;
END;
$function$;

-- delete_project_tech_stack_with_token
CREATE OR REPLACE FUNCTION public.delete_project_tech_stack_with_token(p_id uuid, p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM public.project_tech_stacks WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project tech stack not found'; END IF;
  PERFORM public.require_role(v_project_id, p_token, 'editor');
  DELETE FROM public.project_tech_stacks WHERE id = p_id;
END;
$function$;

-- get_project_specification_with_token
CREATE OR REPLACE FUNCTION public.get_project_specification_with_token(p_project_id uuid, p_token uuid)
RETURNS project_specifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.project_specifications;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'viewer');
  SELECT * INTO result FROM public.project_specifications WHERE project_id = p_project_id;
  RETURN result;
END;
$function$;

-- save_project_specification_with_token
CREATE OR REPLACE FUNCTION public.save_project_specification_with_token(p_project_id uuid, p_token uuid, p_generated_spec text, p_raw_data jsonb)
RETURNS project_specifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.project_specifications;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  INSERT INTO public.project_specifications (project_id, generated_spec, raw_data)
  VALUES (p_project_id, p_generated_spec, p_raw_data)
  ON CONFLICT (project_id) DO UPDATE SET generated_spec = EXCLUDED.generated_spec, raw_data = EXCLUDED.raw_data, updated_at = now()
  RETURNING * INTO result;
  RETURN result;
END;
$function$;

-- update_project_llm_settings_with_token
CREATE OR REPLACE FUNCTION public.update_project_llm_settings_with_token(p_project_id uuid, p_token uuid, p_selected_model text, p_max_tokens integer, p_thinking_enabled boolean, p_thinking_budget integer)
RETURNS projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.projects;
BEGIN
  PERFORM public.require_role(p_project_id, p_token, 'editor');
  UPDATE public.projects SET selected_model = p_selected_model, max_tokens = p_max_tokens, thinking_enabled = p_thinking_enabled, thinking_budget = p_thinking_budget, updated_at = now() WHERE id = p_project_id RETURNING * INTO result;
  RETURN result;
END;
$function$;