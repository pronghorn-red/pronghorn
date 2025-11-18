-- Fix SELECT policy to require share token for anonymous access
-- Authenticated users see their own projects, anonymous users need share token

DROP POLICY IF EXISTS "Users can view projects" ON projects;

CREATE POLICY "Users can view projects" 
  ON projects 
  FOR SELECT 
  TO authenticated, anon
  USING (
    (auth.uid() = created_by) 
    OR (share_token = (current_setting('app.share_token', true))::uuid)
  );