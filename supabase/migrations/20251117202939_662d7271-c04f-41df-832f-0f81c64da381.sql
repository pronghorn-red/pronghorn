-- Create enum types for status values
create type project_status as enum ('DESIGN', 'AUDIT', 'BUILD');
create type requirement_type as enum ('EPIC', 'FEATURE', 'STORY', 'ACCEPTANCE_CRITERIA');
create type node_type as enum ('COMPONENT', 'API', 'DATABASE', 'SERVICE', 'WEBHOOK', 'FIREWALL', 'SECURITY', 'REQUIREMENT', 'STANDARD', 'TECH_STACK');
create type audit_severity as enum ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
create type build_status as enum ('RUNNING', 'COMPLETED', 'FAILED');

-- Organizations table
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- User profiles table
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  org_id uuid references public.organizations(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Projects table
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status project_status default 'DESIGN' not null,
  org_id uuid references public.organizations(id) on delete cascade not null,
  github_repo text,
  github_branch text default 'main',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Requirements table (hierarchical)
create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  parent_id uuid references public.requirements(id) on delete cascade,
  type requirement_type not null,
  title text not null,
  content text,
  order_index integer not null default 0,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Canvas nodes table
create table public.canvas_nodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  type node_type not null,
  position jsonb not null default '{"x": 0, "y": 0}'::jsonb,
  data jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Canvas edges table
create table public.canvas_edges (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  source_id uuid references public.canvas_nodes(id) on delete cascade not null,
  target_id uuid references public.canvas_nodes(id) on delete cascade not null,
  label text,
  created_at timestamp with time zone default now() not null
);

-- Audit runs table
create table public.audit_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  status build_status default 'RUNNING' not null,
  coverage_percent float,
  started_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone
);

-- Audit findings table
create table public.audit_findings (
  id uuid primary key default gen_random_uuid(),
  audit_run_id uuid references public.audit_runs(id) on delete cascade not null,
  requirement_id uuid references public.requirements(id) on delete set null,
  severity audit_severity not null,
  file_path text,
  line_number integer,
  message text not null,
  created_at timestamp with time zone default now() not null
);

-- Build sessions table
create table public.build_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  branch text not null,
  max_epochs integer not null default 10,
  current_epoch integer not null default 0,
  status build_status default 'RUNNING' not null,
  preview_url text,
  started_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone
);

-- Activity logs table
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  type text not null,
  message text not null,
  status text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now() not null
);

-- Enable Row Level Security
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.requirements enable row level security;
alter table public.canvas_nodes enable row level security;
alter table public.canvas_edges enable row level security;
alter table public.audit_runs enable row level security;
alter table public.audit_findings enable row level security;
alter table public.build_sessions enable row level security;
alter table public.activity_logs enable row level security;

-- RLS Policies for profiles
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = user_id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

-- RLS Policies for organizations
create policy "Users can view their organization"
  on public.organizations for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.org_id = organizations.id
      and profiles.user_id = auth.uid()
    )
  );

-- RLS Policies for projects
create policy "Users can view projects in their organization"
  on public.projects for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.org_id = projects.org_id
      and profiles.user_id = auth.uid()
    )
  );

create policy "Users can create projects in their organization"
  on public.projects for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.org_id = projects.org_id
      and profiles.user_id = auth.uid()
    )
  );

create policy "Users can update projects in their organization"
  on public.projects for update
  using (
    exists (
      select 1 from public.profiles
      where profiles.org_id = projects.org_id
      and profiles.user_id = auth.uid()
    )
  );

-- RLS Policies for requirements
create policy "Users can view requirements for accessible projects"
  on public.requirements for select
  using (
    exists (
      select 1 from public.projects
      join public.profiles on profiles.org_id = projects.org_id
      where projects.id = requirements.project_id
      and profiles.user_id = auth.uid()
    )
  );

create policy "Users can manage requirements for accessible projects"
  on public.requirements for all
  using (
    exists (
      select 1 from public.projects
      join public.profiles on profiles.org_id = projects.org_id
      where projects.id = requirements.project_id
      and profiles.user_id = auth.uid()
    )
  );

-- RLS Policies for canvas nodes
create policy "Users can view canvas nodes for accessible projects"
  on public.canvas_nodes for select
  using (
    exists (
      select 1 from public.projects
      join public.profiles on profiles.org_id = projects.org_id
      where projects.id = canvas_nodes.project_id
      and profiles.user_id = auth.uid()
    )
  );

create policy "Users can manage canvas nodes for accessible projects"
  on public.canvas_nodes for all
  using (
    exists (
      select 1 from public.projects
      join public.profiles on profiles.org_id = projects.org_id
      where projects.id = canvas_nodes.project_id
      and profiles.user_id = auth.uid()
    )
  );

-- RLS Policies for canvas edges
create policy "Users can view canvas edges for accessible projects"
  on public.canvas_edges for select
  using (
    exists (
      select 1 from public.projects
      join public.profiles on profiles.org_id = projects.org_id
      where projects.id = canvas_edges.project_id
      and profiles.user_id = auth.uid()
    )
  );

create policy "Users can manage canvas edges for accessible projects"
  on public.canvas_edges for all
  using (
    exists (
      select 1 from public.projects
      join public.profiles on profiles.org_id = projects.org_id
      where projects.id = canvas_edges.project_id
      and profiles.user_id = auth.uid()
    )
  );

-- RLS Policies for audit runs
create policy "Users can view audit runs for accessible projects"
  on public.audit_runs for select
  using (
    exists (
      select 1 from public.projects
      join public.profiles on profiles.org_id = projects.org_id
      where projects.id = audit_runs.project_id
      and profiles.user_id = auth.uid()
    )
  );

-- RLS Policies for audit findings
create policy "Users can view audit findings for accessible projects"
  on public.audit_findings for select
  using (
    exists (
      select 1 from public.audit_runs
      join public.projects on projects.id = audit_runs.project_id
      join public.profiles on profiles.org_id = projects.org_id
      where audit_runs.id = audit_findings.audit_run_id
      and profiles.user_id = auth.uid()
    )
  );

-- RLS Policies for build sessions
create policy "Users can view build sessions for accessible projects"
  on public.build_sessions for select
  using (
    exists (
      select 1 from public.projects
      join public.profiles on profiles.org_id = projects.org_id
      where projects.id = build_sessions.project_id
      and profiles.user_id = auth.uid()
    )
  );

-- RLS Policies for activity logs
create policy "Users can view activity logs for accessible projects"
  on public.activity_logs for select
  using (
    exists (
      select 1 from public.projects
      join public.profiles on profiles.org_id = projects.org_id
      where projects.id = activity_logs.project_id
      and profiles.user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers for updated_at
create trigger update_organizations_updated_at before update on public.organizations
  for each row execute function public.update_updated_at_column();

create trigger update_profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at_column();

create trigger update_projects_updated_at before update on public.projects
  for each row execute function public.update_updated_at_column();

create trigger update_requirements_updated_at before update on public.requirements
  for each row execute function public.update_updated_at_column();

create trigger update_canvas_nodes_updated_at before update on public.canvas_nodes
  for each row execute function public.update_updated_at_column();

-- Create indexes for performance
create index idx_profiles_user_id on public.profiles(user_id);
create index idx_profiles_org_id on public.profiles(org_id);
create index idx_projects_org_id on public.projects(org_id);
create index idx_requirements_project_id on public.requirements(project_id);
create index idx_requirements_parent_id on public.requirements(parent_id);
create index idx_canvas_nodes_project_id on public.canvas_nodes(project_id);
create index idx_canvas_edges_project_id on public.canvas_edges(project_id);
create index idx_audit_runs_project_id on public.audit_runs(project_id);
create index idx_audit_findings_audit_run_id on public.audit_findings(audit_run_id);
create index idx_build_sessions_project_id on public.build_sessions(project_id);
create index idx_activity_logs_project_id on public.activity_logs(project_id);