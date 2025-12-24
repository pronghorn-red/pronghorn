-- Drop the older overloaded function (15 args) that's causing PGRST203 errors
-- Keep only the newer function with disk parameters (19 args)
DROP FUNCTION IF EXISTS public.update_deployment_with_token(
  uuid, uuid, text, deployment_environment, text, text, text, text, text, text, 
  deployment_status, text, text, text, jsonb
);