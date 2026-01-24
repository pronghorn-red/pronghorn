-- Add 'tool' role to artifact_collaboration_messages for tracking tool executions
ALTER TABLE public.artifact_collaboration_messages 
DROP CONSTRAINT IF EXISTS artifact_collaboration_messages_role_check;

ALTER TABLE public.artifact_collaboration_messages 
ADD CONSTRAINT artifact_collaboration_messages_role_check 
CHECK (role IN ('user', 'assistant', 'system', 'tool'));