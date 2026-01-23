-- Function to duplicate a canvas with all its nodes, edges, and layers
CREATE OR REPLACE FUNCTION public.duplicate_project_canvas_with_token(
  p_source_canvas_id uuid,
  p_new_name text,
  p_token uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_new_canvas_id uuid;
  v_node_id_map jsonb := '{}';
  v_old_node_id uuid;
  v_new_node_id uuid;
  v_node record;
  v_edge record;
  v_layer record;
BEGIN
  -- Get project_id from source canvas
  SELECT project_id INTO v_project_id 
  FROM project_canvases 
  WHERE id = p_source_canvas_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source canvas not found';
  END IF;
  
  -- Validate access
  PERFORM require_role(v_project_id, p_token, 'editor');
  
  -- Create new canvas
  v_new_canvas_id := gen_random_uuid();
  
  INSERT INTO project_canvases (id, project_id, name, description, tags, is_default)
  SELECT v_new_canvas_id, project_id, p_new_name, description, tags, false
  FROM project_canvases
  WHERE id = p_source_canvas_id;
  
  -- Copy nodes and build ID mapping
  FOR v_node IN 
    SELECT * FROM canvas_nodes WHERE canvas_id = p_source_canvas_id
  LOOP
    v_new_node_id := gen_random_uuid();
    v_node_id_map := v_node_id_map || jsonb_build_object(v_node.id::text, v_new_node_id::text);
    
    INSERT INTO canvas_nodes (id, project_id, canvas_id, type, position, data)
    VALUES (v_new_node_id, v_node.project_id, v_new_canvas_id, v_node.type, v_node.position, v_node.data);
  END LOOP;
  
  -- Copy edges with remapped node IDs
  FOR v_edge IN 
    SELECT * FROM canvas_edges WHERE canvas_id = p_source_canvas_id
  LOOP
    INSERT INTO canvas_edges (id, project_id, canvas_id, source_id, target_id, label, edge_type, style)
    VALUES (
      gen_random_uuid(), 
      v_edge.project_id, 
      v_new_canvas_id, 
      (v_node_id_map->>v_edge.source_id::text)::uuid,
      (v_node_id_map->>v_edge.target_id::text)::uuid,
      v_edge.label, 
      v_edge.edge_type, 
      v_edge.style
    );
  END LOOP;
  
  -- Copy layers with remapped node IDs
  FOR v_layer IN 
    SELECT * FROM canvas_layers WHERE canvas_id = p_source_canvas_id
  LOOP
    INSERT INTO canvas_layers (id, project_id, canvas_id, name, node_ids, visible)
    VALUES (
      gen_random_uuid(), 
      v_layer.project_id, 
      v_new_canvas_id, 
      v_layer.name,
      ARRAY(
        SELECT (v_node_id_map->>nid::text)::uuid 
        FROM unnest(v_layer.node_ids) AS nid 
        WHERE v_node_id_map ? nid::text
      ),
      v_layer.visible
    );
  END LOOP;
  
  RETURN v_new_canvas_id;
END;
$function$;

-- Function to merge one canvas into another
CREATE OR REPLACE FUNCTION public.merge_project_canvases_with_token(
  p_source_canvas_id uuid,
  p_target_canvas_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from source canvas
  SELECT project_id INTO v_project_id 
  FROM project_canvases 
  WHERE id = p_source_canvas_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source canvas not found';
  END IF;
  
  -- Validate access
  PERFORM require_role(v_project_id, p_token, 'editor');
  
  -- Verify target canvas exists and belongs to same project
  IF NOT EXISTS (
    SELECT 1 FROM project_canvases 
    WHERE id = p_target_canvas_id AND project_id = v_project_id
  ) THEN
    RAISE EXCEPTION 'Target canvas not found or belongs to different project';
  END IF;
  
  -- Move all nodes to target canvas
  UPDATE canvas_nodes 
  SET canvas_id = p_target_canvas_id 
  WHERE canvas_id = p_source_canvas_id;
  
  -- Move all edges to target canvas
  UPDATE canvas_edges 
  SET canvas_id = p_target_canvas_id 
  WHERE canvas_id = p_source_canvas_id;
  
  -- Move all layers to target canvas
  UPDATE canvas_layers 
  SET canvas_id = p_target_canvas_id 
  WHERE canvas_id = p_source_canvas_id;
  
  -- Delete source canvas
  DELETE FROM project_canvases WHERE id = p_source_canvas_id;
END;
$function$;

-- Function to move nodes (and their edges) to a different canvas
CREATE OR REPLACE FUNCTION public.move_nodes_to_canvas_with_token(
  p_node_ids uuid[],
  p_target_canvas_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
BEGIN
  -- Get project_id from target canvas
  SELECT project_id INTO v_project_id 
  FROM project_canvases 
  WHERE id = p_target_canvas_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target canvas not found';
  END IF;
  
  -- Validate access
  PERFORM require_role(v_project_id, p_token, 'editor');
  
  -- Move specified nodes to target canvas
  UPDATE canvas_nodes 
  SET canvas_id = p_target_canvas_id 
  WHERE id = ANY(p_node_ids);
  
  -- Move edges where BOTH source and target are in the moved nodes
  UPDATE canvas_edges 
  SET canvas_id = p_target_canvas_id 
  WHERE source_id = ANY(p_node_ids) AND target_id = ANY(p_node_ids);
  
  -- Delete edges where only one end is moving (they become orphaned)
  DELETE FROM canvas_edges
  WHERE (source_id = ANY(p_node_ids) AND NOT target_id = ANY(p_node_ids))
     OR (target_id = ANY(p_node_ids) AND NOT source_id = ANY(p_node_ids));
  
  -- Update layers to remove moved node IDs
  UPDATE canvas_layers 
  SET node_ids = ARRAY(
    SELECT unnest(node_ids) EXCEPT SELECT unnest(p_node_ids)
  )
  WHERE node_ids && p_node_ids AND canvas_id != p_target_canvas_id;
END;
$function$;