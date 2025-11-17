-- Add code field to requirements for hierarchical IDs
ALTER TABLE public.requirements ADD COLUMN code TEXT;

-- Create index for code lookups
CREATE INDEX idx_requirements_code ON public.requirements(code);

-- Function to generate hierarchical code based on parent and siblings
CREATE OR REPLACE FUNCTION generate_requirement_code(
  p_project_id UUID,
  p_parent_id UUID,
  p_type TEXT
) RETURNS TEXT AS $$
DECLARE
  parent_code TEXT;
  sibling_count INTEGER;
  type_prefix TEXT;
  new_code TEXT;
BEGIN
  -- Set type prefix
  type_prefix := CASE p_type
    WHEN 'EPIC' THEN 'E'
    WHEN 'FEATURE' THEN 'F'
    WHEN 'STORY' THEN 'S'
    WHEN 'ACCEPTANCE_CRITERIA' THEN 'AC'
  END;
  
  -- If no parent (top-level), create simple code
  IF p_parent_id IS NULL THEN
    SELECT COUNT(*) INTO sibling_count
    FROM requirements
    WHERE project_id = p_project_id
      AND parent_id IS NULL
      AND type = p_type;
    
    new_code := type_prefix || '-' || LPAD((sibling_count + 1)::TEXT, 3, '0');
    RETURN new_code;
  END IF;
  
  -- Get parent code
  SELECT code INTO parent_code
  FROM requirements
  WHERE id = p_parent_id;
  
  -- Count siblings of same type
  SELECT COUNT(*) INTO sibling_count
  FROM requirements
  WHERE parent_id = p_parent_id
    AND type = p_type;
  
  -- Generate hierarchical code
  new_code := parent_code || '-' || type_prefix || '-' || LPAD((sibling_count + 1)::TEXT, 3, '0');
  
  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate code on insert
CREATE OR REPLACE FUNCTION auto_generate_requirement_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := generate_requirement_code(NEW.project_id, NEW.parent_id, NEW.type);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_generate_requirement_code
  BEFORE INSERT ON public.requirements
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_requirement_code();

-- Backfill existing requirements with codes
DO $$
DECLARE
  req RECORD;
BEGIN
  -- First, handle top-level requirements (no parent)
  FOR req IN 
    SELECT id, project_id, parent_id, type
    FROM requirements
    WHERE parent_id IS NULL
    ORDER BY created_at
  LOOP
    UPDATE requirements
    SET code = generate_requirement_code(req.project_id, req.parent_id, req.type)
    WHERE id = req.id;
  END LOOP;
  
  -- Then handle nested requirements level by level
  FOR req IN 
    SELECT id, project_id, parent_id, type
    FROM requirements
    WHERE parent_id IS NOT NULL
    ORDER BY created_at
  LOOP
    UPDATE requirements
    SET code = generate_requirement_code(req.project_id, req.parent_id, req.type)
    WHERE id = req.id;
  END LOOP;
END $$;