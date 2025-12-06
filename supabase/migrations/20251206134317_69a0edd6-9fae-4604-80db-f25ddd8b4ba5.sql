-- Add new columns to profiles table if they don't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_login timestamptz,
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS bio text,
ADD COLUMN IF NOT EXISTS bio_image_url text,
ADD COLUMN IF NOT EXISTS language_preference text DEFAULT 'en';

-- Create is_admin() SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
  )
$$;

-- Create handle_user_login() trigger function for profile upsert
CREATE OR REPLACE FUNCTION public.handle_user_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, last_login, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    now(),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    last_login = now(),
    updated_at = now();
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;

-- Create trigger on auth.users for INSERT and UPDATE
CREATE TRIGGER on_auth_user_login
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_login();

-- Create RPC function to get user's role for a project
CREATE OR REPLACE FUNCTION public.get_user_project_role_with_token(
  p_project_id uuid,
  p_token uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_owner boolean;
BEGIN
  -- Check if authenticated user is the owner
  IF auth.uid() IS NOT NULL THEN
    SELECT (created_by = auth.uid()) INTO v_is_owner
    FROM public.projects
    WHERE id = p_project_id;
    
    IF v_is_owner THEN
      RETURN 'owner';
    END IF;
  END IF;
  
  -- Check token-based access
  IF p_token IS NOT NULL THEN
    SELECT pt.role::text INTO v_role
    FROM public.project_tokens pt
    WHERE pt.project_id = p_project_id
      AND pt.token = p_token
      AND (pt.expires_at IS NULL OR pt.expires_at > now());
    
    IF v_role IS NOT NULL THEN
      RETURN v_role;
    END IF;
  END IF;
  
  -- No access
  RETURN NULL;
END;
$$;