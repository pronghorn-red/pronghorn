-- Add JSONB columns for storing full ProjectSelectionResult for datasets
ALTER TABLE public.audit_sessions
ADD COLUMN dataset_1_content JSONB DEFAULT NULL,
ADD COLUMN dataset_2_content JSONB DEFAULT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN public.audit_sessions.dataset_1_content IS 'Full ProjectSelectionResult JSON for Dataset 1 - supports mixed category selection';
COMMENT ON COLUMN public.audit_sessions.dataset_2_content IS 'Full ProjectSelectionResult JSON for Dataset 2 - supports mixed category selection';