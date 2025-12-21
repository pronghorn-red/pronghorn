import { useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { LinkedProjectCard } from "@/components/dashboard/LinkedProjectCard";
import { EnhancedCreateProjectDialog } from "@/components/dashboard/EnhancedCreateProjectDialog";
import { AddSharedProjectDialog } from "@/components/dashboard/AddSharedProjectDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, LogIn, AlertTriangle, Users, FolderOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useAnonymousProjects } from "@/hooks/useAnonymousProjects";
import { toast } from "sonner";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { projects: anonymousProjects, removeProject } = useAnonymousProjects();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("my-projects");
  // Fetch user's own projects
  const { data: projects = [], isLoading, refetch } = useQuery({
    queryKey: ['projects', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
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
        scope: p.scope,
        splashImageUrl: (p as any).splash_image_url,
      }));
    },
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always'
  });

  // Fetch linked projects (shared with user)
  const { data: linkedProjects = [], refetch: refetchLinked } = useQuery({
    queryKey: ['linked-projects', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.rpc('get_linked_projects');
      if (error) {
        console.error("Error loading linked projects:", error);
        return [];
      }
      return (data || []).map((p: any) => ({
        id: p.id,
        projectId: p.project_id,
        projectName: p.project_name,
        projectStatus: p.project_status,
        projectUpdatedAt: new Date(p.project_updated_at),
        role: p.role,
        isValid: p.is_valid,
        token: '', // We don't expose the token, but we have the project_id
      }));
    },
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always'
  });

  // Get token for linked project navigation
  const getLinkedProjectToken = async (projectId: string): Promise<string | null> => {
    const { data } = await supabase
      .from('profile_linked_projects')
      .select('token')
      .eq('project_id', projectId)
      .eq('user_id', user?.id)
      .single();
    return data?.token || null;
  };

  // Map anonymous projects to the same format
  const anonymousProjectCards = anonymousProjects
    .filter(p => p.shareToken)
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
      const { error } = await supabase.rpc('save_anonymous_project_to_user', {
        p_project_id: projectId,
        p_share_token: shareToken
      });
      if (error) {
        console.error("Error saving project:", error);
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      await queryClient.invalidateQueries({ queryKey: ['projects', user.id] });
      await refetch();
      removeProject(projectId);
      toast.success("Project saved to your account!");
    } catch (error) {
      console.error("Error saving project:", error);
      toast.error("Failed to save project to account. Please try again.");
    }
  };

  const handleLinkedProjectClick = async (projectId: string) => {
    const token = await getLinkedProjectToken(projectId);
    if (token) {
      navigate({ pathname: `/project/${projectId}/settings/t/${token}` });
    } else {
      toast.error("Could not find project token");
    }
  };

  return (
    <div className="min-h-screen bg-background">
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

        {user && (projects.length > 0 || linkedProjects.length > 0) && (
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
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

        {user && anonymousProjectCards.length > 0 && (
          <Alert className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Temporary Projects Found:</strong> Click "Save to Account" on any temporary project to add it to your account permanently.
            </AlertDescription>
          </Alert>
        )}

        {!user && anonymousProjectCards.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground">Sign in to see your projects, or create a new project above</p>
            <Button onClick={() => navigate("/auth")}>
              <LogIn className="h-4 w-4 mr-2" />
              Sign In or Create Account
            </Button>
          </div>
        ) : isLoading ? (
          <p className="text-center py-12 text-muted-foreground">Loading projects...</p>
        ) : (
          <>
            {/* Temporary Projects Section */}
            {anonymousProjectCards.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  Temporary Projects
                  <Badge variant="destructive" className="text-xs">Session Only</Badge>
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {anonymousProjectCards.map(p => (
                    <div key={p.projectId} className="relative">
                      <Badge variant="destructive" className="absolute -top-2 -right-2 z-10">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Temporary
                      </Badge>
                      <ProjectCard
                        {...p}
                        onClick={id => {
                          if (!p.shareToken) {
                            toast.error('This project is missing a share token. Please create a new project.');
                            return;
                          }
                          navigate({ pathname: `/project/${id}/settings/t/${p.shareToken}` });
                        }}
                        onUpdate={refetch}
                        isAnonymous={true}
                        shareToken={p.shareToken}
                        onSaveToAccount={user ? handleSaveProject : undefined}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tabbed Projects Section */}
            {user && (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="mb-6">
                  <TabsTrigger value="my-projects" className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" />
                    My Projects
                    {projects.length > 0 && (
                      <Badge variant="secondary" className="text-xs ml-1">{projects.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="shared-projects" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Shared Projects
                    {linkedProjects.length > 0 && (
                      <Badge variant="secondary" className="text-xs ml-1">{linkedProjects.length}</Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="my-projects">
                  {projects.length > 0 ? (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {projects.map(p => (
                        <ProjectCard
                          key={p.projectId}
                          {...p}
                          onClick={id => navigate({ pathname: `/project/${id}/settings` })}
                          onUpdate={refetch}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                      <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No projects yet</p>
                      <p className="text-xs mt-1">Create your first project to get started</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="shared-projects">
                  <div className="flex justify-end mb-4">
                    <AddSharedProjectDialog onSuccess={refetchLinked} />
                  </div>
                  {linkedProjects.length > 0 ? (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {linkedProjects.map((p: any) => (
                        <LinkedProjectCard
                          key={p.id}
                          projectId={p.projectId}
                          projectName={p.projectName}
                          projectStatus={p.projectStatus}
                          projectUpdatedAt={p.projectUpdatedAt}
                          role={p.role}
                          isValid={p.isValid}
                          token={p.token}
                          onClick={handleLinkedProjectClick}
                          onUnlink={refetchLinked}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No shared projects yet</p>
                      <p className="text-xs mt-1">When someone shares a project with you, add it here to access it from your dashboard</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}

            {!user && projects.length === 0 && anonymousProjectCards.length === 0 && (
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
