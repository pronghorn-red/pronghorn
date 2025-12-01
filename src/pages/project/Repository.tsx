import { useState } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RepoCard } from "@/components/repository/RepoCard";
import { FileTree } from "@/components/repository/FileTree";
import { CreateRepoDialog } from "@/components/repository/CreateRepoDialog";
import { ManagePATDialog } from "@/components/repository/ManagePATDialog";
import { GitBranch, FileCode, Settings, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeRepos } from "@/hooks/useRealtimeRepos";
import { supabase } from "@/integrations/supabase/client";

export default function Repository() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<string>();
  const [managePATDialogOpen, setManagePATDialogOpen] = useState(false);
  const [selectedRepoForPAT, setSelectedRepoForPAT] = useState<{id: string; name: string} | null>(null);

  const { repos, loading, refetch } = useRealtimeRepos(projectId);

  const mockFiles = [
    {
      name: "src",
      path: "src",
      type: "folder" as const,
      children: [
        {
          name: "components",
          path: "src/components",
          type: "folder" as const,
          children: [
            { name: "Button.tsx", path: "src/components/Button.tsx", type: "file" as const },
            { name: "Card.tsx", path: "src/components/Card.tsx", type: "file" as const },
          ],
        },
        { name: "index.ts", path: "src/index.ts", type: "file" as const },
      ],
    },
    { name: "README.md", path: "README.md", type: "file" as const },
    { name: "package.json", path: "package.json", type: "file" as const },
  ];

  const handleCreateEmpty = async (name: string) => {
    if (!projectId) return;

    try {
      const { error } = await supabase.rpc("create_project_repo_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_organization: "pronghorn-red",
        p_repo: name,
        p_branch: "main",
        p_is_default: repos.length === 0, // First repo is default
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

      // If PAT provided, store it
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

  const handleFileSelect = (path: string) => {
    setSelectedFile(path);
    toast({
      title: "File selected",
      description: path,
    });
    // TODO: Load file content via RPC
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
      // Push to all repos
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
      // Pull from all repos
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>File Structure</CardTitle>
                      <CardDescription>
                        Browse project files and folders
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FileTree
                        files={mockFiles}
                        onFileSelect={handleFileSelect}
                        selectedPath={selectedFile}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>File Content</CardTitle>
                      <CardDescription>
                        {selectedFile || "Select a file to view its content"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {selectedFile ? (
                        <div className="bg-muted p-4 rounded-md font-mono text-sm">
                          <p className="text-muted-foreground">
                            File content will be displayed here
                          </p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-center py-8">
                          No file selected
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
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
