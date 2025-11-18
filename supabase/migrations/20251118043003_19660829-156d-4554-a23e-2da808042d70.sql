-- Fix RLS policies for audit_findings and requirement_standards to require project access

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Public can manage audit findings" ON public.audit_findings;
DROP POLICY IF EXISTS "Public can view audit findings" ON public.audit_findings;
DROP POLICY IF EXISTS "Public can manage requirement standards" ON public.requirement_standards;
DROP POLICY IF EXISTS "Public can view requirement standards" ON public.requirement_standards;

-- Create secure policies for audit_findings
CREATE POLICY "Users can access audit findings"
ON public.audit_findings
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM audit_runs
    JOIN projects ON projects.id = audit_runs.project_id
    WHERE audit_runs.id = audit_findings.audit_run_id
    AND (
      projects.created_by = auth.uid()
      OR projects.share_token = (current_setting('app.share_token', true))::uuid
    )
  )
);

-- Create secure policies for requirement_standards
CREATE POLICY "Users can access requirement standards"
ON public.requirement_standards
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM requirements
    JOIN projects ON projects.id = requirements.project_id
    WHERE requirements.id = requirement_standards.requirement_id
    AND (
      projects.created_by = auth.uid()
      OR projects.share_token = (current_setting('app.share_token', true))::uuid
    )
  )
);