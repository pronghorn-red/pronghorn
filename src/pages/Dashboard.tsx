import { useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { EnhancedCreateProjectDialog } from "@/components/dashboard/EnhancedCreateProjectDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, LogIn, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useAnonymousProjects } from "@/hooks/useAnonymousProjects";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { projects: anonymousProjects } = useAnonymousProjects();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: projects = [], isLoading, refetch } = useQuery({
    queryKey: ['projects', user?.id],
    queryFn: async () => {
      if (!user) {
        return [];
      }

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('created_by', user.id)
        .order('updated_at', { ascending: false });
      
      if (error) {
        console.error("Error loading projects:", error);
        return [];
      }
      
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

  // Map anonymous projects to the same format
  const anonymousProjectCards = anonymousProjects.map(p => ({
    projectId: p.id,
    projectName: p.name,
    lastUpdated: new Date(p.createdAt),
    status: 'DESIGN' as const,
    coverage: undefined,
    description: undefined,
    organization: undefined,
    budget: undefined,
    scope: undefined,
    isAnonymous: true,
    shareToken: p.shareToken
  }));

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      <main className="container px-4 md:px-6 py-6 md:py-8">
        <div className="flex flex-col md:flex-row justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">Projects</h1>
            <p className="text-sm md:text-base text-muted-foreground">Manage projects</p>
          </div>
          <div className="w-full md:w-auto">
            <EnhancedCreateProjectDialog />
          </div>
        </div>
        {user && projects.length > 0 && (
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              className="pl-9 w-full md:max-w-md text-sm md:text-base" 
            />
          </div>
        )}
        {!user && anonymousProjectCards.length > 0 && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Temporary Projects:</strong> These projects are stored in your browser session only. They will be lost when you close this tab. Sign in to save them permanently.
            </AlertDescription>
          </Alert>
        )}
        {!user && anonymousProjectCards.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground">Sign in to see your projects</p>
            <Button onClick={() => navigate("/auth")}>
              <LogIn className="h-4 w-4 mr-2" />
              Sign In or Create Account
            </Button>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground mb-2">Or continue without an account:</p>
              <EnhancedCreateProjectDialog />
            </div>
          </div>
        ) : isLoading ? (
          <p className="text-center py-12 text-muted-foreground">Loading projects...</p>
        ) : (
          <>
            {anonymousProjectCards.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  Temporary Projects
                  <Badge variant="destructive" className="text-xs">Session Only</Badge>
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {anonymousProjectCards.map((p) => (
                    <div key={p.projectId} className="relative">
                      <Badge variant="destructive" className="absolute -top-2 -right-2 z-10">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Temporary
                      </Badge>
                      <ProjectCard 
                        {...p} 
                        onClick={(id) => navigate(`/project/${id}/canvas?token=${p.shareToken}`)} 
                        onUpdate={refetch} 
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {projects.length > 0 && (
              <div>
                {anonymousProjectCards.length > 0 && <h2 className="text-lg font-semibold mb-4">Your Projects</h2>}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {projects.map((p) => <ProjectCard key={p.projectId} {...p} onClick={(id) => navigate(`/project/${id}/canvas`)} onUpdate={refetch} />)}
                </div>
              </div>
            )}
            {projects.length === 0 && anonymousProjectCards.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No projects yet. Create your first project to get started.</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
