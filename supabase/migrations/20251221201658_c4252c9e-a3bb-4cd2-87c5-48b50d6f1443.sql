-- =============================================
-- PHASE 1: Published Projects Table + Clone Function
-- =============================================

-- 1. Create published_projects table for gallery
CREATE TABLE public.published_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- Display info (can override project defaults)
  name text NOT NULL,
  description text,
  image_url text,
  
  -- Searchable metadata
  tags text[] DEFAULT '{}',
  category text,
  
  -- Visibility control
  is_visible boolean NOT NULL DEFAULT true,
  
  -- Tracking
  published_by uuid REFERENCES auth.users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Stats
  clone_count integer DEFAULT 0,
  view_count integer DEFAULT 0,
  
  UNIQUE(project_id)
);

-- Enable RLS
ALTER TABLE public.published_projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Superadmins can manage, anyone can view visible entries
CREATE POLICY "Superadmins can manage published projects"
ON public.published_projects FOR ALL
USING (public.is_admin());

CREATE POLICY "Anyone can view visible published projects"
ON public.published_projects FOR SELECT
USING (is_visible = true);

-- Create index for search
CREATE INDEX idx_published_projects_tags ON public.published_projects USING GIN(tags);
CREATE INDEX idx_published_projects_category ON public.published_projects(category);
CREATE INDEX idx_published_projects_visible ON public.published_projects(is_visible) WHERE is_visible = true;

-- =============================================
-- 2. Clone Project RPC Function
-- =============================================

CREATE OR REPLACE FUNCTION public.clone_project_with_token(
  p_source_project_id uuid,
  p_token uuid,
  p_new_name text,
  p_clone_chat boolean DEFAULT false,
  p_clone_artifacts boolean DEFAULT false,
  p_clone_requirements boolean DEFAULT false,
  p_clone_standards boolean DEFAULT false,
  p_clone_specifications boolean DEFAULT false,
  p_clone_canvas boolean DEFAULT false,
  p_clone_repo_files boolean DEFAULT false,
  p_clone_repo_staging boolean DEFAULT false
)
RETURNS TABLE(id uuid, share_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_source_org_id uuid;
  v_new_project_id uuid;
  v_new_token uuid;
  v_new_repo_id uuid;
  v_source_repo_id uuid;
  -- UUID mapping tables for hierarchical data
  v_req_map jsonb := '{}';
  v_node_map jsonb := '{}';
  v_session_map jsonb := '{}';
  v_old_id uuid;
  v_new_id uuid;
  rec record;
BEGIN
  -- Validate access to source project
  PERFORM public.require_role(p_source_project_id, p_token, 'viewer');
  
  -- Get current user
  v_user_id := auth.uid();
  
  -- Get source project org_id
  SELECT org_id INTO v_source_org_id
  FROM public.projects
  WHERE projects.id = p_source_project_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source project not found';
  END IF;
  
  -- Create new project
  INSERT INTO public.projects (name, org_id, created_by, status)
  VALUES (p_new_name, v_source_org_id, v_user_id, 'DESIGN')
  RETURNING projects.id INTO v_new_project_id;
  
  -- Create owner token for new project
  INSERT INTO public.project_tokens (project_id, role, label, created_by)
  VALUES (v_new_project_id, 'owner', 'Default Owner Token', v_user_id)
  RETURNING token INTO v_new_token;
  
  -- =============================================
  -- Clone Requirements (with parent_id remapping)
  -- =============================================
  IF p_clone_requirements THEN
    -- First pass: insert all requirements with NULL parent_id, building map
    FOR rec IN 
      SELECT * FROM public.requirements 
      WHERE project_id = p_source_project_id
      ORDER BY order_index
    LOOP
      v_new_id := gen_random_uuid();
      v_req_map := v_req_map || jsonb_build_object(rec.id::text, v_new_id::text);
      
      INSERT INTO public.requirements (id, project_id, title, content, code, type, order_index, parent_id)
      VALUES (v_new_id, v_new_project_id, rec.title, rec.content, rec.code, rec.type, rec.order_index, NULL);
    END LOOP;
    
    -- Second pass: update parent_id references
    FOR rec IN 
      SELECT r.id as old_id, r.parent_id as old_parent_id
      FROM public.requirements r
      WHERE r.project_id = p_source_project_id AND r.parent_id IS NOT NULL
    LOOP
      UPDATE public.requirements
      SET parent_id = (v_req_map->>rec.old_parent_id::text)::uuid
      WHERE id = (v_req_map->>rec.old_id::text)::uuid;
    END LOOP;
  END IF;
  
  -- =============================================
  -- Clone Standards Links
  -- =============================================
  IF p_clone_standards THEN
    INSERT INTO public.project_standards (project_id, standard_id)
    SELECT v_new_project_id, standard_id
    FROM public.project_standards
    WHERE project_id = p_source_project_id;
  END IF;
  
  -- =============================================
  -- Clone Artifacts
  -- =============================================
  IF p_clone_artifacts THEN
    INSERT INTO public.artifacts (project_id, content, ai_title, ai_summary, image_url, source_type, created_by)
    SELECT v_new_project_id, content, ai_title, ai_summary, image_url, source_type, v_user_id
    FROM public.artifacts
    WHERE project_id = p_source_project_id;
  END IF;
  
  -- =============================================
  -- Clone Chat Sessions & Messages
  -- =============================================
  IF p_clone_chat THEN
    -- Clone sessions and build map
    FOR rec IN 
      SELECT * FROM public.chat_sessions 
      WHERE project_id = p_source_project_id
    LOOP
      v_new_id := gen_random_uuid();
      v_session_map := v_session_map || jsonb_build_object(rec.id::text, v_new_id::text);
      
      INSERT INTO public.chat_sessions (id, project_id, title, ai_title, ai_summary, created_by)
      VALUES (v_new_id, v_new_project_id, rec.title, rec.ai_title, rec.ai_summary, v_user_id);
    END LOOP;
    
    -- Clone messages with remapped session_id
    INSERT INTO public.chat_messages (project_id, chat_session_id, role, content, created_by)
    SELECT 
      v_new_project_id,
      (v_session_map->>chat_session_id::text)::uuid,
      role,
      content,
      v_user_id
    FROM public.chat_messages
    WHERE project_id = p_source_project_id;
  END IF;
  
  -- =============================================
  -- Clone Specifications
  -- =============================================
  IF p_clone_specifications THEN
    INSERT INTO public.project_specifications (
      project_id, agent_id, agent_title, version, is_latest, 
      generated_spec, raw_data, generated_by_user_id
    )
    SELECT 
      v_new_project_id, agent_id, agent_title, version, is_latest,
      generated_spec, raw_data, v_user_id
    FROM public.project_specifications
    WHERE project_id = p_source_project_id;
  END IF;
  
  -- =============================================
  -- Clone Canvas (nodes, edges, layers)
  -- =============================================
  IF p_clone_canvas THEN
    -- Clone nodes and build map
    FOR rec IN 
      SELECT * FROM public.canvas_nodes 
      WHERE project_id = p_source_project_id
    LOOP
      v_new_id := gen_random_uuid();
      v_node_map := v_node_map || jsonb_build_object(rec.id::text, v_new_id::text);
      
      INSERT INTO public.canvas_nodes (id, project_id, type, position, data)
      VALUES (v_new_id, v_new_project_id, rec.type, rec.position, rec.data);
    END LOOP;
    
    -- Clone edges with remapped source/target
    INSERT INTO public.canvas_edges (project_id, source_id, target_id, edge_type, label, style)
    SELECT 
      v_new_project_id,
      (v_node_map->>source_id::text)::uuid,
      (v_node_map->>target_id::text)::uuid,
      edge_type,
      label,
      style
    FROM public.canvas_edges
    WHERE project_id = p_source_project_id;
    
    -- Clone layers with remapped node_ids
    INSERT INTO public.canvas_layers (project_id, name, visible, node_ids)
    SELECT 
      v_new_project_id,
      name,
      visible,
      -- Remap each node_id in the array
      ARRAY(
        SELECT (v_node_map->>unnest::text)::uuid
        FROM unnest(node_ids)
        WHERE v_node_map ? unnest::text
      )
    FROM public.canvas_layers
    WHERE project_id = p_source_project_id;
  END IF;
  
  -- =============================================
  -- Clone Repo Files & Staging
  -- =============================================
  IF p_clone_repo_files OR p_clone_repo_staging THEN
    -- Get source repo (use default/prime repo)
    SELECT pr.id INTO v_source_repo_id
    FROM public.project_repos pr
    WHERE pr.project_id = p_source_project_id
      AND (pr.is_default = true OR pr.is_prime = true)
    LIMIT 1;
    
    IF v_source_repo_id IS NOT NULL THEN
      -- Create a new repo for the cloned project
      INSERT INTO public.project_repos (project_id, organization, repo, branch, is_default, is_prime)
      SELECT v_new_project_id, 'local', p_new_name || '-clone', branch, true, true
      FROM public.project_repos
      WHERE project_repos.id = v_source_repo_id
      RETURNING project_repos.id INTO v_new_repo_id;
      
      -- Clone repo files
      IF p_clone_repo_files AND v_new_repo_id IS NOT NULL THEN
        INSERT INTO public.repo_files (project_id, repo_id, path, content, is_binary)
        SELECT v_new_project_id, v_new_repo_id, path, content, is_binary
        FROM public.repo_files
        WHERE repo_id = v_source_repo_id;
      END IF;
      
      -- Clone repo staging
      IF p_clone_repo_staging AND v_new_repo_id IS NOT NULL THEN
        INSERT INTO public.repo_staging (project_id, repo_id, file_path, operation_type, old_content, new_content, old_path, is_binary, created_by)
        SELECT v_new_project_id, v_new_repo_id, file_path, operation_type, old_content, new_content, old_path, is_binary, v_user_id
        FROM public.repo_staging
        WHERE repo_id = v_source_repo_id;
      END IF;
    END IF;
  END IF;
  
  -- Return the new project ID and token
  RETURN QUERY SELECT v_new_project_id AS id, v_new_token AS share_token;
END;
$function$;

-- =============================================
-- 3. Helper functions for published projects
-- =============================================

-- Publish a project to gallery (superadmin only)
CREATE OR REPLACE FUNCTION public.publish_project_to_gallery(
  p_project_id uuid,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_category text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_published_id uuid;
  v_project_name text;
  v_project_desc text;
BEGIN
  -- Check superadmin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Superadmin access required';
  END IF;
  
  -- Get project defaults
  SELECT name, description INTO v_project_name, v_project_desc
  FROM public.projects WHERE projects.id = p_project_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  
  -- Insert or update published project
  INSERT INTO public.published_projects (
    project_id, name, description, image_url, tags, category, published_by
  )
  VALUES (
    p_project_id,
    COALESCE(p_name, v_project_name),
    COALESCE(p_description, v_project_desc),
    p_image_url,
    COALESCE(p_tags, '{}'),
    p_category,
    auth.uid()
  )
  ON CONFLICT (project_id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, published_projects.name),
    description = COALESCE(EXCLUDED.description, published_projects.description),
    image_url = COALESCE(EXCLUDED.image_url, published_projects.image_url),
    tags = COALESCE(EXCLUDED.tags, published_projects.tags),
    category = COALESCE(EXCLUDED.category, published_projects.category),
    updated_at = now()
  RETURNING published_projects.id INTO v_published_id;
  
  RETURN v_published_id;
END;
$function$;

-- Update published project (superadmin only)
CREATE OR REPLACE FUNCTION public.update_published_project(
  p_published_id uuid,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_is_visible boolean DEFAULT NULL
)
RETURNS public.published_projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result public.published_projects;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Superadmin access required';
  END IF;
  
  UPDATE public.published_projects SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    image_url = COALESCE(p_image_url, image_url),
    tags = COALESCE(p_tags, tags),
    category = COALESCE(p_category, category),
    is_visible = COALESCE(p_is_visible, is_visible),
    updated_at = now()
  WHERE published_projects.id = p_published_id
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$function$;

-- Toggle visibility (superadmin only)
CREATE OR REPLACE FUNCTION public.toggle_published_project_visibility(p_published_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_visibility boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Superadmin access required';
  END IF;
  
  UPDATE public.published_projects
  SET is_visible = NOT is_visible, updated_at = now()
  WHERE published_projects.id = p_published_id
  RETURNING is_visible INTO v_new_visibility;
  
  RETURN v_new_visibility;
END;
$function$;

-- Get published projects for gallery (public)
CREATE OR REPLACE FUNCTION public.get_published_projects(
  p_search text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.published_projects
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.published_projects pp
  WHERE pp.is_visible = true
    AND (p_search IS NULL OR pp.name ILIKE '%' || p_search || '%' OR pp.description ILIKE '%' || p_search || '%')
    AND (p_category IS NULL OR pp.category = p_category)
    AND (p_tags IS NULL OR pp.tags && p_tags)
  ORDER BY pp.clone_count DESC, pp.published_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- Increment view count
CREATE OR REPLACE FUNCTION public.increment_published_project_views(p_published_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.published_projects
  SET view_count = view_count + 1
  WHERE published_projects.id = p_published_id AND is_visible = true;
END;
$function$;

-- Clone a published project (requires auth)
CREATE OR REPLACE FUNCTION public.clone_published_project(
  p_published_id uuid,
  p_new_name text DEFAULT NULL
)
RETURNS TABLE(id uuid, share_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_source_project_id uuid;
  v_published_name text;
  v_clone_name text;
BEGIN
  -- Must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Get source project from published entry
  SELECT pp.project_id, pp.name INTO v_source_project_id, v_published_name
  FROM public.published_projects pp
  WHERE pp.id = p_published_id AND pp.is_visible = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Published project not found';
  END IF;
  
  -- Set clone name
  v_clone_name := COALESCE(p_new_name, 'Copy of ' || v_published_name);
  
  -- Increment clone count
  UPDATE public.published_projects
  SET clone_count = clone_count + 1
  WHERE published_projects.id = p_published_id;
  
  -- Clone with all content (published projects get full clone)
  RETURN QUERY
  SELECT * FROM public.clone_project_with_token(
    p_source_project_id := v_source_project_id,
    p_token := NULL, -- Bypass token check for published projects
    p_new_name := v_clone_name,
    p_clone_chat := true,
    p_clone_artifacts := true,
    p_clone_requirements := true,
    p_clone_standards := true,
    p_clone_specifications := true,
    p_clone_canvas := true,
    p_clone_repo_files := true,
    p_clone_repo_staging := false
  );
END;
$function$;

-- Update clone_project_with_token to allow NULL token for published projects
CREATE OR REPLACE FUNCTION public.clone_project_with_token(
  p_source_project_id uuid,
  p_token uuid,
  p_new_name text,
  p_clone_chat boolean DEFAULT false,
  p_clone_artifacts boolean DEFAULT false,
  p_clone_requirements boolean DEFAULT false,
  p_clone_standards boolean DEFAULT false,
  p_clone_specifications boolean DEFAULT false,
  p_clone_canvas boolean DEFAULT false,
  p_clone_repo_files boolean DEFAULT false,
  p_clone_repo_staging boolean DEFAULT false
)
RETURNS TABLE(id uuid, share_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_source_org_id uuid;
  v_new_project_id uuid;
  v_new_token uuid;
  v_new_repo_id uuid;
  v_source_repo_id uuid;
  v_is_published boolean;
  -- UUID mapping tables for hierarchical data
  v_req_map jsonb := '{}';
  v_node_map jsonb := '{}';
  v_session_map jsonb := '{}';
  v_old_id uuid;
  v_new_id uuid;
  rec record;
BEGIN
  -- Check if this is a published project (allows NULL token)
  SELECT EXISTS(
    SELECT 1 FROM public.published_projects pp 
    WHERE pp.project_id = p_source_project_id AND pp.is_visible = true
  ) INTO v_is_published;
  
  -- Validate access (skip for published projects)
  IF NOT v_is_published THEN
    IF p_token IS NULL THEN
      RAISE EXCEPTION 'Token required for non-published projects';
    END IF;
    PERFORM public.require_role(p_source_project_id, p_token, 'viewer');
  END IF;
  
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Get source project org_id
  SELECT org_id INTO v_source_org_id
  FROM public.projects
  WHERE projects.id = p_source_project_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source project not found';
  END IF;
  
  -- Create new project
  INSERT INTO public.projects (name, org_id, created_by, status)
  VALUES (p_new_name, v_source_org_id, v_user_id, 'DESIGN')
  RETURNING projects.id INTO v_new_project_id;
  
  -- Create owner token for new project
  INSERT INTO public.project_tokens (project_id, role, label, created_by)
  VALUES (v_new_project_id, 'owner', 'Default Owner Token', v_user_id)
  RETURNING token INTO v_new_token;
  
  -- =============================================
  -- Clone Requirements (with parent_id remapping)
  -- =============================================
  IF p_clone_requirements THEN
    -- First pass: insert all requirements with NULL parent_id, building map
    FOR rec IN 
      SELECT * FROM public.requirements 
      WHERE project_id = p_source_project_id
      ORDER BY order_index
    LOOP
      v_new_id := gen_random_uuid();
      v_req_map := v_req_map || jsonb_build_object(rec.id::text, v_new_id::text);
      
      INSERT INTO public.requirements (id, project_id, title, content, code, type, order_index, parent_id)
      VALUES (v_new_id, v_new_project_id, rec.title, rec.content, rec.code, rec.type, rec.order_index, NULL);
    END LOOP;
    
    -- Second pass: update parent_id references
    FOR rec IN 
      SELECT r.id as old_id, r.parent_id as old_parent_id
      FROM public.requirements r
      WHERE r.project_id = p_source_project_id AND r.parent_id IS NOT NULL
    LOOP
      UPDATE public.requirements
      SET parent_id = (v_req_map->>rec.old_parent_id::text)::uuid
      WHERE requirements.id = (v_req_map->>rec.old_id::text)::uuid;
    END LOOP;
  END IF;
  
  -- =============================================
  -- Clone Standards Links
  -- =============================================
  IF p_clone_standards THEN
    INSERT INTO public.project_standards (project_id, standard_id)
    SELECT v_new_project_id, standard_id
    FROM public.project_standards
    WHERE project_id = p_source_project_id;
  END IF;
  
  -- =============================================
  -- Clone Artifacts
  -- =============================================
  IF p_clone_artifacts THEN
    INSERT INTO public.artifacts (project_id, content, ai_title, ai_summary, image_url, source_type, created_by)
    SELECT v_new_project_id, content, ai_title, ai_summary, image_url, source_type, v_user_id
    FROM public.artifacts
    WHERE project_id = p_source_project_id;
  END IF;
  
  -- =============================================
  -- Clone Chat Sessions & Messages
  -- =============================================
  IF p_clone_chat THEN
    -- Clone sessions and build map
    FOR rec IN 
      SELECT * FROM public.chat_sessions 
      WHERE project_id = p_source_project_id
    LOOP
      v_new_id := gen_random_uuid();
      v_session_map := v_session_map || jsonb_build_object(rec.id::text, v_new_id::text);
      
      INSERT INTO public.chat_sessions (id, project_id, title, ai_title, ai_summary, created_by)
      VALUES (v_new_id, v_new_project_id, rec.title, rec.ai_title, rec.ai_summary, v_user_id);
    END LOOP;
    
    -- Clone messages with remapped session_id
    INSERT INTO public.chat_messages (project_id, chat_session_id, role, content, created_by)
    SELECT 
      v_new_project_id,
      (v_session_map->>chat_session_id::text)::uuid,
      role,
      content,
      v_user_id
    FROM public.chat_messages
    WHERE project_id = p_source_project_id;
  END IF;
  
  -- =============================================
  -- Clone Specifications
  -- =============================================
  IF p_clone_specifications THEN
    INSERT INTO public.project_specifications (
      project_id, agent_id, agent_title, version, is_latest, 
      generated_spec, raw_data, generated_by_user_id
    )
    SELECT 
      v_new_project_id, agent_id, agent_title, version, is_latest,
      generated_spec, raw_data, v_user_id
    FROM public.project_specifications
    WHERE project_id = p_source_project_id;
  END IF;
  
  -- =============================================
  -- Clone Canvas (nodes, edges, layers)
  -- =============================================
  IF p_clone_canvas THEN
    -- Clone nodes and build map
    FOR rec IN 
      SELECT * FROM public.canvas_nodes 
      WHERE project_id = p_source_project_id
    LOOP
      v_new_id := gen_random_uuid();
      v_node_map := v_node_map || jsonb_build_object(rec.id::text, v_new_id::text);
      
      INSERT INTO public.canvas_nodes (id, project_id, type, position, data)
      VALUES (v_new_id, v_new_project_id, rec.type, rec.position, rec.data);
    END LOOP;
    
    -- Clone edges with remapped source/target
    INSERT INTO public.canvas_edges (project_id, source_id, target_id, edge_type, label, style)
    SELECT 
      v_new_project_id,
      (v_node_map->>source_id::text)::uuid,
      (v_node_map->>target_id::text)::uuid,
      edge_type,
      label,
      style
    FROM public.canvas_edges
    WHERE project_id = p_source_project_id;
    
    -- Clone layers with remapped node_ids
    INSERT INTO public.canvas_layers (project_id, name, visible, node_ids)
    SELECT 
      v_new_project_id,
      name,
      visible,
      -- Remap each node_id in the array
      ARRAY(
        SELECT (v_node_map->>unnest::text)::uuid
        FROM unnest(node_ids)
        WHERE v_node_map ? unnest::text
      )
    FROM public.canvas_layers
    WHERE project_id = p_source_project_id;
  END IF;
  
  -- =============================================
  -- Clone Repo Files & Staging
  -- =============================================
  IF p_clone_repo_files OR p_clone_repo_staging THEN
    -- Get source repo (use default/prime repo)
    SELECT pr.id INTO v_source_repo_id
    FROM public.project_repos pr
    WHERE pr.project_id = p_source_project_id
      AND (pr.is_default = true OR pr.is_prime = true)
    LIMIT 1;
    
    IF v_source_repo_id IS NOT NULL THEN
      -- Create a new repo for the cloned project
      INSERT INTO public.project_repos (project_id, organization, repo, branch, is_default, is_prime)
      SELECT v_new_project_id, 'local', p_new_name || '-clone', branch, true, true
      FROM public.project_repos
      WHERE project_repos.id = v_source_repo_id
      RETURNING project_repos.id INTO v_new_repo_id;
      
      -- Clone repo files
      IF p_clone_repo_files AND v_new_repo_id IS NOT NULL THEN
        INSERT INTO public.repo_files (project_id, repo_id, path, content, is_binary)
        SELECT v_new_project_id, v_new_repo_id, path, content, is_binary
        FROM public.repo_files
        WHERE repo_id = v_source_repo_id;
      END IF;
      
      -- Clone repo staging
      IF p_clone_repo_staging AND v_new_repo_id IS NOT NULL THEN
        INSERT INTO public.repo_staging (project_id, repo_id, file_path, operation_type, old_content, new_content, old_path, is_binary, created_by)
        SELECT v_new_project_id, v_new_repo_id, file_path, operation_type, old_content, new_content, old_path, is_binary, v_user_id
        FROM public.repo_staging
        WHERE repo_id = v_source_repo_id;
      END IF;
    END IF;
  END IF;
  
  -- Return the new project ID and token
  RETURN QUERY SELECT v_new_project_id AS id, v_new_token AS share_token;
END;
$function$;