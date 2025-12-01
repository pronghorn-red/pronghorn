import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StagingPanel } from "@/components/build/StagingPanel";
import { CommitHistory } from "@/components/build/CommitHistory";
import { CodeEditor } from "@/components/repository/CodeEditor";
import { AgentFileTree } from "@/components/build/AgentFileTree";
import { AgentPromptPanel } from "@/components/build/AgentPromptPanel";

import { AgentProgressMonitor } from "@/components/build/AgentProgressMonitor";
import { AgentChatViewer } from "@/components/build/AgentChatViewer";
import { AgentSessionsList } from "@/components/build/AgentSessionsList";
import { useRealtimeRepos } from "@/hooks/useRealtimeRepos";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

export default function Build() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");
  const { toast } = useToast();

  const { repos, loading: reposLoading } = useRealtimeRepos(projectId);
  const defaultRepo = repos.find((r) => r.is_default);

  const [files, setFiles] = useState<Array<{ id: string; path: string; isStaged?: boolean }>>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileIsStaged, setSelectedFileIsStaged] = useState<boolean>(false);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; path: string }>>([]);
  const [stagedChanges, setStagedChanges] = useState<any[]>([]);
  const [selectedDiff, setSelectedDiff] = useState<{ old: string; new: string; path: string } | null>(null);
  const [diffEnabled, setDiffEnabled] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    // Load most recent session ID from sessionStorage on mount
    return sessionStorage.getItem(`activeAgentSession_${projectId}`) || null;
  });

  // Persist activeSessionId to sessionStorage whenever it changes
  useEffect(() => {
    if (activeSessionId && projectId) {
      sessionStorage.setItem(`activeAgentSession_${projectId}`, activeSessionId);
    }
  }, [activeSessionId, projectId]);

  // Load most recent agent session on mount
  useEffect(() => {
    if (!projectId || !shareToken) return;

    const loadRecentSession = async () => {
      try {
        const { data: sessions, error } = await supabase.rpc("get_agent_sessions_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
        });

        if (error) throw error;

        if (sessions && sessions.length > 0) {
          // Get most recent session
          const mostRecent = sessions.sort(
            (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0];
          
          // Only set if we don't already have an active session
          if (!activeSessionId) {
            setActiveSessionId(mostRecent.id);
          }
        }
      } catch (error) {
        console.error("Error loading recent session:", error);
      }
    };

    loadRecentSession();
  }, [projectId, shareToken]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Load files from default repo
  useEffect(() => {
    if (defaultRepo && projectId) {
      loadFiles();
    }
  }, [defaultRepo, projectId, shareToken]);

  // Real-time subscription for file and staging changes
  useEffect(() => {
    if (!projectId || !defaultRepo) return;

    const channel = supabase
      .channel(`repo-changes-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "repo_files",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log("New file created:", payload.new);
          loadFiles();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "repo_files",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log("File updated:", payload.new);
          loadFiles();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "repo_files",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log("File deleted:", payload.old);
          loadFiles();
        },
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
          console.log("Staging changed:", payload);
          loadFiles();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, defaultRepo]);

  // Real-time subscription for agent session completion
  useEffect(() => {
    if (!activeSessionId || !projectId) return;

    const sessionChannel = supabase
      .channel(`agent-session-${activeSessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "agent_sessions",
          filter: `id=eq.${activeSessionId}`,
        },
        (payload) => {
          console.log("Agent session updated:", payload.new);
          const newStatus = (payload.new as any)?.status;
          if (newStatus === "completed" || newStatus === "failed") {
            console.log(`Agent session ${newStatus}, reloading files...`);
            loadFiles();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionChannel);
    };
  }, [activeSessionId, projectId]);

  // Real-time subscription for agent file operations
  useEffect(() => {
    if (!activeSessionId) return;

    const operationsChannel = supabase
      .channel(`agent-operations-${activeSessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_file_operations",
          filter: `session_id=eq.${activeSessionId}`,
        },
        (payload) => {
          console.log("Agent file operation:", payload.new);
          const operation = payload.new as any;
          // Reload files when agent completes file operations
          if (operation.status === "completed" && operation.operation_type !== "search" && operation.operation_type !== "read") {
            console.log("Agent file operation completed, reloading files...");
            loadFiles();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(operationsChannel);
    };
  }, [activeSessionId]);

  const loadFiles = async () => {
    if (!defaultRepo) return;

    try {
      // Load committed files
      const { data: committedFiles, error: filesError } = await supabase.rpc(
        "get_project_files_with_token",
        {
          p_project_id: projectId!,
          p_token: shareToken || null,
        },
      );

      if (filesError) throw filesError;

      // Load staged changes
      const { data: staged, error: stagedError } = await supabase.rpc(
        "get_staged_changes_with_token",
        {
          p_repo_id: defaultRepo.id,
          p_token: shareToken || null,
        },
      );

      if (stagedError) throw stagedError;

      setStagedChanges(staged || []);

      // Build comprehensive file list including all staged changes
      const stagedMap = new Map((staged || []).map((s: any) => [s.file_path, s]));
      const allFiles: Array<{ id: string; path: string; isStaged?: boolean }> = [];

      // Add all committed files, marking them as staged if they have pending changes
      (committedFiles || []).forEach((f: any) => {
        const stagedChange = stagedMap.get(f.path);
        if (stagedChange && stagedChange.operation_type !== "delete") {
          // File has staged edits/renames - mark as staged
          allFiles.push({
            id: f.id,
            path: f.path,
            isStaged: true,
          });
        } else if (!stagedChange || stagedChange.operation_type !== "delete") {
          // Regular committed file without staged changes (or not being deleted)
          allFiles.push({
            id: f.id,
            path: f.path,
          });
        }
        // Skip deleted files - they won't appear in the tree
      });

      // Add new staged files that don't exist in committed files
      (staged || []).forEach((change: any) => {
        if (change.operation_type === "add") {
          const existsInCommitted = (committedFiles || []).some(
            (f: any) => f.path === change.file_path,
          );
          if (!existsInCommitted) {
            allFiles.push({
              id: change.id,
              path: change.file_path,
              isStaged: true,
            });
          }
        }
        // Handle renames - add the new path
        if (change.operation_type === "rename" && change.old_path) {
          const existsInCommitted = (committedFiles || []).some(
            (f: any) => f.path === change.file_path,
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
      toast({
        title: "Error",
        description: "Failed to load project files",
        variant: "destructive",
      });
    }
  };

  const handleSelectFile = (fileId: string, path: string, isStaged?: boolean) => {
    setSelectedFileId(fileId);
    setSelectedFilePath(path);
    setSelectedFileIsStaged(isStaged || false);
    setSelectedDiff(null);
    setDiffEnabled(false);
  };

  const handleAttachToPrompt = (fileId: string, path: string) => {
    if (!attachedFiles.find((f) => f.id === fileId)) {
      setAttachedFiles([...attachedFiles, { id: fileId, path }]);
      toast({
        title: "File Attached",
        description: `${path} attached to prompt`,
      });
    }
  };

  const handleRemoveAttachedFile = (fileId: string) => {
    setAttachedFiles(attachedFiles.filter((f) => f.id !== fileId));
  };

  const handleReviewFile = (fileId: string, path: string) => {
    toast({
      title: "Review Task",
      description: `CodingAgent will review ${path}`,
    });
    // TODO: Trigger agent review task
  };

  const handleEditFile = (fileId: string, path: string) => {
    toast({
      title: "Edit Task",
      description: `CodingAgent will edit ${path}`,
    });
    // TODO: Trigger agent edit task
  };

  const handleAuditFile = (fileId: string, path: string) => {
    toast({
      title: "Audit Task",
      description: `CodingAgent will audit ${path} against requirements`,
    });
    // TODO: Trigger agent audit task
  };

  const handleSubmitTask = (sessionId: string) => {
    setActiveSessionId(sessionId);
    if (projectId) {
      sessionStorage.setItem(`activeAgentSession_${projectId}`, sessionId);
    }
    toast({
      title: "Task Started",
      description: "Monitor progress in the Progress tab",
    });
  };

  const handleViewDiff = (change: any) => {
    setSelectedDiff({
      old: change.old_content || "",
      new: change.new_content || "",
      path: change.file_path,
    });
    setDiffEnabled(true);
    // Keep file selected so diff toggle can return to editor
    const fileInfo = files.find((f) => f.path === change.file_path);
    if (fileInfo) {
      setSelectedFileId(fileInfo.id);
      setSelectedFilePath(fileInfo.path);
      setSelectedFileIsStaged(fileInfo.isStaged || false);
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
    <div className="min-h-screen bg-background">
      <PrimaryNav />

      <div className="flex relative">
        <ProjectSidebar
          projectId={projectId}
          isOpen={isSidebarOpen}
          onOpenChange={setIsSidebarOpen}
        />

        <main className="flex-1 w-full">
          <div className="flex flex-col h-screen">
            <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex h-14 items-center gap-2 px-3 md:px-6">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSidebarOpen(true)}
                  className="shrink-0 h-8 w-8 md:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-4 w-4" />
                </Button>
                <h1 className="text-base md:text-lg font-semibold">Build</h1>
              </div>
            </div>

            {/* Mobile Layout (< md) - Full Screen Tabs */}
            <div className="md:hidden flex-1 min-h-0 overflow-hidden">
              <Tabs defaultValue="files" className="h-full flex flex-col">
                <TabsList className="grid w-full grid-cols-6 shrink-0">
                  <TabsTrigger value="files" className="text-xs">
                    Files
                  </TabsTrigger>
                  <TabsTrigger value="agent" className="text-xs">
                    Agent
                  </TabsTrigger>
                  <TabsTrigger value="chat" className="text-xs">
                    Chat
                  </TabsTrigger>
                  <TabsTrigger value="progress" className="text-xs">
                    Progress
                  </TabsTrigger>
                  <TabsTrigger value="staging" className="text-xs">
                    Staging
                  </TabsTrigger>
                  <TabsTrigger value="history" className="text-xs">
                    History
                  </TabsTrigger>
                </TabsList>

                {/* Files tab: file tree, then code editor / diff viewer */}
                <TabsContent
                  value="files"
                  className="flex-1 min-h-0 overflow-hidden mt-0 flex flex-col"
                >
                  {selectedFileId || selectedDiff ? (
                    <div className="h-full flex flex-col">
                      <div className="px-3 py-2 border-b flex items-center justify-between">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedFileId(null);
                            setSelectedFilePath(null);
                            setSelectedDiff(null);
                            setDiffEnabled(false);
                          }}
                        >
                          ← Back to Files
                        </Button>
                        {selectedFileId && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Checkbox
                              id="mobile-diff-toggle"
                              checked={diffEnabled}
                              onCheckedChange={(checked) => {
                                const enabled = Boolean(checked);
                                setDiffEnabled(enabled);
                                if (enabled) {
                                  const stagedChange = stagedChanges.find(
                                    (c: any) => c.file_path === selectedFilePath,
                                  );
                                  if (stagedChange) {
                                    handleViewDiff(stagedChange);
                                  }
                                } else {
                                  setSelectedDiff(null);
                                }
                              }}
                            />
                            <label htmlFor="mobile-diff-toggle" className="cursor-pointer">
                              Show diff
                            </label>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden">
                        {selectedDiff ? (
                          <CodeEditor
                            fileId={selectedFileId}
                            filePath={selectedDiff.path}
                            repoId={defaultRepo?.id || ""}
                            isStaged={selectedFileIsStaged}
                            initialContent={selectedDiff.new}
                            showDiff={true}
                            diffOldContent={selectedDiff.old}
                            onClose={() => {
                              setSelectedFileId(null);
                              setSelectedFilePath(null);
                              setSelectedDiff(null);
                            }}
                            onSave={loadFiles}
                            onAutoSync={loadFiles}
                          />
                        ) : (
                          <CodeEditor
                            fileId={selectedFileId}
                            filePath={selectedFilePath}
                            repoId={defaultRepo?.id || ""}
                            isStaged={selectedFileIsStaged}
                            onClose={() => {
                              setSelectedFileId(null);
                              setSelectedFilePath(null);
                              setSelectedFileIsStaged(false);
                            }}
                            onSave={loadFiles}
                            onAutoSync={loadFiles}
                          />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col">
                      <div className="px-3 py-2 border-b">
                        <h3 className="text-sm font-semibold">Repository Files</h3>
                      </div>
                      <div className="flex-1 min-h-0 overflow-auto">
                        <AgentFileTree
                          files={files}
                          stagedChanges={stagedChanges}
                          selectedFileId={selectedFileId}
                          onSelectFile={handleSelectFile}
                          onAttachToPrompt={handleAttachToPrompt}
                          onReviewFile={handleReviewFile}
                          onEditFile={handleEditFile}
                          onAuditFile={handleAuditFile}
                        />
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent
                  value="agent"
                  className="flex-1 min-h-0 overflow-hidden mt-0 p-3 flex flex-col"
                >
                  <AgentPromptPanel
                    attachedFiles={attachedFiles}
                    onRemoveFile={handleRemoveAttachedFile}
                    onSubmitTask={handleSubmitTask}
                    projectId={projectId}
                    repoId={defaultRepo?.id || ""}
                    shareToken={shareToken}
                  />
                </TabsContent>

                <TabsContent
                  value="chat"
                  className="flex-1 min-h-0 overflow-hidden mt-0 p-0 flex flex-row gap-0"
                >
                  <div className="w-64 border-r flex-shrink-0">
                    <AgentSessionsList
                      projectId={projectId!}
                      shareToken={shareToken}
                      activeSessionId={activeSessionId}
                      onSelectSession={setActiveSessionId}
                    />
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden p-3">
                    <AgentChatViewer
                      sessionId={activeSessionId}
                      shareToken={shareToken}
                    />
                  </div>
                </TabsContent>

                <TabsContent
                  value="progress"
                  className="flex-1 min-h-0 overflow-hidden mt-0 p-0 flex flex-row gap-0"
                >
                  <div className="w-64 border-r flex-shrink-0">
                    <AgentSessionsList
                      projectId={projectId!}
                      shareToken={shareToken}
                      activeSessionId={activeSessionId}
                      onSelectSession={setActiveSessionId}
                    />
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden p-3">
                    <AgentProgressMonitor
                      sessionId={activeSessionId}
                      shareToken={shareToken}
                    />
                  </div>
                </TabsContent>

                <TabsContent
                  value="staging"
                  className="flex-1 min-h-0 overflow-hidden mt-0 p-3 flex flex-col"
                >
                  <StagingPanel projectId={projectId} onViewDiff={handleViewDiff} />
                </TabsContent>

                <TabsContent
                  value="history"
                  className="flex-1 min-h-0 overflow-hidden mt-0 p-3 flex flex-col"
                >
                  <CommitHistory projectId={projectId} />
                </TabsContent>
              </Tabs>
            </div>

            {/* Desktop Layout (>= md) - Resizable Panels */}
            <div className="hidden md:flex flex-1 overflow-hidden">
              <ResizablePanelGroup direction="horizontal" className="w-full h-full">
                {/* Left: File Tree */}
                <ResizablePanel defaultSize={20} minSize={15}>
                  <div className="h-full border-r">
                    <div className="px-3 py-2 border-b">
                      <h3 className="text-sm font-semibold">Files</h3>
                    </div>
                    <AgentFileTree
                      files={files}
                      stagedChanges={stagedChanges}
                      selectedFileId={selectedFileId}
                      onSelectFile={handleSelectFile}
                      onAttachToPrompt={handleAttachToPrompt}
                      onReviewFile={handleReviewFile}
                      onEditFile={handleEditFile}
                      onAuditFile={handleAuditFile}
                    />
                  </div>
                </ResizablePanel>

                <ResizableHandle />

                {/* Center: Code Editor or Diff Viewer */}
                <ResizablePanel defaultSize={40} minSize={30}>
                  <div className="h-full flex flex-col">
                    {selectedFileId && (
                      <div className="px-4 py-2 border-b bg-[#252526] flex items-center gap-4">
                        <div className="flex items-center gap-2 text-xs text-[#cccccc]">
                          <Checkbox
                            id="desktop-diff-toggle"
                            checked={diffEnabled}
                            onCheckedChange={(checked) => {
                              const enabled = Boolean(checked);
                              setDiffEnabled(enabled);
                              if (enabled) {
                                const stagedChange = stagedChanges.find(
                                  (c: any) => c.file_path === selectedFilePath,
                                );
                                if (stagedChange) {
                                  handleViewDiff(stagedChange);
                                }
                              } else {
                                setSelectedDiff(null);
                              }
                            }}
                          />
                          <label htmlFor="desktop-diff-toggle" className="cursor-pointer">
                            Show diff
                          </label>
                        </div>
                      </div>
                    )}
                    <div className="flex-1 min-h-0 overflow-hidden">
                      {selectedDiff ? (
                        <CodeEditor
                          fileId={selectedFileId}
                          filePath={selectedDiff.path}
                          repoId={defaultRepo?.id || ""}
                          isStaged={selectedFileIsStaged}
                          initialContent={selectedDiff.new}
                          showDiff={true}
                          diffOldContent={selectedDiff.old}
                          onClose={() => {
                            setSelectedFileId(null);
                            setSelectedFilePath(null);
                            setSelectedDiff(null);
                            setDiffEnabled(false);
                          }}
                          onAutoSync={loadFiles}
                        />
                      ) : (
                        <CodeEditor
                          fileId={selectedFileId}
                          filePath={selectedFilePath}
                          repoId={defaultRepo?.id || ""}
                          isStaged={selectedFileIsStaged}
                          onClose={() => {
                            setSelectedFileId(null);
                            setSelectedFilePath(null);
                            setSelectedFileIsStaged(false);
                          }}
                          onAutoSync={loadFiles}
                        />
                      )}
                    </div>
                  </div>
                </ResizablePanel>

                <ResizableHandle />

                {/* Right: Tabs for Agent/Progress/Staging/History */}
                <ResizablePanel defaultSize={40} minSize={25}>
                  <Tabs defaultValue="agent" className="h-full flex flex-col">
                    <TabsList className="grid w-full grid-cols-5 shrink-0">
                      <TabsTrigger value="agent">Agent</TabsTrigger>
                      <TabsTrigger value="chat">Chat</TabsTrigger>
                      <TabsTrigger value="progress">Progress</TabsTrigger>
                      <TabsTrigger value="staging">Staging</TabsTrigger>
                      <TabsTrigger value="history">History</TabsTrigger>
                    </TabsList>

                    <TabsContent
                      value="agent"
                      className="flex-1 overflow-hidden mt-0 p-4 flex flex-col"
                    >
                      <AgentPromptPanel
                        attachedFiles={attachedFiles}
                        onRemoveFile={handleRemoveAttachedFile}
                        onSubmitTask={handleSubmitTask}
                        projectId={projectId}
                        repoId={defaultRepo?.id || ""}
                        shareToken={shareToken}
                      />
                    </TabsContent>

                    <TabsContent
                      value="chat"
                      className="flex-1 overflow-hidden mt-0 p-0 flex flex-row gap-0"
                    >
                      <div className="w-64 border-r flex-shrink-0">
                        <AgentSessionsList
                          projectId={projectId!}
                          shareToken={shareToken}
                          activeSessionId={activeSessionId}
                          onSelectSession={setActiveSessionId}
                        />
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden p-4">
                        <AgentChatViewer
                          sessionId={activeSessionId}
                          shareToken={shareToken}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent
                      value="progress"
                      className="flex-1 overflow-hidden mt-0 p-0 flex flex-row gap-0"
                    >
                      <div className="w-64 border-r flex-shrink-0">
                        <AgentSessionsList
                          projectId={projectId!}
                          shareToken={shareToken}
                          activeSessionId={activeSessionId}
                          onSelectSession={setActiveSessionId}
                        />
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden p-4">
                        <AgentProgressMonitor
                          sessionId={activeSessionId}
                          shareToken={shareToken}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent
                      value="staging"
                      className="flex-1 overflow-auto mt-0 p-4"
                    >
                      <StagingPanel
                        projectId={projectId}
                        onViewDiff={handleViewDiff}
                      />
                    </TabsContent>

                    <TabsContent
                      value="history"
                      className="flex-1 overflow-auto mt-0 p-4"
                    >
                      <CommitHistory projectId={projectId} />
                    </TabsContent>
                  </Tabs>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
