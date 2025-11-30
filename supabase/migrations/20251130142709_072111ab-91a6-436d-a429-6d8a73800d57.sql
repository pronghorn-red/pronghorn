-- Step 1: Add parent_id and type columns to tech_stacks table
ALTER TABLE public.tech_stacks
ADD COLUMN parent_id uuid REFERENCES public.tech_stacks(id) ON DELETE CASCADE,
ADD COLUMN type text,
ADD COLUMN order_index integer NOT NULL DEFAULT 0;

-- Step 2: Create index on parent_id for performance
CREATE INDEX idx_tech_stacks_parent_id ON public.tech_stacks(parent_id);

-- Step 3: Migrate existing metadata items to separate rows
-- This function will extract items from metadata and create new tech_stack rows
DO $$
DECLARE
  stack_record RECORD;
  item_record jsonb;
  new_stack_id uuid;
BEGIN
  -- Loop through all tech stacks that have metadata
  FOR stack_record IN 
    SELECT id, name, metadata, org_id, created_by 
    FROM public.tech_stacks 
    WHERE metadata IS NOT NULL AND metadata != '{}'::jsonb
  LOOP
    -- Loop through items array in metadata
    IF stack_record.metadata ? 'items' THEN
      FOR item_record IN 
        SELECT * FROM jsonb_array_elements(stack_record.metadata->'items')
      LOOP
        -- Insert each item as a new tech_stack row with parent_id pointing to the parent stack
        INSERT INTO public.tech_stacks (
          name,
          type,
          description,
          parent_id,
          org_id,
          created_by,
          order_index
        ) VALUES (
          item_record->>'name',
          item_record->>'type',
          item_record->>'description',
          stack_record.id,
          stack_record.org_id,
          stack_record.created_by,
          0
        );
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Step 4: Update RLS policies to work with hierarchical structure (same as standards)
-- The existing "Public can view tech stacks" and "Public can manage tech stacks" policies already work

-- Step 5: Add comment explaining the structure
COMMENT ON COLUMN public.tech_stacks.parent_id IS 'Points to parent tech stack for hierarchical structure. NULL = top-level stack, non-NULL = child item';
COMMENT ON COLUMN public.tech_stacks.type IS 'Type of tech stack item (e.g., Language, Framework, Plugin, Library, IDE, etc.)';

-- Step 6: Optional - We can deprecate metadata column but leave it for backward compatibility
-- ALTER TABLE public.tech_stacks DROP COLUMN metadata;  -- Uncomment if you want to remove it entirely