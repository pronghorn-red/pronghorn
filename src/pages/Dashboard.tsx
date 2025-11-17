import { useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { EnhancedCreateProjectDialog } from "@/components/dashboard/EnhancedCreateProjectDialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: projects = [], isLoading, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      
      return data.map(p => ({
        projectId: p.id,
        projectName: p.name,
        lastUpdated: new Date(p.updated_at),
        status: p.status,
        coverage: undefined,
        description: p.description,
        organization: p.organization,
        budget: p.budget,
        scope: p.scope
      }));
    }
  });

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      <main className="container px-6 py-8">
        <div className="flex justify-between mb-8">
          <div><h1 className="text-3xl font-bold mb-2">Projects</h1><p className="text-muted-foreground">Manage projects</p></div>
          <EnhancedCreateProjectDialog />
        </div>
        <div className="mb-6"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 max-w-md" /></div>
        {isLoading ? (
          <p className="text-center py-12 text-muted-foreground">Loading projects...</p>
        ) : projects.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map((p) => <ProjectCard key={p.projectId} {...p} onClick={(id) => navigate(`/project/${id}/canvas`)} onUpdate={refetch} />)}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No projects yet. Create your first project to get started.</p>
          </div>
        )}
      </main>
    </div>
  );
}
