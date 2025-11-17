-- Fix search_path for generate_requirement_code function
CREATE OR REPLACE FUNCTION generate_requirement_code(
  p_project_id UUID,
  p_parent_id UUID,
  p_type TEXT
) RETURNS TEXT 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_code TEXT;
  sibling_count INTEGER;
  type_prefix TEXT;
  new_code TEXT;
BEGIN
  type_prefix := CASE p_type
    WHEN 'EPIC' THEN 'E'
    WHEN 'FEATURE' THEN 'F'
    WHEN 'STORY' THEN 'S'
    WHEN 'ACCEPTANCE_CRITERIA' THEN 'AC'
  END;
  
  IF p_parent_id IS NULL THEN
    SELECT COUNT(*) INTO sibling_count
    FROM requirements
    WHERE project_id = p_project_id
      AND parent_id IS NULL
      AND type = p_type;
    
    new_code := type_prefix || '-' || LPAD((sibling_count + 1)::TEXT, 3, '0');
    RETURN new_code;
  END IF;
  
  SELECT code INTO parent_code
  FROM requirements
  WHERE id = p_parent_id;
  
  SELECT COUNT(*) INTO sibling_count
  FROM requirements
  WHERE parent_id = p_parent_id
    AND type = p_type;
  
  new_code := parent_code || '-' || type_prefix || '-' || LPAD((sibling_count + 1)::TEXT, 3, '0');
  
  RETURN new_code;
END;
$$;

-- Fix search_path for auto_generate_requirement_code trigger function
CREATE OR REPLACE FUNCTION auto_generate_requirement_code()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := generate_requirement_code(NEW.project_id, NEW.parent_id, NEW.type);
  END IF;
  RETURN NEW;
END;
$$;