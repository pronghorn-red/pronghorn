import { useState, useEffect } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { useParams } from "react-router-dom";
import { useShareToken } from "@/hooks/useShareToken";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { AgentFileTree } from "@/components/build/AgentFileTree";
import { CodeEditor } from "@/components/repository/CodeEditor";
import { StagingPanel } from "@/components/build/StagingPanel";
import { CommitHistory } from "@/components/build/CommitHistory";
import { UnifiedAgentInterface } from "@/components/build/UnifiedAgentInterface";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRealtimeRepos } from "@/hooks/useRealtimeRepos";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Menu, FilePlus, FolderPlus, Eye, EyeOff } from "lucide-react";
import { CreateFileDialog } from "@/components/repository/CreateFileDialog";

export default function Build() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet } = useShareToken(projectId || null);
  const isMobile = useIsMobile();

  const { repos } = useRealtimeRepos(projectId || null);
  const defaultRepo = repos.find((r) => r.is_default);

  const [files, setFiles] = useState<Array<{ id: string; path: string; isStaged?: boolean }>>([]);
  const [selectedFile, setSelectedFile] = useState<{ 
    id: string; 
    path: string; 
    isStaged?: boolean;
    stagingId?: string;
  } | null>(null);
  const [stagedChanges, setStagedChanges] = useState<any[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; path: string }>>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isProjectSidebarOpen, setIsProjectSidebarOpen] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createType, setCreateType] = useState<"file" | "folder">("file");
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const [showDeletedFiles, setShowDeletedFiles] = useState(true);
  const [mobileActiveTab, setMobileActiveTab] = useState("files");

  // Load files from default repo
  useEffect(() => {
    if (defaultRepo && projectId && isTokenSet) {
      loadFiles();
    }
  }, [defaultRepo, projectId, shareToken, isTokenSet, showDeletedFiles]);

  // Real-time subscription for file and staging changes
  useEffect(() => {
    if (!projectId || !defaultRepo || !isTokenSet) return;

    console.log("Setting up file tree real-time subscriptions for project:", projectId);

    const channel = supabase
       .channel(`repo-changes-${projectId}`)
       .on(
         "postgres_changes",
         {
           event: "*",
           schema: "public",
           table: "repo_files",
           filter: `project_id=eq.${projectId}`,
         },
         (payload) => {
           console.log("File change detected:", payload);
           loadFiles();
         }
       )
       .on(
         "postgres_changes",
         {
           event: "*",
           schema: "public",
           table: "repo_staging",
           filter: `repo_id=eq.${defaultRepo.id}`,
         },
         (payload) => {
           console.log("Staging change detected:", payload);
           loadFiles();
         }
       )
       .on(
         "broadcast",
         { event: "repo_files_refresh" },
         (payload) => {
           console.log("Received repo files refresh broadcast:", payload);
           loadFiles();
         }
       )
       .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, defaultRepo, isTokenSet]);

  const loadFiles = async () => {
    if (!defaultRepo || !projectId) return;

    try {
      // Load committed files
      const { data: committedFiles, error: filesError } = await supabase.rpc(
        "get_project_files_with_token",
        {
          p_project_id: projectId,
          p_token: shareToken || null,
        }
      );

      if (filesError) throw filesError;

      // Load staged changes
      const { data: staged, error: stagedError } = await supabase.rpc(
        "get_staged_changes_with_token",
        {
          p_repo_id: defaultRepo.id,
          p_token: shareToken || null,
        }
      );

      if (stagedError) throw stagedError;

      setStagedChanges(staged || []);

      // Build comprehensive file list
      const stagedMap = new Map((staged || []).map((s: any) => [s.file_path, s]));
      const allFiles: Array<{ id: string; path: string; isStaged?: boolean }> = [];

      // Add all committed files (including those staged for deletion)
      (committedFiles || []).forEach((f: any) => {
        const stagedChange = stagedMap.get(f.path);
        // Filter out deleted files if toggle is off
        if (!showDeletedFiles && stagedChange?.operation_type === "delete") {
          return;
        }
        allFiles.push({
          id: f.id,
          path: f.path,
          isStaged: stagedChange ? true : false,
        });
      });

      // Add new staged files
      (staged || []).forEach((change: any) => {
        if (change.operation_type === "add" || change.operation_type === "rename") {
          const existsInCommitted = (committedFiles || []).some(
            (f: any) => f.path === change.file_path
          );
          if (!existsInCommitted) {
            allFiles.push({
              id: change.id,
              path: change.file_path,
              isStaged: true,
            });
          }
        }
      });

      setFiles(allFiles);
    } catch (error) {
      console.error("Error loading files:", error);
      toast.error("Failed to load project files");
    }
  };

  const handleSelectFile = async (fileId: string, path: string, isStaged?: boolean) => {
    // Track folder selection for context-aware file/folder creation
    const file = files.find(f => f.path === path);
    if (file && path.includes('/')) {
      // Extract parent folder path
      const folderPath = path.substring(0, path.lastIndexOf('/'));
      setSelectedFolderPath(folderPath);
    } else {
      // File in root directory
      setSelectedFolderPath('/');
    }

    // For staged-only files (newly created by agent), we need to load content from staging
    if (isStaged) {
      const stagedFile = stagedChanges.find(
        (s) => s.file_path === path && (s.operation_type === "add" || s.operation_type === "edit")
      );
      
      if (stagedFile) {
        // Set selected file with staging info so CodeEditor knows to load from staging
        setSelectedFile({ 
          id: fileId, 
          path, 
          isStaged: true,
          stagingId: stagedFile.id 
        });
        // On mobile, switch to editor tab when a file is selected
        if (isMobile) {
          setMobileActiveTab("editor");
        }
        return;
      }
    }
    
    setSelectedFile({ id: fileId, path, isStaged });
    // On mobile, switch to editor tab when a file is selected
    if (isMobile) {
      setMobileActiveTab("editor");
    }
  };

  const handleCreateFile = async (name: string) => {
    if (!defaultRepo || !projectId) return;

    try {
      const fullPath = selectedFolderPath && selectedFolderPath !== '/'
        ? `${selectedFolderPath}/${name}` 
        : name;

      if (createType === "folder") {
        // Create .gitkeep file in folder
        await supabase.rpc("create_file_with_token", {
          p_repo_id: defaultRepo.id,
          p_path: `${fullPath}/.gitkeep`,
          p_content: "",
          p_token: shareToken || null,
        });
      } else {
        await supabase.rpc("create_file_with_token", {
          p_repo_id: defaultRepo.id,
          p_path: fullPath,
          p_content: "",
          p_token: shareToken || null,
        });
      }

      toast.success(`${createType === "folder" ? "Folder" : "File"} created successfully`);
      loadFiles();
    } catch (error: any) {
      console.error("Error creating file/folder:", error);
      toast.error(error.message || "Failed to create file/folder");
    }
  };

  const handleAttachToPrompt = (fileId: string, path: string) => {
    if (!attachedFiles.find((f) => f.id === fileId)) {
      setAttachedFiles([...attachedFiles, { id: fileId, path }]);
      toast.success(`${path} attached to prompt`);
    }
  };

  const handleRemoveAttachedFile = (fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handleReviewFile = (fileId: string, path: string) => {
    toast.info(`CodingAgent will review ${path}`);
  };

  const handleEditFile = (fileId: string, path: string) => {
    toast.info(`CodingAgent will edit ${path}`);
  };

  const handleAuditFile = (fileId: string, path: string) => {
    toast.info(`CodingAgent will audit ${path} against requirements`);
  };

  const handleViewDiff = (change: any) => {
    const fileInfo = files.find((f) => f.path === change.file_path);
    if (fileInfo) {
      setSelectedFile({ ...fileInfo, isStaged: true });
    }
  };

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-background h-screen">
      <PrimaryNav />

      <div className="flex flex-1 min-h-0 relative overflow-hidden">
        <ProjectSidebar
          projectId={projectId}
          isOpen={isProjectSidebarOpen}
          onOpenChange={setIsProjectSidebarOpen}
        />

        <main className="flex-1 w-full">
          <div className="flex flex-col h-full">
            <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex h-14 items-center gap-2 px-3 md:px-6">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsProjectSidebarOpen(true)}
                  className="shrink-0 h-8 w-8 md:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-4 w-4" />
                </Button>
                <h1 className="text-base md:text-lg font-semibold">Build</h1>
              </div>
            </div>

            {/* Desktop Layout */}
            {!isMobile && (
              <div className="flex-1 flex overflow-hidden">
                <ResizablePanelGroup direction="horizontal" className="flex-1">
                  {/* Left: File Tree */}
                  <ResizablePanel defaultSize={20} minSize={15}>
                    <div className="h-full flex flex-col border-r bg-[#1e1e1e]">
                      <div className="p-2 border-b border-[#3e3e42] bg-[#252526]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-[#cccccc]">Files</span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setCreateType("file");
                                setCreateDialogOpen(true);
                              }}
                              className="h-6 w-6 hover:bg-[#2a2d2e] text-[#cccccc]"
                              title="New File"
                            >
                              <FilePlus className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setCreateType("folder");
                                setCreateDialogOpen(true);
                              }}
                              className="h-6 w-6 hover:bg-[#2a2d2e] text-[#cccccc]"
                              title="New Folder"
                            >
                              <FolderPlus className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setShowDeletedFiles(!showDeletedFiles)}
                              className="h-6 w-6 hover:bg-[#2a2d2e] text-[#cccccc]"
                              title={showDeletedFiles ? "Hide deleted files" : "Show deleted files"}
                            >
                              {showDeletedFiles ? (
                                <Eye className="h-3.5 w-3.5" />
                              ) : (
                                <EyeOff className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>
                        {selectedFolderPath && selectedFolderPath !== '/' && (
                          <div className="text-xs text-[#858585] truncate bg-[#1e2a3a] px-2 py-1 rounded border border-[#3e5a7a]">
                            Creating in: <span className="text-[#4ec9b0]">{selectedFolderPath}</span>
                          </div>
                        )}
                        {selectedFolderPath === '/' && (
                          <div className="text-xs text-[#858585] truncate bg-[#1e2a3a] px-2 py-1 rounded border border-[#3e5a7a]">
                            Creating in: <span className="text-[#4ec9b0]">root directory</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden">
                        <AgentFileTree
                          files={files}
                          stagedChanges={stagedChanges}
                          selectedFileId={selectedFile?.id || null}
                          onSelectFile={handleSelectFile}
                          onFolderSelect={setSelectedFolderPath}
                          onAttachToPrompt={handleAttachToPrompt}
                          onReviewFile={handleReviewFile}
                          onEditFile={handleEditFile}
                          onAuditFile={handleAuditFile}
                        />
                      </div>
                    </div>
                  </ResizablePanel>

                  <ResizableHandle withHandle />

                  {/* Center: Code Editor */}
                  <ResizablePanel defaultSize={isSidebarCollapsed ? 70 : 50} minSize={30}>
                    <div className="h-full">
                      {selectedFile ? (
                        <CodeEditor
                          key={selectedFile.path}
                          fileId={selectedFile.id}
                          filePath={selectedFile.path}
                          repoId={defaultRepo?.id || ""}
                          isStaged={selectedFile.isStaged}
                          showDiff={showDiff}
                          onShowDiffChange={setShowDiff}
                          onClose={() => setSelectedFile(null)}
                          onSave={loadFiles}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          <p>Select a file to view or edit</p>
                        </div>
                      )}
                    </div>
                  </ResizablePanel>

                  {!isSidebarCollapsed && (
                    <>
                      <ResizableHandle withHandle />

                      {/* Right: Collapsible Sidebar with Tabs */}
                      <ResizablePanel defaultSize={30} minSize={25}>
                          <div className="h-full flex flex-col">
                            <div className="flex items-center justify-between p-2 border-b">
                              <span className="text-sm font-semibold">Workspace</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsSidebarCollapsed(true)}
                                className="h-6 w-6"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
                            <TabsList className="grid w-full grid-cols-3">
                              <TabsTrigger value="chat">Chat</TabsTrigger>
                              <TabsTrigger value="staging">Staging</TabsTrigger>
                              <TabsTrigger value="history">History</TabsTrigger>
                            </TabsList>

                            <TabsContent value="chat" className="flex-1 overflow-hidden mt-0">
                              <UnifiedAgentInterface
                                projectId={projectId}
                                repoId={defaultRepo?.id || null}
                                shareToken={shareToken}
                                attachedFiles={attachedFiles}
                                onRemoveFile={handleRemoveAttachedFile}
                              />
                            </TabsContent>

                            <TabsContent value="staging" className="flex-1 overflow-hidden mt-0">
                              <StagingPanel
                                projectId={projectId}
                                onViewDiff={handleViewDiff}
                              />
                            </TabsContent>

                            <TabsContent value="history" className="flex-1 overflow-hidden mt-0">
                              <CommitHistory
                                projectId={projectId}
                              />
                            </TabsContent>
                          </Tabs>
                        </div>
                      </ResizablePanel>
                    </>
                  )}

                  {isSidebarCollapsed && (
                    <div className="flex items-center border-l">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsSidebarCollapsed(false)}
                        className="h-8 w-8 m-2"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </ResizablePanelGroup>
              </div>
            )}

            {/* Mobile Layout */}
            {isMobile && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <Tabs value={mobileActiveTab} onValueChange={setMobileActiveTab} className="flex-1 flex flex-col min-h-0">
                  <TabsList className="grid w-full grid-cols-4 shrink-0">
                    <TabsTrigger value="files">Files</TabsTrigger>
                    <TabsTrigger value="editor">Editor</TabsTrigger>
                    <TabsTrigger value="chat">Chat</TabsTrigger>
                    <TabsTrigger value="staging">Stage</TabsTrigger>
                  </TabsList>

                  <TabsContent value="files" className="flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden">
                    <div className="h-full flex flex-col bg-[#1e1e1e]">
                      <div className="p-2 border-b border-[#3e3e42] bg-[#252526]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-[#cccccc]">Files</span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setCreateType("file");
                                setCreateDialogOpen(true);
                              }}
                              className="h-6 w-6 hover:bg-[#2a2d2e] text-[#cccccc]"
                              title="New File"
                            >
                              <FilePlus className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setCreateType("folder");
                                setCreateDialogOpen(true);
                              }}
                              className="h-6 w-6 hover:bg-[#2a2d2e] text-[#cccccc]"
                              title="New Folder"
                            >
                              <FolderPlus className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setShowDeletedFiles(!showDeletedFiles)}
                              className="h-6 w-6 hover:bg-[#2a2d2e] text-[#cccccc]"
                              title={showDeletedFiles ? "Hide deleted files" : "Show deleted files"}
                            >
                              {showDeletedFiles ? (
                                <Eye className="h-3.5 w-3.5" />
                              ) : (
                                <EyeOff className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>
                        {selectedFolderPath && selectedFolderPath !== '/' && (
                          <div className="text-xs text-[#858585] truncate bg-[#1e2a3a] px-2 py-1 rounded border border-[#3e5a7a]">
                            Creating in: <span className="text-[#4ec9b0]">{selectedFolderPath}</span>
                          </div>
                        )}
                        {selectedFolderPath === '/' && (
                          <div className="text-xs text-[#858585] truncate bg-[#1e2a3a] px-2 py-1 rounded border border-[#3e5a7a]">
                            Creating in: <span className="text-[#4ec9b0]">root directory</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-h-0 overflow-auto">
                        <AgentFileTree
                          files={files}
                          stagedChanges={stagedChanges}
                          selectedFileId={selectedFile?.id || null}
                          onSelectFile={handleSelectFile}
                          onFolderSelect={setSelectedFolderPath}
                          onAttachToPrompt={handleAttachToPrompt}
                          onReviewFile={handleReviewFile}
                          onEditFile={handleEditFile}
                          onAuditFile={handleAuditFile}
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="editor" className="flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden">
                    {selectedFile ? (
                      <CodeEditor
                        fileId={selectedFile.id}
                        filePath={selectedFile.path}
                        repoId={defaultRepo?.id || ""}
                        isStaged={selectedFile.isStaged}
                        showDiff={showDiff}
                        onShowDiffChange={setShowDiff}
                        onClose={() => setSelectedFile(null)}
                        onSave={loadFiles}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p>Select a file</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="chat" className="flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden">
                    <UnifiedAgentInterface
                      projectId={projectId}
                      repoId={defaultRepo?.id || null}
                      shareToken={shareToken}
                      attachedFiles={attachedFiles}
                      onRemoveFile={handleRemoveAttachedFile}
                    />
                  </TabsContent>

                  <TabsContent value="staging" className="flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden">
                    <StagingPanel
                      projectId={projectId}
                      onViewDiff={handleViewDiff}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </main>
      </div>

      <CreateFileDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        type={createType}
        onConfirm={handleCreateFile}
        basePath={selectedFolderPath || undefined}
      />
    </div>
  );
}
