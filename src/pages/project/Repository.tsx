import { useState, useEffect } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RepoCard } from "@/components/repository/RepoCard";
import { EnhancedFileTree } from "@/components/repository/EnhancedFileTree";
import { CodeEditor } from "@/components/repository/CodeEditor";
import { CreateRepoDialog } from "@/components/repository/CreateRepoDialog";
import { ManagePATDialog } from "@/components/repository/ManagePATDialog";
import { IDEModal } from "@/components/repository/IDEModal";
import { SyncDialog, SyncConfig } from "@/components/repository/SyncDialog";
import { CommitLog } from "@/components/repository/CommitLog";
import { CreateFileDialog } from "@/components/repository/CreateFileDialog";
import { GitBranch, Database, Menu, FilePlus, FolderPlus, Maximize2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeRepos } from "@/hooks/useRealtimeRepos";
import { useShareToken } from "@/hooks/useShareToken";
import { useAuth } from "@/contexts/AuthContext";
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
  const { token: shareToken, isTokenSet } = useShareToken(projectId);
  const { user } = useAuth();
  const hasAccessToken = !!shareToken || !!user;
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
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncDialogType, setSyncDialogType] = useState<"push" | "pull">("push");
  const [autoSync, setAutoSync] = useState(false);
  const [rootCreateDialogOpen, setRootCreateDialogOpen] = useState(false);
  const [rootCreateType, setRootCreateType] = useState<"file" | "folder">("file");
  const [allFilesWithContent, setAllFilesWithContent] = useState<{ path: string; content: string }[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { repos, loading, refetch } = useRealtimeRepos(projectId);

  // CRITICAL: All hooks must be called before any early returns
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

  // Early returns AFTER all hooks
  if (!projectId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-destructive">Invalid project ID</p>
      </div>
    );
  }

  if (!hasAccessToken) {
    return (
      <div className="min-h-screen bg-background">
        <PrimaryNav />
        <div className="flex relative">
          <ProjectSidebar projectId={projectId} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
          <main className="flex-1 w-full flex items-center justify-center">
            <div className="text-center space-y-2 max-w-md px-4">
              <h1 className="text-xl font-semibold">Share token required</h1>
              <p className="text-sm text-muted-foreground">
                This project can only be accessed via its secure sharing link. Please use the full URL that includes the <code>?token=</code> parameter.
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Wait for token to be set before loading data
  if (shareToken && !isTokenSet) {
    return (
      <div className="min-h-screen bg-background">
        <PrimaryNav />
        <div className="flex relative">
          <ProjectSidebar projectId={projectId} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
          <main className="flex-1 w-full flex items-center justify-center">
            <p>Loading...</p>
          </main>
        </div>
      </div>
    );
  }

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

      // Load all file contents for content search
      const files = (data as any[]) || [];
      const filePaths = files.filter((f: any) => f.type === "file").map((f: any) => f.path);
      
      if (filePaths.length > 0) {
        const { data: filesData, error: filesError } = await supabase.rpc("get_repo_files_with_token", {
          p_repo_id: selectedRepoId,
          p_token: shareToken || null,
          p_file_paths: filePaths,
        });

        if (!filesError && filesData) {
          setAllFilesWithContent(filesData);
        }
      }
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

    const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

    sortedFiles.forEach((file) => {
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
    const repo = repos.find(r => r.id === repoId);
    if (!repo) return;

    const confirmed = window.confirm(
      `Are you sure you want to disconnect "${repo.organization}/${repo.repo}"?\n\nThis will remove the repository connection from this project, but the repository on GitHub will remain intact.`
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase.rpc("delete_project_repo_with_token", {
        p_repo_id: repoId,
        p_token: shareToken || null,
      });

      if (error) throw error;

      toast({
        title: "Repository disconnected",
        description: `${repo.organization}/${repo.repo} has been unlinked from this project`,
      });

      // If the deleted repo was selected, clear selection
      if (selectedRepoId === repoId) {
        setSelectedRepoId(null);
        setFileStructure([]);
        setSelectedFilePath(null);
        setSelectedFileId(null);
      }

      refetch();
    } catch (error: any) {
      console.error("Error deleting repo:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to disconnect repository",
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

  const handleCreateEmpty = async (name: string, isPrivate: boolean) => {
    if (!projectId) return;
    
    try {
      const { error } = await supabase.functions.invoke('create-empty-repo', {
        body: {
          projectId,
          repoName: name,
          shareToken: shareToken || null,
          isPrivate,
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

  const handleCreateFromTemplate = async (name: string, templateOrg: string, templateRepo: string, isPrivate: boolean) => {
    if (!projectId) return;
    
    try {
      const { error } = await supabase.functions.invoke('create-repo-from-template', {
        body: {
          projectId,
          repoName: name,
          templateOrg,
          templateRepo,
          shareToken: shareToken || null,
          isPrivate,
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

  const handleClonePublic = async (name: string, sourceOrg: string, sourceRepo: string, sourceBranch: string, isPrivate: boolean) => {
    if (!projectId) return;
    
    try {
      const { error } = await supabase.functions.invoke('clone-public-repo', {
        body: {
          projectId,
          repoName: name,
          sourceOrg,
          sourceRepo,
          sourceBranch,
          shareToken: shareToken || null,
          isPrivate,
        }
      });

      if (error) throw error;

      toast({
        title: "Repository cloned",
        description: "Public repository cloned successfully",
      });
      refetch();
    } catch (error) {
      console.error('Error cloning public repository:', error);
      toast({
        title: "Error",
        description: "Failed to clone public repository",
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

  const handleSyncWithConfig = async (config: SyncConfig, isPush: boolean) => {
    try {
      // Find Prime repo
      const primeRepo = repos.find(r => r.is_prime);
      
      if (isPush) {
        // Push: Prime first, then force-push to mirrors
        if (!primeRepo) {
          toast({
            title: "No Prime repository",
            description: "Please set a Prime repository first",
            variant: "destructive",
          });
          return;
        }

        const mirrorRepos = repos.filter(r => !r.is_prime && config.selectedRepos.includes(r.id));
        
        // Set all repos to pushing status
        const statusUpdates: { [key: string]: 'pushing' | 'pulling' } = {};
        config.selectedRepos.forEach(repoId => {
          statusUpdates[repoId] = 'pushing';
        });
        setSyncStatus(statusUpdates);

        // Push to Prime first
        try {
          const { data, error } = await supabase.functions.invoke('sync-repo-push', {
            body: {
              repoId: primeRepo.id,
              projectId: projectId,
              shareToken: shareToken,
              branch: config.branches[primeRepo.id] || primeRepo.branch,
              commitMessage: config.commitMessage,
              forcePush: config.forcePush || false,
            },
          });

          if (error) throw error;
          setSyncStatus(prev => ({ ...prev, [primeRepo.id]: 'success' }));
          setLastSyncTime(prev => ({ ...prev, [primeRepo.id]: new Date() }));
        } catch (err) {
          setSyncStatus(prev => ({ ...prev, [primeRepo.id]: 'error' }));
          throw err;
        }

        // Force push Prime's files to all selected mirrors
        const mirrorPromises = mirrorRepos.map(async (repo) => {
          try {
            const { data, error } = await supabase.functions.invoke('sync-repo-push', {
              body: {
                repoId: repo.id,
                sourceRepoId: primeRepo.id, // Fetch files from Prime
                projectId: projectId,
                shareToken: shareToken,
                branch: config.branches[repo.id] || repo.branch,
                commitMessage: `Mirror sync: ${config.commitMessage}`,
                forcePush: true, // Always force push to mirrors
              },
            });

            if (error) throw error;
            setSyncStatus(prev => ({ ...prev, [repo.id]: 'success' }));
            setLastSyncTime(prev => ({ ...prev, [repo.id]: new Date() }));
            return { repo: `${repo.organization}/${repo.repo}`, success: true };
          } catch (err) {
            setSyncStatus(prev => ({ ...prev, [repo.id]: 'error' }));
            throw err;
          }
        });

        const results = await Promise.allSettled(mirrorPromises);
        const successful = 1 + results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        toast({
          title: failed === 0 ? "Push complete" : "Push completed with errors",
          description: `Prime + ${successful - 1} mirror(s) synced${failed > 0 ? `, ${failed} failed` : ''}`,
          variant: failed > 0 ? "destructive" : "default",
        });
      } else {
        // Pull: Only from Prime repository
        if (!primeRepo) {
          toast({
            title: "No Prime repository",
            description: "Please set a Prime repository first",
            variant: "destructive",
          });
          return;
        }

        setSyncStatus({ [primeRepo.id]: 'pulling' });

        try {
          const { data, error } = await supabase.functions.invoke('sync-repo-pull', {
            body: {
              repoId: primeRepo.id,
              projectId: projectId,
              shareToken: shareToken,
              branch: config.branches[primeRepo.id] || primeRepo.branch,
            },
          });

          if (error) throw error;

          setSyncStatus({ [primeRepo.id]: 'success' });
          setLastSyncTime({ [primeRepo.id]: new Date() });
          
          toast({
            title: "Pull complete",
            description: `Pulled from Prime: ${primeRepo.organization}/${primeRepo.repo}`,
          });

          loadFileStructure();
        } catch (err: any) {
          setSyncStatus({ [primeRepo.id]: 'error' });
          toast({
            title: "Pull failed",
            description: err.message || "Failed to pull from Prime repository",
            variant: "destructive",
          });
        }
      }

      setTimeout(() => {
        setSyncStatus({});
      }, 3000);
    } catch (error: any) {
      console.error("Sync error:", error);
      toast({
        title: `${isPush ? "Push" : "Pull"} failed`,
        description: error.message || `Failed to ${isPush ? "push to" : "pull from"} repositories`,
        variant: "destructive",
      });
      setSyncStatus({});
    }
  };

  const handleSync = () => {
    if (repos.length === 0) {
      toast({
        title: "No repositories",
        description: "Please add a repository first",
        variant: "destructive",
      });
      return;
    }
    setSyncDialogType("push");
    setSyncDialogOpen(true);
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
      if (autoSync) performAutoSync();
    } catch (error: any) {
      console.error("Error creating file/folder:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create file/folder",
        variant: "destructive",
      });
    }
  };

  const handleRootCreateConfirm = (name: string) => {
    handleFileCreate(name, rootCreateType === "folder");
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
        if (autoSync) performAutoSync();
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
      if (autoSync) performAutoSync();
    } catch (error: any) {
      console.error("Error deleting:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete",
        variant: "destructive",
      });
    }
  };

  const handlePull = () => {
    // Pull only from Prime repository
    const primeRepo = repos.find(r => r.is_prime);
    if (!primeRepo) {
      toast({
        title: "No Prime repository",
        description: "Please set a Prime repository first",
        variant: "destructive",
      });
      return;
    }
    setSyncDialogType("pull");
    setSyncDialogOpen(true);
  };

  const performAutoSync = async () => {
    if (!autoSync || repos.length === 0) return;

    const config: SyncConfig = {
      commitMessage: `Auto-sync from Pronghorn at ${new Date().toISOString()}`,
      selectedRepos: repos.map(r => r.id),
      branches: repos.reduce((acc, repo) => ({ ...acc, [repo.id]: repo.branch }), {}),
      forcePush: true, // Always force push on auto-sync
    };

    await handleSyncWithConfig(config, true);
  };

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      
      <div className="flex relative">
        <ProjectSidebar projectId={projectId!} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
        
        <main className="flex-1 w-full">
          <div className="container px-6 py-8 max-w-7xl">
            <div className="mb-6">
              <div className="flex items-start gap-2 md:gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSidebarOpen(true)}
                  className="shrink-0 h-8 w-8 md:h-9 md:w-9 mt-1 md:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-4 w-4 md:h-5 md:w-5" />
                </Button>
                <div className="flex-1">
                  <h1 className="text-3xl font-bold mb-2">Repository</h1>
                  <p className="text-muted-foreground">
                    Manage GitHub repositories, files, and synchronization
                  </p>
                </div>
              </div>
            </div>

            <Tabs defaultValue="repos" className="space-y-6">
              <TabsList>
                <TabsTrigger value="repos" className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  Repositories
                </TabsTrigger>
                <TabsTrigger value="sync" className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Sync
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
                        onClonePublic={handleClonePublic}
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
                              onPrimeChange={refetch}
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
                  <Card className="p-0 overflow-hidden bg-[#1e1e1e] border-none">
                    <div className="px-4 py-3 border-b border-[#3e3e42] bg-[#252526] flex items-center justify-between">
                      <h3 className="font-semibold text-sm text-[#cccccc]">Explorer</h3>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => {
                            setRootCreateType("file");
                            setRootCreateDialogOpen(true);
                          }}
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 gap-1 bg-[#2a2d2e] text-[#cccccc] border-[#3e3e42] hover:bg-[#313335]"
                        >
                          <FilePlus className="h-3 w-3" />
                          File
                        </Button>
                        <Button
                          onClick={() => {
                            setRootCreateType("folder");
                            setRootCreateDialogOpen(true);
                          }}
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 gap-1 bg-[#2a2d2e] text-[#cccccc] border-[#3e3e42] hover:bg-[#313335]"
                        >
                          <FolderPlus className="h-3 w-3" />
                          Folder
                        </Button>
                        <Button
                          onClick={() => setIdeModalOpen(true)}
                          size="sm"
                          variant="outline"
                          className="gap-2 h-8 bg-[#2a2d2e] text-[#cccccc] border-[#3e3e42] hover:bg-[#313335]"
                        >
                          <Maximize2 className="h-4 w-4" />
                          Full-Screen IDE
                        </Button>
                      </div>
                    </div>
                    <ResizablePanelGroup direction="horizontal" className="min-h-[700px] bg-[#1e1e1e]">
                      <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
                        <div className="h-full border-r border-[#3e3e42] bg-[#252526]">
                          {loadingFiles ? (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
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
                              allFilesWithContent={allFilesWithContent}
                            />
                          )}
                        </div>
                      </ResizablePanel>
                      <ResizableHandle withHandle />
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
                          onAutoSync={autoSync ? performAutoSync : undefined}
                        />
                      </ResizablePanel>
                    </ResizablePanelGroup>
                    <CreateFileDialog
                      open={rootCreateDialogOpen}
                      onOpenChange={setRootCreateDialogOpen}
                      type={rootCreateType}
                      onConfirm={handleRootCreateConfirm}
                    />
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
                    <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/20">
                      <Checkbox
                        id="auto-sync"
                        checked={autoSync}
                        onCheckedChange={(checked) => setAutoSync(checked as boolean)}
                      />
                      <div className="flex-1">
                        <label htmlFor="auto-sync" className="text-sm font-medium cursor-pointer">
                          Auto-sync on changes
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Automatically push to GitHub whenever you save, create, rename, or delete files
                        </p>
                      </div>
                    </div>

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
                      <h4 className="text-sm font-medium mb-4">Commit Change Log</h4>
                      {repos.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No repositories connected</p>
                      ) : (
                        <div className="space-y-4">
                          {repos.map(repo => (
                            <CommitLog key={repo.id} repoId={repo.id} />
                          ))}
                        </div>
                      )}
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

      <SyncDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        repos={repos}
        onConfirm={(config) => handleSyncWithConfig(config, syncDialogType === "push")}
        type={syncDialogType}
      />

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
        autoSync={autoSync}
        onAutoSync={performAutoSync}
        allFilesWithContent={allFilesWithContent}
      />
    </div>
  );
}
