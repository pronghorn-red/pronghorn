-- Project Selector Tools for Coding Agent
-- Three functions to give agents read-only access to explore entire project

-- 1. get_project_inventory_with_token - Returns counts and brief previews for ALL categories
CREATE OR REPLACE FUNCTION public.get_project_inventory_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inventory jsonb;
BEGIN
  -- Validate access
  PERFORM public.require_role(p_project_id, p_token, 'viewer');

  SELECT jsonb_build_object(
    'requirements', (
      SELECT jsonb_build_object(
        'count', COUNT(*),
        'items', COALESCE(jsonb_agg(jsonb_build_object(
          'id', r.id,
          'title', r.title,
          'code', r.code,
          'type', r.type,
          'snippet', LEFT(COALESCE(r.content, ''), 200)
        ) ORDER BY r.order_index) FILTER (WHERE r.id IS NOT NULL), '[]'::jsonb)
      )
      FROM (SELECT * FROM public.requirements WHERE project_id = p_project_id LIMIT 50) r
    ),
    'chat_sessions', (
      SELECT jsonb_build_object(
        'count', (SELECT COUNT(*) FROM public.chat_sessions WHERE project_id = p_project_id),
        'items', COALESCE(jsonb_agg(jsonb_build_object(
          'id', cs.id,
          'title', COALESCE(cs.ai_title, cs.title, 'Untitled'),
          'snippet', LEFT(COALESCE(cs.ai_summary, ''), 200),
          'updated_at', cs.updated_at
        ) ORDER BY cs.updated_at DESC) FILTER (WHERE cs.id IS NOT NULL), '[]'::jsonb)
      )
      FROM (SELECT * FROM public.chat_sessions WHERE project_id = p_project_id ORDER BY updated_at DESC LIMIT 20) cs
    ),
    'artifacts', (
      SELECT jsonb_build_object(
        'count', (SELECT COUNT(*) FROM public.artifacts WHERE project_id = p_project_id),
        'items', COALESCE(jsonb_agg(jsonb_build_object(
          'id', a.id,
          'title', COALESCE(a.ai_title, 'Artifact'),
          'snippet', LEFT(COALESCE(a.ai_summary, a.content, ''), 200),
          'source_type', a.source_type
        ) ORDER BY a.updated_at DESC) FILTER (WHERE a.id IS NOT NULL), '[]'::jsonb)
      )
      FROM (SELECT * FROM public.artifacts WHERE project_id = p_project_id ORDER BY updated_at DESC LIMIT 20) a
    ),
    'canvas_nodes', (
      SELECT jsonb_build_object(
        'count', (SELECT COUNT(*) FROM public.canvas_nodes WHERE project_id = p_project_id),
        'items', COALESCE(jsonb_agg(jsonb_build_object(
          'id', cn.id,
          'type', cn.type,
          'label', COALESCE(cn.data->>'label', cn.data->>'title', cn.data->>'name', 'Unnamed'),
          'snippet', LEFT(COALESCE(cn.data->>'description', cn.data->>'content', ''), 200)
        ) ORDER BY cn.created_at DESC) FILTER (WHERE cn.id IS NOT NULL), '[]'::jsonb)
      )
      FROM (SELECT * FROM public.canvas_nodes WHERE project_id = p_project_id LIMIT 50) cn
    ),
    'canvas_edges', (
      SELECT jsonb_build_object(
        'count', (SELECT COUNT(*) FROM public.canvas_edges WHERE project_id = p_project_id),
        'items', COALESCE(jsonb_agg(jsonb_build_object(
          'id', ce.id,
          'source_id', ce.source_id,
          'target_id', ce.target_id,
          'label', ce.label
        ) ORDER BY ce.created_at DESC) FILTER (WHERE ce.id IS NOT NULL), '[]'::jsonb)
      )
      FROM (SELECT * FROM public.canvas_edges WHERE project_id = p_project_id LIMIT 50) ce
    ),
    'canvas_layers', (
      SELECT jsonb_build_object(
        'count', (SELECT COUNT(*) FROM public.canvas_layers WHERE project_id = p_project_id),
        'items', COALESCE(jsonb_agg(jsonb_build_object(
          'id', cl.id,
          'name', cl.name,
          'visible', cl.visible,
          'node_count', array_length(cl.node_ids, 1)
        ) ORDER BY cl.created_at DESC) FILTER (WHERE cl.id IS NOT NULL), '[]'::jsonb)
      )
      FROM public.canvas_layers cl WHERE project_id = p_project_id
    ),
    'standards', (
      SELECT jsonb_build_object(
        'count', (SELECT COUNT(*) FROM public.project_standards WHERE project_id = p_project_id),
        'items', COALESCE(jsonb_agg(jsonb_build_object(
          'id', s.id,
          'code', s.code,
          'title', s.title,
          'snippet', LEFT(COALESCE(s.description, s.content, ''), 200)
        ) ORDER BY s.order_index) FILTER (WHERE s.id IS NOT NULL), '[]'::jsonb)
      )
      FROM public.project_standards ps
      JOIN public.standards s ON s.id = ps.standard_id
      WHERE ps.project_id = p_project_id
      LIMIT 30
    ),
    'tech_stacks', (
      SELECT jsonb_build_object(
        'count', (SELECT COUNT(*) FROM public.project_tech_stacks WHERE project_id = p_project_id),
        'items', COALESCE(jsonb_agg(jsonb_build_object(
          'id', ts.id,
          'name', ts.name,
          'type', ts.type,
          'snippet', LEFT(COALESCE(ts.description, ''), 200)
        ) ORDER BY ts.order_index) FILTER (WHERE ts.id IS NOT NULL), '[]'::jsonb)
      )
      FROM public.project_tech_stacks pts
      JOIN public.tech_stacks ts ON ts.id = pts.tech_stack_id
      WHERE pts.project_id = p_project_id
      LIMIT 30
    ),
    'repositories', (
      SELECT jsonb_build_object(
        'count', (SELECT COUNT(*) FROM public.project_repos WHERE project_id = p_project_id),
        'items', COALESCE(jsonb_agg(jsonb_build_object(
          'id', pr.id,
          'repo', pr.repo,
          'organization', pr.organization,
          'branch', pr.branch,
          'is_prime', pr.is_prime
        ) ORDER BY pr.is_prime DESC, pr.created_at) FILTER (WHERE pr.id IS NOT NULL), '[]'::jsonb)
      )
      FROM public.project_repos pr WHERE project_id = p_project_id
    ),
    'agent_sessions', (
      SELECT jsonb_build_object(
        'count', (SELECT COUNT(*) FROM public.agent_sessions WHERE project_id = p_project_id),
        'items', COALESCE(jsonb_agg(jsonb_build_object(
          'id', asess.id,
          'mode', asess.mode,
          'status', asess.status,
          'snippet', LEFT(COALESCE(asess.task_description, ''), 200),
          'started_at', asess.started_at
        ) ORDER BY asess.started_at DESC) FILTER (WHERE asess.id IS NOT NULL), '[]'::jsonb)
      )
      FROM (SELECT * FROM public.agent_sessions WHERE project_id = p_project_id ORDER BY started_at DESC LIMIT 20) asess
    ),
    'project_metadata', (
      SELECT jsonb_build_object(
        'count', 1,
        'items', jsonb_build_array(jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'status', p.status,
          'snippet', LEFT(COALESCE(p.description, p.scope, ''), 200)
        ))
      )
      FROM public.projects p WHERE id = p_project_id
    )
  ) INTO v_inventory;

  RETURN v_inventory;
END;
$function$;

-- 2. get_project_category_with_token - Returns all items for a specific category
CREATE OR REPLACE FUNCTION public.get_project_category_with_token(
  p_project_id uuid,
  p_category text,
  p_token uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- Validate access
  PERFORM public.require_role(p_project_id, p_token, 'viewer');

  CASE p_category
    WHEN 'requirements' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.order_index), '[]'::jsonb)
      INTO v_result
      FROM public.requirements r WHERE project_id = p_project_id;
      
    WHEN 'chat_sessions' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(cs) ORDER BY cs.updated_at DESC), '[]'::jsonb)
      INTO v_result
      FROM public.chat_sessions cs WHERE project_id = p_project_id;
      
    WHEN 'chat_messages' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(cm) ORDER BY cm.created_at), '[]'::jsonb)
      INTO v_result
      FROM public.chat_messages cm
      JOIN public.chat_sessions cs ON cs.id = cm.chat_session_id
      WHERE cs.project_id = p_project_id;
      
    WHEN 'artifacts' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.updated_at DESC), '[]'::jsonb)
      INTO v_result
      FROM public.artifacts a WHERE project_id = p_project_id;
      
    WHEN 'canvas_nodes' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(cn) ORDER BY cn.created_at), '[]'::jsonb)
      INTO v_result
      FROM public.canvas_nodes cn WHERE project_id = p_project_id;
      
    WHEN 'canvas_edges' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(ce) ORDER BY ce.created_at), '[]'::jsonb)
      INTO v_result
      FROM public.canvas_edges ce WHERE project_id = p_project_id;
      
    WHEN 'canvas_layers' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(cl) ORDER BY cl.created_at), '[]'::jsonb)
      INTO v_result
      FROM public.canvas_layers cl WHERE project_id = p_project_id;
      
    WHEN 'standards' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.order_index), '[]'::jsonb)
      INTO v_result
      FROM public.project_standards ps
      JOIN public.standards s ON s.id = ps.standard_id
      WHERE ps.project_id = p_project_id;
      
    WHEN 'tech_stacks' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(ts) ORDER BY ts.order_index), '[]'::jsonb)
      INTO v_result
      FROM public.project_tech_stacks pts
      JOIN public.tech_stacks ts ON ts.id = pts.tech_stack_id
      WHERE pts.project_id = p_project_id;
      
    WHEN 'repositories' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(pr) ORDER BY pr.is_prime DESC, pr.created_at), '[]'::jsonb)
      INTO v_result
      FROM public.project_repos pr WHERE project_id = p_project_id;
      
    WHEN 'repo_files' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', rf.id,
        'path', rf.path,
        'content', rf.content,
        'is_binary', rf.is_binary,
        'repo_id', rf.repo_id,
        'updated_at', rf.updated_at
      ) ORDER BY rf.path), '[]'::jsonb)
      INTO v_result
      FROM public.repo_files rf WHERE project_id = p_project_id;
      
    WHEN 'repo_staging' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(rs) ORDER BY rs.created_at), '[]'::jsonb)
      INTO v_result
      FROM public.repo_staging rs WHERE project_id = p_project_id;
      
    WHEN 'repo_commits' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(rc) ORDER BY rc.committed_at DESC), '[]'::jsonb)
      INTO v_result
      FROM public.repo_commits rc WHERE project_id = p_project_id;
      
    WHEN 'agent_sessions' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(asess) ORDER BY asess.started_at DESC), '[]'::jsonb)
      INTO v_result
      FROM public.agent_sessions asess WHERE project_id = p_project_id;
      
    WHEN 'agent_messages' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(am) ORDER BY am.created_at), '[]'::jsonb)
      INTO v_result
      FROM public.agent_messages am
      JOIN public.agent_sessions asess ON asess.id = am.session_id
      WHERE asess.project_id = p_project_id;
      
    WHEN 'project_metadata' THEN
      SELECT to_jsonb(p)
      INTO v_result
      FROM public.projects p WHERE id = p_project_id;
      
    ELSE
      RAISE EXCEPTION 'Unknown category: %', p_category;
  END CASE;

  RETURN v_result;
END;
$function$;

-- 3. get_project_elements_with_token - Returns specific elements by category/id pairs
CREATE OR REPLACE FUNCTION public.get_project_elements_with_token(
  p_project_id uuid,
  p_elements jsonb, -- Array of {category: string, id: string}
  p_token uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_element jsonb;
  v_category text;
  v_id uuid;
  v_item jsonb;
BEGIN
  -- Validate access
  PERFORM public.require_role(p_project_id, p_token, 'viewer');

  FOR v_element IN SELECT * FROM jsonb_array_elements(p_elements)
  LOOP
    v_category := v_element->>'category';
    v_id := (v_element->>'id')::uuid;
    v_item := NULL;

    CASE v_category
      WHEN 'requirements' THEN
        SELECT to_jsonb(r) INTO v_item
        FROM public.requirements r
        WHERE id = v_id AND project_id = p_project_id;
        
      WHEN 'chat_sessions' THEN
        SELECT to_jsonb(cs) INTO v_item
        FROM public.chat_sessions cs
        WHERE id = v_id AND project_id = p_project_id;
        
      WHEN 'chat_messages' THEN
        SELECT to_jsonb(cm) INTO v_item
        FROM public.chat_messages cm
        JOIN public.chat_sessions cs ON cs.id = cm.chat_session_id
        WHERE cm.id = v_id AND cs.project_id = p_project_id;
        
      WHEN 'artifacts' THEN
        SELECT to_jsonb(a) INTO v_item
        FROM public.artifacts a
        WHERE id = v_id AND project_id = p_project_id;
        
      WHEN 'canvas_nodes' THEN
        SELECT to_jsonb(cn) INTO v_item
        FROM public.canvas_nodes cn
        WHERE id = v_id AND project_id = p_project_id;
        
      WHEN 'canvas_edges' THEN
        SELECT to_jsonb(ce) INTO v_item
        FROM public.canvas_edges ce
        WHERE id = v_id AND project_id = p_project_id;
        
      WHEN 'canvas_layers' THEN
        SELECT to_jsonb(cl) INTO v_item
        FROM public.canvas_layers cl
        WHERE id = v_id AND project_id = p_project_id;
        
      WHEN 'standards' THEN
        SELECT to_jsonb(s) INTO v_item
        FROM public.standards s
        JOIN public.project_standards ps ON ps.standard_id = s.id
        WHERE s.id = v_id AND ps.project_id = p_project_id;
        
      WHEN 'tech_stacks' THEN
        SELECT to_jsonb(ts) INTO v_item
        FROM public.tech_stacks ts
        JOIN public.project_tech_stacks pts ON pts.tech_stack_id = ts.id
        WHERE ts.id = v_id AND pts.project_id = p_project_id;
        
      WHEN 'repositories' THEN
        SELECT to_jsonb(pr) INTO v_item
        FROM public.project_repos pr
        WHERE id = v_id AND project_id = p_project_id;
        
      WHEN 'repo_files' THEN
        SELECT to_jsonb(rf) INTO v_item
        FROM public.repo_files rf
        WHERE id = v_id AND project_id = p_project_id;
        
      WHEN 'repo_staging' THEN
        SELECT to_jsonb(rs) INTO v_item
        FROM public.repo_staging rs
        WHERE id = v_id AND project_id = p_project_id;
        
      WHEN 'repo_commits' THEN
        SELECT to_jsonb(rc) INTO v_item
        FROM public.repo_commits rc
        WHERE id = v_id AND project_id = p_project_id;
        
      WHEN 'agent_sessions' THEN
        SELECT to_jsonb(asess) INTO v_item
        FROM public.agent_sessions asess
        WHERE id = v_id AND project_id = p_project_id;
        
      WHEN 'agent_messages' THEN
        SELECT to_jsonb(am) INTO v_item
        FROM public.agent_messages am
        JOIN public.agent_sessions asess ON asess.id = am.session_id
        WHERE am.id = v_id AND asess.project_id = p_project_id;
        
      WHEN 'project_metadata' THEN
        SELECT to_jsonb(p) INTO v_item
        FROM public.projects p
        WHERE id = v_id AND id = p_project_id;
        
      ELSE
        v_item := jsonb_build_object('error', 'Unknown category: ' || v_category);
    END CASE;

    IF v_item IS NOT NULL THEN
      v_result := v_result || jsonb_build_object(
        'category', v_category,
        'id', v_id,
        'data', v_item
      );
    ELSE
      v_result := v_result || jsonb_build_object(
        'category', v_category,
        'id', v_id,
        'data', null,
        'error', 'Not found'
      );
    END IF;
  END LOOP;

  RETURN v_result;
END;
$function$;