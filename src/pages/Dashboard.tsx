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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useAnonymousProjects } from "@/hooks/useAnonymousProjects";
import { toast } from "sonner";
export default function Dashboard() {
  const navigate = useNavigate();
  const {
    user
  } = useAuth();
  const queryClient = useQueryClient();
  const {
    projects: anonymousProjects,
    removeProject
  } = useAnonymousProjects();
  const [searchQuery, setSearchQuery] = useState("");
  const {
    data: projects = [],
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['projects', user?.id],
    queryFn: async () => {
      if (!user) {
        return [];
      }
      const {
        data,
        error
      } = await supabase.from('projects').select('*').eq('created_by', user.id).order('updated_at', {
        ascending: false
      });
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
        scope: p.scope,
        shareToken: p.share_token
      }));
    },
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always' // Force refetch every time dashboard is visited
  });

  // Map anonymous projects to the same format
  const anonymousProjectCards = anonymousProjects.filter(p => p.shareToken) // Only show projects with valid tokens
  .map(p => ({
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
  const handleSaveProject = async (projectId: string, shareToken: string) => {
    if (!user) {
      toast.error("Please sign in to save this project");
      return;
    }
    try {
      // CRITICAL: Use token-based RPC to link anonymous project to user
      const {
        error
      } = await supabase.rpc('save_anonymous_project_to_user', {
        p_project_id: projectId,
        p_share_token: shareToken
      });
      if (error) {
        console.error("Error saving project:", error);
        throw error;
      }

      // Wait a moment for the database to propagate the update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Invalidate and refetch the projects query
      await queryClient.invalidateQueries({
        queryKey: ['projects', user.id]
      });
      await refetch();

      // Only remove from anonymous projects after confirming the update worked
      removeProject(projectId);
      toast.success("Project saved to your account!");
    } catch (error) {
      console.error("Error saving project:", error);
      toast.error("Failed to save project to account. Please try again.");
    }
  };
  return <div className="min-h-screen bg-background">
      <PrimaryNav />
      <main className="container px-4 md:px-6 py-6 md:py-8">
        <div className="flex flex-col md:flex-row justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-sm md:text-base text-muted-foreground">Manage your projects</p>
          </div>
          <div className="w-full md:w-auto">
            <EnhancedCreateProjectDialog />
          </div>
        </div>
        {user && projects.length > 0 && <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 w-full md:max-w-md text-sm md:text-base" />
          </div>}
        {!user && anonymousProjectCards.length > 0 && <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Temporary Projects:</strong> These projects are stored in your browser session only. They will be lost when you close this tab. Sign in to save them permanently.
            </AlertDescription>
          </Alert>}
        {user && anonymousProjectCards.length > 0 && <Alert className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Temporary Projects Found:</strong> Click "Save to Account" on any temporary project to add it to your account permanently.
            </AlertDescription>
          </Alert>}
        {!user && anonymousProjectCards.length === 0 ? <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground">Sign in to see your projects</p>
            <Button onClick={() => navigate("/auth")}>
              <LogIn className="h-4 w-4 mr-2" />
              Sign In or Create Account
            </Button>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground mb-2">Or continue without an account:</p>
              <EnhancedCreateProjectDialog />
            </div>
          </div> : isLoading ? <p className="text-center py-12 text-muted-foreground">Loading projects...</p> : <>
            {anonymousProjectCards.length > 0 && <div className="mb-8">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  Temporary Projects
                  <Badge variant="destructive" className="text-xs">Session Only</Badge>
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {anonymousProjectCards.map(p => <div key={p.projectId} className="relative">
                      <Badge variant="destructive" className="absolute -top-2 -right-2 z-10">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Temporary
                      </Badge>
                      <ProjectCard {...p} onClick={id => {
                console.log('[Dashboard] Navigating to anonymous project:', {
                  id,
                  token: p.shareToken
                });
                if (!p.shareToken) {
                  toast.error('This project is missing a share token. Please create a new project.');
                  return;
                }
                navigate({ pathname: `/project/${id}/canvas`, search: `token=${p.shareToken}` });
              }} onUpdate={refetch} isAnonymous={true} shareToken={p.shareToken} onSaveToAccount={user ? handleSaveProject : undefined} />
                    </div>)}
                </div>
              </div>}
            {projects.length > 0 && <div>
                {anonymousProjectCards.length > 0 && <h2 className="text-lg font-semibold mb-4">Your Projects</h2>}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {projects.map(p => <ProjectCard key={p.projectId} {...p} onClick={id => {
              const token = (p as any).shareToken;
              console.log('[Dashboard] Navigating to authenticated project:', {
                id,
                token
              });
              navigate({ pathname: `/project/${id}/canvas`, search: token ? `token=${token}` : undefined });
            }} onUpdate={refetch} />)}
                </div>
              </div>}
            {projects.length === 0 && anonymousProjectCards.length === 0 && <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No projects yet. Create your first project to get started.</p>
              </div>}
          </>}
      </main>
    </div>;
}