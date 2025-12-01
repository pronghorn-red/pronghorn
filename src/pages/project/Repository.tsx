import { useState, useEffect } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RepoCard } from "@/components/repository/RepoCard";
import { EnhancedFileTree } from "@/components/repository/EnhancedFileTree";
import { CodeEditor } from "@/components/repository/CodeEditor";
import { CreateRepoDialog } from "@/components/repository/CreateRepoDialog";
import { ManagePATDialog } from "@/components/repository/ManagePATDialog";
import { IDEModal } from "@/components/repository/IDEModal";
import { GitBranch, FileCode, Settings, Database, Maximize2 } from "lucide-react";
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
  const [syncStatus, setSyncStatus] = useState<{ [key: string]: 'idle' | 'pushing' | 'pulling' | 'success' | 'error' }>({});
  const [lastSyncTime, setLastSyncTime] = useState<{ [key: string]: Date }>({});
  const [ideModalOpen, setIdeModalOpen] = useState(false);

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

  const handleCreateEmpty = async (name: string) => {
    if (!projectId) return;
    
    try {
      const { error } = await supabase.functions.invoke('create-empty-repo', {
        body: {
          projectId,
          repoName: name,
          shareToken: shareToken || null
        }
      });

      if (error) throw error;

      toast({
        title: "Repository created",
        description: "Empty repository created successfully",
      });
      refetch();
    } catch (error) {
      console.error('Error creating empty repository:', error);
      toast({
        title: "Error",
        description: "Failed to create empty repository",
        variant: "destructive",
      });
    }
  };

  const handleCreateFromTemplate = async (name: string, templateOrg: string, templateRepo: string) => {
    if (!projectId) return;
    
    try {
      const { error } = await supabase.functions.invoke('create-repo-from-template', {
        body: {
          projectId,
          repoName: name,
          templateOrg,
          templateRepo,
          shareToken: shareToken || null
        }
      });

      if (error) throw error;

      toast({
        title: "Repository created",
        description: "Repository created from template successfully",
      });
      refetch();
    } catch (error) {
      console.error('Error creating repository from template:', error);
      toast({
        title: "Error",
        description: "Failed to create repository from template",
        variant: "destructive",
      });
    }
  };

  const handleLinkExisting = async (org: string, repo: string, branch: string, pat?: string) => {
    if (!projectId) return;
    
    try {
      const { error } = await supabase.functions.invoke('link-existing-repo', {
        body: {
          projectId,
          organization: org,
          repo,
          branch,
          pat,
          shareToken: shareToken || null
        }
      });

      if (error) throw error;

      toast({
        title: "Repository linked",
        description: "Repository linked successfully",
      });
      refetch();
    } catch (error) {
      console.error('Error linking repository:', error);
      toast({
        title: "Error",
        description: "Failed to link repository",
        variant: "destructive",
      });
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
      // Set all repos to pushing status
      const statusUpdates: { [key: string]: 'pushing' } = {};
      repos.forEach(repo => {
        statusUpdates[repo.id] = 'pushing';
      });
      setSyncStatus(statusUpdates);

      const pushPromises = repos.map(async (repo) => {
        try {
          const { data, error } = await supabase.functions.invoke('sync-repo-push', {
            body: {
              repoId: repo.id,
              projectId: projectId,
              shareToken: shareToken,
              commitMessage: `Sync from Pronghorn at ${new Date().toISOString()}`,
            },
          });

          if (error) throw error;

          // Update status to success
          setSyncStatus(prev => ({ ...prev, [repo.id]: 'success' }));
          setLastSyncTime(prev => ({ ...prev, [repo.id]: new Date() }));
          
          return { repo: `${repo.organization}/${repo.repo}`, success: true, ...data };
        } catch (err) {
          // Update status to error
          setSyncStatus(prev => ({ ...prev, [repo.id]: 'error' }));
          throw err;
        }
      });

      const results = await Promise.allSettled(pushPromises);
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed === 0) {
        toast({
          title: "Sync complete",
          description: `Successfully pushed to ${successful} repository(ies)`,
        });
      } else {
        toast({
          title: "Sync completed with errors",
          description: `Pushed to ${successful} repository(ies), ${failed} failed`,
          variant: "destructive",
        });
      }

      // Reset status after delay
      setTimeout(() => {
        setSyncStatus({});
      }, 3000);
    } catch (error: any) {
      console.error("Sync error:", error);
      toast({
        title: "Sync failed",
        description: error.message || "Failed to sync repositories",
        variant: "destructive",
      });
      setSyncStatus({});
    }
  };

  const handleFileCreate = async (path: string, isFolder: boolean) => {
    if (!selectedRepoId) return;

    try {
      if (isFolder) {
        // Create a .gitkeep file in the folder
        await supabase.rpc("create_file_with_token", {
          p_repo_id: selectedRepoId,
          p_path: `${path}/.gitkeep`,
          p_content: "",
          p_token: shareToken || null,
        });
      } else {
        await supabase.rpc("create_file_with_token", {
          p_repo_id: selectedRepoId,
          p_path: path,
          p_content: "",
          p_token: shareToken || null,
        });
      }

      toast({
        title: "Success",
        description: `${isFolder ? "Folder" : "File"} created successfully`,
      });
      loadFileStructure();
    } catch (error: any) {
      console.error("Error creating file/folder:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create file/folder",
        variant: "destructive",
      });
    }
  };

  const handleFileRename = async (oldPath: string, newPath: string) => {
    if (!selectedRepoId) return;

    try {
      // Get file structure to find the file ID
      const { data, error } = await supabase.rpc("get_file_structure_with_token", {
        p_repo_id: selectedRepoId,
        p_token: shareToken || null,
      });

      if (error) throw error;

      const files = (data as any[]) || [];
      const file = files.find((f: any) => f.path === oldPath);

      if (file) {
        // Check if it's a folder (has children)
        const isFolder = files.some((f: any) => f.path.startsWith(oldPath + "/"));

        if (isFolder) {
          // Rename folder (updates all files within)
          await supabase.rpc("rename_folder_with_token", {
            p_repo_id: selectedRepoId,
            p_old_folder_path: oldPath,
            p_new_folder_path: newPath,
            p_token: shareToken || null,
          });
        } else {
          // Rename single file
          await supabase.rpc("rename_file_with_token", {
            p_file_id: file.id,
            p_new_path: newPath,
            p_token: shareToken || null,
          });
        }

        toast({
          title: "Success",
          description: "Renamed successfully",
        });
        loadFileStructure();
      }
    } catch (error: any) {
      console.error("Error renaming:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to rename",
        variant: "destructive",
      });
    }
  };

  const handleFileDelete = async (path: string) => {
    if (!selectedRepoId) return;

    try {
      // Get file structure to determine what to delete
      const { data, error } = await supabase.rpc("get_file_structure_with_token", {
        p_repo_id: selectedRepoId,
        p_token: shareToken || null,
      });

      if (error) throw error;

      const files = (data as any[]) || [];
      
      // Find all files that match this path or are within this folder
      const filesToDelete = files.filter((f: any) => 
        f.path === path || f.path.startsWith(path + "/")
      );

      // Delete all matching files
      for (const file of filesToDelete) {
        await supabase.rpc("delete_file_with_token", {
          p_file_id: file.id,
          p_token: shareToken || null,
        });
      }

      toast({
        title: "Success",
        description: "Deleted successfully",
      });
      
      // Clear selection if deleted file was selected
      if (selectedFilePath === path || selectedFilePath?.startsWith(path + "/")) {
        setSelectedFilePath(null);
        setSelectedFileId(null);
      }
      
      loadFileStructure();
    } catch (error: any) {
      console.error("Error deleting:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete",
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
      // Set all repos to pulling status
      const statusUpdates: { [key: string]: 'pulling' } = {};
      repos.forEach(repo => {
        statusUpdates[repo.id] = 'pulling';
      });
      setSyncStatus(statusUpdates);

      const pullPromises = repos.map(async (repo) => {
        try {
          const { data, error } = await supabase.functions.invoke('sync-repo-pull', {
            body: {
              repoId: repo.id,
              projectId: projectId,
              shareToken: shareToken,
            },
          });

          if (error) throw error;

          // Update status to success
          setSyncStatus(prev => ({ ...prev, [repo.id]: 'success' }));
          setLastSyncTime(prev => ({ ...prev, [repo.id]: new Date() }));
          
          return { repo: `${repo.organization}/${repo.repo}`, success: true, ...data };
        } catch (err) {
          // Update status to error
          setSyncStatus(prev => ({ ...prev, [repo.id]: 'error' }));
          throw err;
        }
      });

      const results = await Promise.allSettled(pullPromises);
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed === 0) {
        toast({
          title: "Pull complete",
          description: `Successfully pulled from ${successful} repository(ies)`,
        });
      } else {
        toast({
          title: "Pull completed with errors",
          description: `Pulled from ${successful} repository(ies), ${failed} failed`,
          variant: "destructive",
        });
      }
      
      // Reload file structure after pull
      loadFileStructure();

      // Reset status after delay
      setTimeout(() => {
        setSyncStatus({});
      }, 3000);
    } catch (error: any) {
      console.error("Pull error:", error);
      toast({
        title: "Pull failed",
        description: error.message || "Failed to pull from repositories",
        variant: "destructive",
      });
      setSyncStatus({});
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
                      repos.map((repo) => {
                        const status = syncStatus[repo.id];
                        const lastSync = lastSyncTime[repo.id];
                        
                        return (
                          <div key={repo.id} className="space-y-2">
                            <RepoCard
                              repo={repo}
                              onDelete={handleDeleteRepo}
                              onManagePAT={handleManagePAT}
                            />
                            {status && (
                              <div className={`text-xs px-3 py-1 rounded ${
                                status === 'pushing' ? 'bg-blue-500/10 text-blue-500' :
                                status === 'pulling' ? 'bg-purple-500/10 text-purple-500' :
                                status === 'success' ? 'bg-green-500/10 text-green-500' :
                                'bg-red-500/10 text-red-500'
                              }`}>
                                {status === 'pushing' && 'Pushing to GitHub...'}
                                {status === 'pulling' && 'Pulling from GitHub...'}
                                {status === 'success' && 'Sync successful'}
                                {status === 'error' && 'Sync failed'}
                              </div>
                            )}
                            {lastSync && !status && (
                              <div className="text-xs text-muted-foreground px-3">
                                Last synced: {lastSync.toLocaleString()}
                              </div>
                            )}
                          </div>
                        );
                      })
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
                            <EnhancedFileTree
                              files={fileStructure}
                              onFileSelect={handleFileSelect}
                              selectedPath={selectedFilePath}
                              onFileCreate={handleFileCreate}
                              onFileRename={handleFileRename}
                              onFileDelete={handleFileDelete}
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
                    <CardTitle>GitHub Synchronization</CardTitle>
                    <CardDescription>
                      Push local changes to GitHub or pull latest from GitHub
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex gap-4">
                      <Button 
                        onClick={handleSync} 
                        className="flex-1"
                        disabled={Object.values(syncStatus).some(s => s === 'pushing' || s === 'pulling')}
                      >
                        <GitBranch className="h-4 w-4 mr-2" />
                        Push to GitHub
                      </Button>
                      <Button 
                        onClick={handlePull} 
                        variant="outline" 
                        className="flex-1"
                        disabled={Object.values(syncStatus).some(s => s === 'pushing' || s === 'pulling')}
                      >
                        <GitBranch className="h-4 w-4 mr-2" />
                        Pull from GitHub
                      </Button>
                    </div>

                    {Object.keys(syncStatus).length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Sync Status</h4>
                        <div className="space-y-1">
                          {repos.map(repo => {
                            const status = syncStatus[repo.id];
                            if (!status) return null;
                            
                            return (
                              <div key={repo.id} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                                <span className="font-medium">{repo.organization}/{repo.repo}</span>
                                <span className={
                                  status === 'pushing' ? 'text-blue-500' :
                                  status === 'pulling' ? 'text-purple-500' :
                                  status === 'success' ? 'text-green-500' :
                                  'text-red-500'
                                }>
                                  {status === 'pushing' && 'Pushing...'}
                                  {status === 'pulling' && 'Pulling...'}
                                  {status === 'success' && '✓ Success'}
                                  {status === 'error' && '✗ Failed'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="border-t pt-4">
                      <h4 className="text-sm font-medium mb-2">Sync History</h4>
                      <div className="space-y-2">
                        {repos.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No repositories connected</p>
                        ) : (
                          repos.map(repo => {
                            const lastSync = lastSyncTime[repo.id];
                            return (
                              <div key={repo.id} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                                <span>{repo.organization}/{repo.repo}</span>
                                <span className="text-muted-foreground">
                                  {lastSync ? `Last synced: ${lastSync.toLocaleString()}` : 'Never synced'}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="text-sm font-medium mb-2">Tips</h4>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Push sends your local changes to GitHub</li>
                        <li>Pull retrieves the latest changes from GitHub</li>
                        <li>Always pull before making major changes to avoid conflicts</li>
                        <li>Sync operations may take a few moments for large repositories</li>
                      </ul>
                    </div>
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

      <IDEModal
        open={ideModalOpen}
        onOpenChange={setIdeModalOpen}
        fileStructure={fileStructure}
        selectedFilePath={selectedFilePath}
        selectedFileId={selectedFileId}
        selectedRepoId={selectedRepoId || ""}
        onFileSelect={handleFileSelect}
        onFileSave={loadFileStructure}
        onFileCreate={handleFileCreate}
        onFileRename={handleFileRename}
        onFileDelete={handleFileDelete}
      />
    </div>
  );
}
