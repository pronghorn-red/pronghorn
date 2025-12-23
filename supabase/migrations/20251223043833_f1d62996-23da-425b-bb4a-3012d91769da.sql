-- Create resource_type enum
CREATE TYPE public.resource_type AS ENUM ('file', 'website', 'youtube', 'image');

-- Create build_books table
CREATE TABLE public.build_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_description text,
  long_description text,
  cover_image_url text,
  tags text[] DEFAULT '{}',
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create build_book_standards junction table
CREATE TABLE public.build_book_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_book_id uuid NOT NULL REFERENCES public.build_books(id) ON DELETE CASCADE,
  standard_category_id uuid NOT NULL REFERENCES public.standard_categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(build_book_id, standard_category_id)
);

-- Create build_book_tech_stacks junction table
CREATE TABLE public.build_book_tech_stacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_book_id uuid NOT NULL REFERENCES public.build_books(id) ON DELETE CASCADE,
  tech_stack_id uuid NOT NULL REFERENCES public.tech_stacks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(build_book_id, tech_stack_id)
);

-- Create standard_resources table (enhanced attachments)
CREATE TABLE public.standard_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id uuid REFERENCES public.standards(id) ON DELETE CASCADE,
  standard_category_id uuid REFERENCES public.standard_categories(id) ON DELETE CASCADE,
  resource_type resource_type NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  description text,
  thumbnail_url text,
  order_index integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT standard_resources_one_parent CHECK (
    (standard_id IS NOT NULL AND standard_category_id IS NULL) OR
    (standard_id IS NULL AND standard_category_id IS NOT NULL)
  )
);

-- Create tech_stack_resources table (only linked to tech_stacks, no items table exists)
CREATE TABLE public.tech_stack_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_stack_id uuid NOT NULL REFERENCES public.tech_stacks(id) ON DELETE CASCADE,
  resource_type resource_type NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  description text,
  thumbnail_url text,
  order_index integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add short_description and long_description to standards
ALTER TABLE public.standards 
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS long_description text;

-- Add short_description and long_description to standard_categories
ALTER TABLE public.standard_categories
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS long_description text;

-- Add short_description and long_description to tech_stacks
ALTER TABLE public.tech_stacks
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS long_description text;

-- Create indexes for performance
CREATE INDEX idx_build_books_org_id ON public.build_books(org_id);
CREATE INDEX idx_build_books_is_published ON public.build_books(is_published);
CREATE INDEX idx_build_book_standards_build_book_id ON public.build_book_standards(build_book_id);
CREATE INDEX idx_build_book_tech_stacks_build_book_id ON public.build_book_tech_stacks(build_book_id);
CREATE INDEX idx_standard_resources_standard_id ON public.standard_resources(standard_id);
CREATE INDEX idx_standard_resources_category_id ON public.standard_resources(standard_category_id);
CREATE INDEX idx_tech_stack_resources_tech_stack_id ON public.tech_stack_resources(tech_stack_id);

-- Enable RLS on all new tables
ALTER TABLE public.build_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_book_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_book_tech_stacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tech_stack_resources ENABLE ROW LEVEL SECURITY;

-- RLS Policies for build_books
CREATE POLICY "Anyone can view published build books"
  ON public.build_books FOR SELECT
  USING (is_published = true);

CREATE POLICY "Admins can view all build books"
  ON public.build_books FOR SELECT
  USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can insert build books"
  ON public.build_books FOR INSERT
  WITH CHECK (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can update build books"
  ON public.build_books FOR UPDATE
  USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can delete build books"
  ON public.build_books FOR DELETE
  USING (public.is_admin_or_superadmin(auth.uid()));

-- RLS Policies for build_book_standards
CREATE POLICY "Anyone can view build book standards for published books"
  ON public.build_book_standards FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.build_books bb
    WHERE bb.id = build_book_id AND bb.is_published = true
  ));

CREATE POLICY "Admins can view all build book standards"
  ON public.build_book_standards FOR SELECT
  USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage build book standards"
  ON public.build_book_standards FOR ALL
  USING (public.is_admin_or_superadmin(auth.uid()));

-- RLS Policies for build_book_tech_stacks
CREATE POLICY "Anyone can view build book tech stacks for published books"
  ON public.build_book_tech_stacks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.build_books bb
    WHERE bb.id = build_book_id AND bb.is_published = true
  ));

CREATE POLICY "Admins can view all build book tech stacks"
  ON public.build_book_tech_stacks FOR SELECT
  USING (public.is_admin_or_superadmin(auth.uid()));

CREATE POLICY "Admins can manage build book tech stacks"
  ON public.build_book_tech_stacks FOR ALL
  USING (public.is_admin_or_superadmin(auth.uid()));

-- RLS Policies for standard_resources
CREATE POLICY "Anyone can view standard resources"
  ON public.standard_resources FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage standard resources"
  ON public.standard_resources FOR ALL
  USING (public.is_admin_or_superadmin(auth.uid()));

-- RLS Policies for tech_stack_resources
CREATE POLICY "Anyone can view tech stack resources"
  ON public.tech_stack_resources FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage tech stack resources"
  ON public.tech_stack_resources FOR ALL
  USING (public.is_admin_or_superadmin(auth.uid()));

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add updated_at triggers
CREATE TRIGGER update_build_books_updated_at
  BEFORE UPDATE ON public.build_books
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_standard_resources_updated_at
  BEFORE UPDATE ON public.standard_resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tech_stack_resources_updated_at
  BEFORE UPDATE ON public.tech_stack_resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();