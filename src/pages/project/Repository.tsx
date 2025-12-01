import { useState, useEffect } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RepoCard } from "@/components/repository/RepoCard";
import { FileTree } from "@/components/repository/FileTree";
import { CodeEditor } from "@/components/repository/CodeEditor";
import { CreateRepoDialog } from "@/components/repository/CreateRepoDialog";
import { ManagePATDialog } from "@/components/repository/ManagePATDialog";
import { GitBranch, FileCode, Settings, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeRepos } from "@/hooks/useRealtimeRepos";
import { supabase } from "@/integrations/supabase/client";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
}

export default function Repository() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");
  const { toast } = useToast();
  const [managePATDialogOpen, setManagePATDialogOpen] = useState(false);
  const [selectedRepoForPAT, setSelectedRepoForPAT] = useState<{id: string; name: string} | null>(null);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [fileStructure, setFileStructure] = useState<FileNode[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const { repos, loading, refetch } = useRealtimeRepos(projectId);

  useEffect(() => {
    if (repos.length > 0 && !selectedRepoId) {
      const defaultRepo = repos.find(r => r.is_default) || repos[0];
      setSelectedRepoId(defaultRepo.id);
    }
  }, [repos, selectedRepoId]);

  useEffect(() => {
    if (selectedRepoId) {
      loadFileStructure();
    }
  }, [selectedRepoId]);

  const loadFileStructure = async () => {
    if (!selectedRepoId) return;
    
    setLoadingFiles(true);
    try {
      const { data, error } = await supabase.rpc("get_file_structure_with_token", {
        p_repo_id: selectedRepoId,
        p_token: shareToken || null,
      });

      if (error) throw error;

      const tree = buildFileTree((data as any[]) || []);
      setFileStructure(tree);
    } catch (error) {
      console.error("Error loading file structure:", error);
      toast({
        title: "Error",
        description: "Failed to load file structure",
        variant: "destructive",
      });
    } finally {
      setLoadingFiles(false);
    }
  };

  const buildFileTree = (files: any[]): FileNode[] => {
    const root: FileNode[] = [];
    const map: Record<string, FileNode> = {};

    files.sort((a, b) => a.path.localeCompare(b.path));

    files.forEach((file) => {
      const parts = file.path.split("/");
      let currentLevel = root;
      let currentPath = "";

      parts.forEach((part, index) => {
        currentPath += (currentPath ? "/" : "") + part;
        
        if (!map[currentPath]) {
          const node: FileNode = {
            name: part,
            path: currentPath,
            type: index === parts.length - 1 ? "file" : "folder",
            children: index === parts.length - 1 ? undefined : [],
          };
          
          map[currentPath] = node;
          currentLevel.push(node);
          
          if (node.children) {
            currentLevel = node.children;
          }
        } else {
          if (map[currentPath].children) {
            currentLevel = map[currentPath].children!;
          }
        }
      });
    });

    return root;
  };

  const handleFileSelect = async (path: string) => {
    setSelectedFilePath(path);
    
    try {
      const { data, error } = await supabase.rpc("get_file_structure_with_token", {
        p_repo_id: selectedRepoId,
        p_token: shareToken || null,
      });

      if (error) throw error;
      
      const files = (data as any[]) || [];
      const file = files.find((f: any) => f.path === path);
      if (file) {
        setSelectedFileId(file.id);
      }
    } catch (error) {
      console.error("Error finding file:", error);
    }
  };

  const handleCreateEmpty = async (name: string) => {
    if (!projectId) return;

    try {
      const { error } = await supabase.rpc("create_project_repo_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_organization: "pronghorn-red",
        p_repo: name,
        p_branch: "main",
        p_is_default: repos.length === 0,
      });

      if (error) throw error;

      toast({
        title: "Repository created",
        description: `Created empty repository: pronghorn-red/${name}`,
      });

      refetch();
    } catch (error: any) {
      console.error("Error creating repo:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create repository",
        variant: "destructive",
      });
    }
  };

  const handleCreateFromTemplate = async (name: string, templateOrg: string, templateRepo: string) => {
    if (!projectId) return;

    try {
      const { error } = await supabase.rpc("create_project_repo_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_organization: "pronghorn-red",
        p_repo: name,
        p_branch: "main",
        p_is_default: repos.length === 0,
      });

      if (error) throw error;

      toast({
        title: "Repository created from template",
        description: `Cloning ${templateOrg}/${templateRepo} to ${name}`,
      });

      refetch();
    } catch (error: any) {
      console.error("Error creating repo:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create repository from template",
        variant: "destructive",
      });
    }
  };

  const handleLinkExisting = async (org: string, repo: string, branch: string, pat?: string) => {
    if (!projectId) return;

    try {
      const { data, error } = await supabase.rpc("create_project_repo_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_organization: org,
        p_repo: repo,
        p_branch: branch,
        p_is_default: false,
      });

      if (error) throw error;

      if (pat && data) {
        const { error: patError } = await supabase.rpc("insert_repo_pat_with_token", {
          p_repo_id: data.id,
          p_pat: pat,
        });

        if (patError) {
          console.error("Error storing PAT:", patError);
          toast({
            title: "Repository linked, but PAT not saved",
            description: "Repository was linked successfully, but there was an error storing the PAT",
            variant: "destructive",
          });
          return;
        }
      }

      toast({
        title: "Repository linked",
        description: `Linked ${org}/${repo} (${branch})`,
      });

      refetch();
    } catch (error: any) {
      console.error("Error linking repo:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to link repository",
        variant: "destructive",
      });
    }
  };

  const handleDeleteRepo = async (repoId: string) => {
    try {
      const { error } = await supabase.rpc("delete_project_repo_with_token", {
        p_repo_id: repoId,
        p_token: shareToken || null,
      });

      if (error) throw error;

      toast({
        title: "Repository removed",
        description: "Repository has been unlinked from this project",
      });

      refetch();
    } catch (error: any) {
      console.error("Error deleting repo:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to remove repository",
        variant: "destructive",
      });
    }
  };

  const handleManagePAT = (repoId: string) => {
    const repo = repos.find(r => r.id === repoId);
    if (repo) {
      setSelectedRepoForPAT({
        id: repo.id,
        name: `${repo.organization}/${repo.repo}`
      });
      setManagePATDialogOpen(true);
    }
  };

  const handleSync = async () => {
    if (repos.length === 0) {
      toast({
        title: "No repositories",
        description: "Please add a repository first",
        variant: "destructive",
      });
      return;
    }

    try {
      const pushPromises = repos.map(async (repo) => {
        const { data, error } = await supabase.functions.invoke('sync-repo-push', {
          body: {
            repoId: repo.id,
            projectId: projectId,
            shareToken: shareToken,
            commitMessage: `Sync from Pronghorn at ${new Date().toISOString()}`,
          },
        });

        if (error) throw error;
        return { repo: `${repo.organization}/${repo.repo}`, ...data };
      });

      const results = await Promise.all(pushPromises);

      toast({
        title: "Sync complete",
        description: `Pushed to ${results.length} repository(ies)`,
      });
    } catch (error: any) {
      console.error("Sync error:", error);
      toast({
        title: "Sync failed",
        description: error.message || "Failed to sync repositories",
        variant: "destructive",
      });
    }
  };

  const handlePull = async () => {
    if (repos.length === 0) {
      toast({
        title: "No repositories",
        description: "Please add a repository first",
        variant: "destructive",
      });
      return;
    }

    try {
      const pullPromises = repos.map(async (repo) => {
        const { data, error } = await supabase.functions.invoke('sync-repo-pull', {
          body: {
            repoId: repo.id,
            projectId: projectId,
            shareToken: shareToken,
          },
        });

        if (error) throw error;
        return { repo: `${repo.organization}/${repo.repo}`, ...data };
      });

      const results = await Promise.all(pullPromises);

      toast({
        title: "Pull complete",
        description: `Pulled from ${results.length} repository(ies)`,
      });
      
      // Reload file structure after pull
      loadFileStructure();
    } catch (error: any) {
      console.error("Pull error:", error);
      toast({
        title: "Pull failed",
        description: error.message || "Failed to pull from repositories",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      
      <div className="flex relative">
        <ProjectSidebar projectId={projectId!} />
        
        <main className="flex-1 w-full">
          <div className="container px-6 py-8 max-w-7xl">
            <div className="mb-6">
              <h1 className="text-3xl font-bold mb-2">Repository</h1>
              <p className="text-muted-foreground">
                Manage GitHub repositories, files, and synchronization
              </p>
            </div>

            <Tabs defaultValue="repos" className="space-y-6">
              <TabsList>
                <TabsTrigger value="repos" className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  Repositories
                </TabsTrigger>
                <TabsTrigger value="files" className="flex items-center gap-2">
                  <FileCode className="h-4 w-4" />
                  Files
                </TabsTrigger>
                <TabsTrigger value="sync" className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Sync
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Settings
                </TabsTrigger>
              </TabsList>

              <TabsContent value="repos" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Connected Repositories</CardTitle>
                        <CardDescription>
                          Repositories linked to this project
                        </CardDescription>
                      </div>
                      <CreateRepoDialog
                        onCreateEmpty={handleCreateEmpty}
                        onCreateFromTemplate={handleCreateFromTemplate}
                        onLinkExisting={handleLinkExisting}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {loading ? (
                      <p className="text-muted-foreground text-center py-4">Loading repositories...</p>
                    ) : repos.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">No repositories connected</p>
                    ) : (
                      repos.map((repo) => (
                        <RepoCard
                          key={repo.id}
                          repo={repo}
                          onDelete={handleDeleteRepo}
                          onManagePAT={handleManagePAT}
                        />
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="files" className="space-y-6">
                {selectedRepoId ? (
                  <Card className="p-0 overflow-hidden">
                    <ResizablePanelGroup direction="horizontal" className="h-[600px]">
                      <ResizablePanel defaultSize={25} minSize={15}>
                        <div className="h-full border-r border-border">
                          <div className="p-4 border-b border-border">
                            <h3 className="font-semibold">Files</h3>
                          </div>
                          {loadingFiles ? (
                            <div className="flex items-center justify-center h-full">
                              Loading files...
                            </div>
                          ) : (
                            <FileTree
                              files={fileStructure}
                              onFileSelect={handleFileSelect}
                              selectedPath={selectedFilePath}
                            />
                          )}
                        </div>
                      </ResizablePanel>
                      <ResizableHandle />
                      <ResizablePanel defaultSize={75}>
                        <CodeEditor
                          fileId={selectedFileId}
                          filePath={selectedFilePath}
                          repoId={selectedRepoId}
                          onClose={() => {
                            setSelectedFilePath(null);
                            setSelectedFileId(null);
                          }}
                          onSave={loadFileStructure}
                        />
                      </ResizablePanel>
                    </ResizablePanelGroup>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="py-8">
                      <p className="text-muted-foreground text-center">
                        Please add a repository first to browse files
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="sync" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Synchronization</CardTitle>
                    <CardDescription>
                      Push and pull changes between database and GitHub
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-4">
                      <Button onClick={handleSync}>
                        Push to GitHub
                      </Button>
                      <Button variant="outline" onClick={handlePull}>
                        Pull from GitHub
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Push changes from database to GitHub, or pull latest changes from GitHub to database
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="settings" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Repository Settings</CardTitle>
                    <CardDescription>
                      Configure repository behavior and access
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      Settings panel coming soon
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {selectedRepoForPAT && (
        <ManagePATDialog
          repoId={selectedRepoForPAT.id}
          repoName={selectedRepoForPAT.name}
          open={managePATDialogOpen}
          onOpenChange={setManagePATDialogOpen}
        />
      )}
    </div>
  );
}
