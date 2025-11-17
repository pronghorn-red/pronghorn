-- Make org_id nullable in tech_stacks table to fix the constraint error
ALTER TABLE tech_stacks ALTER COLUMN org_id DROP NOT NULL;