import { useState, useMemo } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { LinkedProjectCard } from "@/components/dashboard/LinkedProjectCard";
import { EnhancedCreateProjectDialog } from "@/components/dashboard/EnhancedCreateProjectDialog";
import { AddSharedProjectDialog } from "@/components/dashboard/AddSharedProjectDialog";
import { GalleryCard } from "@/components/gallery/GalleryCard";
import { GalleryPreviewDialog } from "@/components/gallery/GalleryPreviewDialog";
import { GalleryCloneDialog } from "@/components/gallery/GalleryCloneDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, LogIn, AlertTriangle, Users, FolderOpen, Sparkles, LayoutGrid, List, Image as ImageIcon, Eye, Copy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useAnonymousProjects } from "@/hooks/useAnonymousProjects";
import { toast } from "sonner";

interface PublishedProject {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string | null;
  tags: string[] | null;
  view_count: number | null;
  clone_count: number | null;
  published_at: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { projects: anonymousProjects, removeProject } = useAnonymousProjects();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("my-projects");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  
  // Gallery-specific state
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [previewProject, setPreviewProject] = useState<PublishedProject | null>(null);
  const [cloneProject, setCloneProject] = useState<PublishedProject | null>(null);

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
        projectDescription: p.project_description,
        projectSplashImageUrl: p.project_splash_image_url,
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

  // Fetch published projects for Gallery tab
  const { data: publishedProjects = [], isLoading: isLoadingGallery } = useQuery({
    queryKey: ["published-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_published_projects");
      if (error) {
        console.error("Error loading published projects:", error);
        return [];
      }
      return (data || []) as PublishedProject[];
    },
    staleTime: 60000,
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

  // Filter projects based on search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const query = searchQuery.toLowerCase();
    return projects.filter(p =>
      p.projectName.toLowerCase().includes(query) ||
      p.description?.toLowerCase().includes(query) ||
      p.organization?.toLowerCase().includes(query)
    );
  }, [projects, searchQuery]);

  const filteredLinkedProjects = useMemo(() => {
    if (!searchQuery.trim()) return linkedProjects;
    const query = searchQuery.toLowerCase();
    return linkedProjects.filter((p: any) =>
      p.projectName?.toLowerCase().includes(query) ||
      p.projectDescription?.toLowerCase().includes(query)
    );
  }, [linkedProjects, searchQuery]);

  // Gallery filters
  const galleryCategories = useMemo(() => {
    const cats = new Set<string>();
    publishedProjects.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats).sort();
  }, [publishedProjects]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    publishedProjects.forEach((p) => {
      p.tags?.forEach((t) => tagSet.add(t));
    });
    return Array.from(tagSet).sort();
  }, [publishedProjects]);

  const filteredGalleryProjects = useMemo(() => {
    return publishedProjects.filter((p) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower) ||
        p.tags?.some((t) => t.toLowerCase().includes(searchLower));
      const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [publishedProjects, searchQuery, categoryFilter]);

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

  const handleGalleryPreview = (project: PublishedProject) => {
    setPreviewProject(project);
  };

  const handleGalleryClone = (project: PublishedProject) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    setCloneProject(project);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Skip Navigation */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-foreground focus:text-background focus:rounded-lg"
      >
        Skip to main content
      </a>
      <PrimaryNav />
      <main role="main" id="main-content" className="container px-4 md:px-6 py-6 md:py-8">
        <div className="flex flex-col md:flex-row justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-sm md:text-base text-muted-foreground">Manage your projects</p>
          </div>
          <div className="w-full md:w-auto">
            <EnhancedCreateProjectDialog />
          </div>
        </div>

        {user && (projects.length > 0 || linkedProjects.length > 0 || publishedProjects.length > 0) && (
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1 md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 w-full text-sm md:text-base"
              />
            </div>
            
            {/* Category filter - only show for gallery tab */}
            {activeTab === "gallery" && (
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {galleryCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {/* View toggle */}
            <ToggleGroup 
              type="single" 
              value={viewMode} 
              onValueChange={(v) => v && setViewMode(v as "grid" | "list")}
              className="flex-shrink-0"
            >
              <ToggleGroupItem value="grid" aria-label="Grid view">
                <LayoutGrid className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List view">
                <List className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

        {/* Tag chips for gallery tab */}
        {activeTab === "gallery" && allTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {allTags.slice(0, 10).map((tag) => (
              <Badge
                key={tag}
                variant={searchQuery === tag ? "default" : "outline"}
                className="cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => setSearchQuery(searchQuery === tag ? "" : tag)}
              >
                {tag}
              </Badge>
            ))}
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
                <div className={viewMode === "grid" 
                  ? "grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                  : "space-y-3"
                }>
                  {anonymousProjectCards.map(p => (
                    <div key={p.projectId} className="relative">
                      {viewMode === "grid" && (
                        <Badge variant="destructive" className="absolute -top-2 -right-2 z-10">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Temporary
                        </Badge>
                      )}
                      <ProjectCard
                        {...p}
                        variant={viewMode}
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
                  <TabsTrigger value="my-projects" className="flex items-center gap-1 sm:gap-2">
                    <FolderOpen className="h-4 w-4" />
                    <span className="sm:hidden">Projects</span>
                    <span className="hidden sm:inline">My Projects</span>
                    {projects.length > 0 && (
                      <Badge variant="secondary" className="text-xs ml-1">{projects.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="shared-projects" className="flex items-center gap-1 sm:gap-2">
                    <Users className="h-4 w-4" />
                    <span className="sm:hidden">Shared</span>
                    <span className="hidden sm:inline">Shared Projects</span>
                    {linkedProjects.length > 0 && (
                      <Badge variant="secondary" className="text-xs ml-1">{linkedProjects.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="gallery" className="flex items-center gap-1 sm:gap-2">
                    <Sparkles className="h-4 w-4" />
                    Gallery
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="my-projects">
                  {filteredProjects.length > 0 ? (
                    <div className={viewMode === "grid" 
                      ? "grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                      : "space-y-3"
                    }>
                      {filteredProjects.map(p => (
                        <ProjectCard
                          key={p.projectId}
                          {...p}
                          variant={viewMode}
                          onClick={id => navigate({ pathname: `/project/${id}/settings` })}
                          onUpdate={refetch}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                      <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{searchQuery ? "No matching projects" : "No projects yet"}</p>
                      <p className="text-xs mt-1">{searchQuery ? "Try a different search" : "Create your first project to get started"}</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="shared-projects">
                  <div className="flex justify-end mb-4">
                    <AddSharedProjectDialog onSuccess={refetchLinked} />
                  </div>
                  {filteredLinkedProjects.length > 0 ? (
                    <div className={viewMode === "grid" 
                      ? "grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                      : "space-y-3"
                    }>
                      {filteredLinkedProjects.map((p: any) => (
                        <LinkedProjectCard
                          key={p.id}
                          projectId={p.projectId}
                          projectName={p.projectName}
                          projectStatus={p.projectStatus}
                          projectUpdatedAt={p.projectUpdatedAt}
                          projectDescription={p.projectDescription}
                          projectSplashImageUrl={p.projectSplashImageUrl}
                          role={p.role}
                          isValid={p.isValid}
                          token={p.token}
                          variant={viewMode}
                          onClick={handleLinkedProjectClick}
                          onUnlink={refetchLinked}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{searchQuery ? "No matching shared projects" : "No shared projects yet"}</p>
                      <p className="text-xs mt-1">{searchQuery ? "Try a different search" : "When someone shares a project with you, add it here to access it from your dashboard"}</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="gallery">
                  {/* Login prompt for non-authenticated users */}
                  {!user && (
                    <Alert className="mb-6">
                      <LogIn className="h-4 w-4" />
                      <AlertDescription className="flex items-center justify-between">
                        <span>Sign in to clone projects to your account</span>
                        <Button variant="outline" size="sm" onClick={() => navigate("/auth")}>
                          Sign In
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}

                  {isLoadingGallery ? (
                    <div className={`grid gap-6 ${viewMode === "grid" ? "md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : ""}`}>
                      {[...Array(8)].map((_, i) => (
                        <div key={i} className="space-y-3">
                          <Skeleton className="aspect-video w-full" />
                          <Skeleton className="h-6 w-3/4" />
                          <Skeleton className="h-4 w-full" />
                        </div>
                      ))}
                    </div>
                  ) : filteredGalleryProjects.length === 0 ? (
                    <div className="text-center py-16">
                      <ImageIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
                      <h3 className="text-lg font-semibold mb-2">No projects found</h3>
                      <p className="text-muted-foreground">
                        {searchQuery || categoryFilter !== "all"
                          ? "Try adjusting your search or filters"
                          : "No projects have been published yet"}
                      </p>
                    </div>
                  ) : viewMode === "grid" ? (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {filteredGalleryProjects.map((project) => (
                        <GalleryCard
                          key={project.id}
                          id={project.id}
                          name={project.name}
                          description={project.description}
                          imageUrl={project.image_url}
                          category={project.category}
                          tags={project.tags}
                          viewCount={project.view_count || 0}
                          cloneCount={project.clone_count || 0}
                          onPreview={() => handleGalleryPreview(project)}
                          onClone={() => handleGalleryClone(project)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredGalleryProjects.map((project) => (
                        <div
                          key={project.id}
                          className="flex gap-4 p-4 rounded-lg border bg-card hover:shadow-md transition-shadow"
                        >
                          <div className="w-32 h-20 rounded-md overflow-hidden bg-muted flex-shrink-0">
                            {project.image_url ? (
                              <img
                                src={project.image_url}
                                alt={project.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg line-clamp-1">{project.name}</h3>
                            {project.description && (
                              <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                                {project.description}
                              </p>
                            )}
                            <div className="flex items-center gap-4">
                              {project.category && (
                                <Badge variant="secondary">{project.category}</Badge>
                              )}
                              {project.tags?.slice(0, 3).map((tag) => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Eye className="h-3 w-3" />
                                {project.view_count || 0}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Copy className="h-3 w-3" />
                                {project.clone_count || 0}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleGalleryPreview(project)}>
                              Preview
                            </Button>
                            <Button size="sm" onClick={() => handleGalleryClone(project)}>
                              Clone
                            </Button>
                          </div>
                        </div>
                      ))}
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

      {/* Gallery Preview Dialog */}
      {previewProject && (
        <GalleryPreviewDialog
          open={!!previewProject}
          onOpenChange={(open) => !open && setPreviewProject(null)}
          publishedId={previewProject.id}
          name={previewProject.name}
          description={previewProject.description}
          imageUrl={previewProject.image_url}
          tags={previewProject.tags}
          onClone={() => {
            setPreviewProject(null);
            handleGalleryClone(previewProject);
          }}
        />
      )}

      {/* Gallery Clone Dialog */}
      {cloneProject && (
        <GalleryCloneDialog
          open={!!cloneProject}
          onOpenChange={(open) => !open && setCloneProject(null)}
          publishedId={cloneProject.id}
          projectName={cloneProject.name}
        />
      )}
    </div>
  );
}
