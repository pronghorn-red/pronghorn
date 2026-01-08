-- Create the before-user-created hook function
-- This function is called by Supabase Auth before any new user is created
CREATE OR REPLACE FUNCTION public.hook_validate_signup_code(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_metadata jsonb;
  signup_validated boolean;
BEGIN
  -- Extract user metadata from the event
  user_metadata := event->'user'->'user_metadata';
  
  -- Check if signup_validated flag is set to true
  -- This flag is set by the frontend AFTER validating the code via edge function
  signup_validated := COALESCE((user_metadata->>'signup_validated')::boolean, false);
  
  IF NOT signup_validated THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'A valid signup code is required to create an account.',
        'http_code', 403
      )
    );
  END IF;
  
  -- Allow signup
  RETURN '{}'::jsonb;
END;
$$;

-- Grant permission to supabase_auth_admin (required for auth hooks)
GRANT EXECUTE ON FUNCTION public.hook_validate_signup_code TO supabase_auth_admin;

-- Revoke from other roles for security
REVOKE EXECUTE ON FUNCTION public.hook_validate_signup_code FROM authenticated, anon, public;