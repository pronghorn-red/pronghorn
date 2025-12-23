-- Add new values to the resource_type enum
ALTER TYPE public.resource_type ADD VALUE IF NOT EXISTS 'repo';
ALTER TYPE public.resource_type ADD VALUE IF NOT EXISTS 'library';