-- Make standard_categories org-specific and editable
ALTER TABLE public.standard_categories ADD COLUMN org_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.standard_categories ADD COLUMN created_by UUID;
ALTER TABLE public.standard_categories ADD COLUMN is_system BOOLEAN DEFAULT false;

-- Make standards org-specific and editable
ALTER TABLE public.standards ADD COLUMN org_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.standards ADD COLUMN created_by UUID;
ALTER TABLE public.standards ADD COLUMN is_system BOOLEAN DEFAULT false;

-- Create tech_stacks table
CREATE TABLE public.tech_stacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create tech_stack_standards junction table (links standards to tech stacks)
CREATE TABLE public.tech_stack_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_stack_id UUID REFERENCES public.tech_stacks(id) ON DELETE CASCADE NOT NULL,
  standard_id UUID REFERENCES public.standards(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(tech_stack_id, standard_id)
);

-- Create project_tech_stacks table (links tech stacks to projects)
CREATE TABLE public.project_tech_stacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  tech_stack_id UUID REFERENCES public.tech_stacks(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(project_id, tech_stack_id)
);

-- Enable RLS
ALTER TABLE public.tech_stacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tech_stack_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tech_stacks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tech_stacks
CREATE POLICY "Users can view tech stacks in their org"
  ON public.tech_stacks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.org_id = tech_stacks.org_id
        AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create tech stacks in their org"
  ON public.tech_stacks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.org_id = tech_stacks.org_id
        AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update tech stacks in their org"
  ON public.tech_stacks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.org_id = tech_stacks.org_id
        AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tech stacks in their org"
  ON public.tech_stacks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.org_id = tech_stacks.org_id
        AND profiles.user_id = auth.uid()
    )
  );

-- RLS Policies for tech_stack_standards
CREATE POLICY "Users can view tech stack standards"
  ON public.tech_stack_standards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tech_stacks
      JOIN profiles ON profiles.org_id = tech_stacks.org_id
      WHERE tech_stacks.id = tech_stack_standards.tech_stack_id
        AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage tech stack standards"
  ON public.tech_stack_standards FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tech_stacks
      JOIN profiles ON profiles.org_id = tech_stacks.org_id
      WHERE tech_stacks.id = tech_stack_standards.tech_stack_id
        AND profiles.user_id = auth.uid()
    )
  );

-- RLS Policies for project_tech_stacks
CREATE POLICY "Users can view project tech stacks"
  ON public.project_tech_stacks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      JOIN profiles ON profiles.org_id = projects.org_id
      WHERE projects.id = project_tech_stacks.project_id
        AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage project tech stacks"
  ON public.project_tech_stacks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects
      JOIN profiles ON profiles.org_id = projects.org_id
      WHERE projects.id = project_tech_stacks.project_id
        AND profiles.user_id = auth.uid()
    )
  );

-- Update RLS policies for standard_categories to allow org editing
DROP POLICY IF EXISTS "Standard categories are viewable by authenticated users" ON public.standard_categories;

CREATE POLICY "Users can view standard categories"
  ON public.standard_categories FOR SELECT
  USING (
    is_system = true OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.org_id = standard_categories.org_id
        AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create standard categories in their org"
  ON public.standard_categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.org_id = standard_categories.org_id
        AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update standard categories in their org"
  ON public.standard_categories FOR UPDATE
  USING (
    is_system = false AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.org_id = standard_categories.org_id
        AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete standard categories in their org"
  ON public.standard_categories FOR DELETE
  USING (
    is_system = false AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.org_id = standard_categories.org_id
        AND profiles.user_id = auth.uid()
    )
  );

-- Update RLS policies for standards to allow org editing
DROP POLICY IF EXISTS "Standards are viewable by authenticated users" ON public.standards;

CREATE POLICY "Users can view standards"
  ON public.standards FOR SELECT
  USING (
    is_system = true OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.org_id = standards.org_id
        AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create standards in their org"
  ON public.standards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.org_id = standards.org_id
        AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update standards in their org"
  ON public.standards FOR UPDATE
  USING (
    is_system = false AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.org_id = standards.org_id
        AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete standards in their org"
  ON public.standards FOR DELETE
  USING (
    is_system = false AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.org_id = standards.org_id
        AND profiles.user_id = auth.uid()
    )
  );

-- Add triggers for updated_at
CREATE TRIGGER update_tech_stacks_updated_at
  BEFORE UPDATE ON public.tech_stacks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_tech_stacks_org_id ON public.tech_stacks(org_id);
CREATE INDEX idx_tech_stack_standards_tech_stack ON public.tech_stack_standards(tech_stack_id);
CREATE INDEX idx_tech_stack_standards_standard ON public.tech_stack_standards(standard_id);
CREATE INDEX idx_project_tech_stacks_project ON public.project_tech_stacks(project_id);
CREATE INDEX idx_standard_categories_org_id ON public.standard_categories(org_id);
CREATE INDEX idx_standards_org_id ON public.standards(org_id);

-- Mark existing data as system standards
UPDATE public.standard_categories SET is_system = true WHERE org_id IS NULL;
UPDATE public.standards SET is_system = true WHERE org_id IS NULL;