-- Add metadata column to tech_stacks table to store tree structure
ALTER TABLE tech_stacks ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;