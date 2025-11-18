-- Add share_token to projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS share_token UUID DEFAULT gen_random_uuid();

-- Create index on share_token for faster lookups
CREATE INDEX IF NOT EXISTS idx_projects_share_token ON public.projects(share_token);

-- Create function to set share token in session
CREATE OR REPLACE FUNCTION public.set_share_token(token TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.share_token', token, false);
END;
$$;

-- Drop existing public RLS policies on projects
DROP POLICY IF EXISTS "Public can manage projects" ON public.projects;
DROP POLICY IF EXISTS "Public can view projects" ON public.projects;

-- New RLS policies for projects table
CREATE POLICY "Users can view their own projects"
ON public.projects
FOR SELECT
USING (
  auth.uid() = created_by
);

CREATE POLICY "Anyone can insert projects"
ON public.projects
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Project owners can update their projects"
ON public.projects
FOR UPDATE
USING (
  auth.uid() = created_by OR
  share_token = current_setting('app.share_token', true)::uuid
);

CREATE POLICY "Project owners can delete their projects"
ON public.projects
FOR DELETE
USING (
  auth.uid() = created_by OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- Update RLS policies for canvas_nodes
DROP POLICY IF EXISTS "Public can manage canvas nodes" ON public.canvas_nodes;
DROP POLICY IF EXISTS "Public can view canvas nodes" ON public.canvas_nodes;

CREATE POLICY "Users can access canvas nodes"
ON public.canvas_nodes
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = canvas_nodes.project_id 
    AND (
      created_by = auth.uid() OR
      share_token = current_setting('app.share_token', true)::uuid
    )
  )
);

-- Update RLS policies for canvas_edges
DROP POLICY IF EXISTS "Public can manage canvas edges" ON public.canvas_edges;
DROP POLICY IF EXISTS "Public can view canvas edges" ON public.canvas_edges;

CREATE POLICY "Users can access canvas edges"
ON public.canvas_edges
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = canvas_edges.project_id 
    AND (
      created_by = auth.uid() OR
      share_token = current_setting('app.share_token', true)::uuid
    )
  )
);

-- Update RLS policies for requirements
DROP POLICY IF EXISTS "Public can manage requirements" ON public.requirements;
DROP POLICY IF EXISTS "Public can view requirements" ON public.requirements;

CREATE POLICY "Users can access requirements"
ON public.requirements
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = requirements.project_id 
    AND (
      created_by = auth.uid() OR
      share_token = current_setting('app.share_token', true)::uuid
    )
  )
);

-- Update RLS policies for activity_logs
DROP POLICY IF EXISTS "Public can manage activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Public can view activity logs" ON public.activity_logs;

CREATE POLICY "Users can access activity logs"
ON public.activity_logs
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = activity_logs.project_id 
    AND (
      created_by = auth.uid() OR
      share_token = current_setting('app.share_token', true)::uuid
    )
  )
);

-- Update RLS policies for audit_runs
DROP POLICY IF EXISTS "Public can manage audit runs" ON public.audit_runs;
DROP POLICY IF EXISTS "Public can view audit runs" ON public.audit_runs;

CREATE POLICY "Users can access audit runs"
ON public.audit_runs
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = audit_runs.project_id 
    AND (
      created_by = auth.uid() OR
      share_token = current_setting('app.share_token', true)::uuid
    )
  )
);

-- Update RLS policies for build_sessions
DROP POLICY IF EXISTS "Public can manage build sessions" ON public.build_sessions;
DROP POLICY IF EXISTS "Public can view build sessions" ON public.build_sessions;

CREATE POLICY "Users can access build sessions"
ON public.build_sessions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = build_sessions.project_id 
    AND (
      created_by = auth.uid() OR
      share_token = current_setting('app.share_token', true)::uuid
    )
  )
);

-- Update RLS policies for project_standards
DROP POLICY IF EXISTS "Public can manage project standards" ON public.project_standards;
DROP POLICY IF EXISTS "Public can view project standards" ON public.project_standards;

CREATE POLICY "Users can access project standards"
ON public.project_standards
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = project_standards.project_id 
    AND (
      created_by = auth.uid() OR
      share_token = current_setting('app.share_token', true)::uuid
    )
  )
);

-- Update RLS policies for project_tech_stacks
DROP POLICY IF EXISTS "Public can manage project tech stacks" ON public.project_tech_stacks;
DROP POLICY IF EXISTS "Public can view project tech stacks" ON public.project_tech_stacks;

CREATE POLICY "Users can access project tech stacks"
ON public.project_tech_stacks
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = project_tech_stacks.project_id 
    AND (
      created_by = auth.uid() OR
      share_token = current_setting('app.share_token', true)::uuid
    )
  )
);