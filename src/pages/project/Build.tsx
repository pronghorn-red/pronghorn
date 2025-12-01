import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StagingPanel } from "@/components/build/StagingPanel";
import { CommitHistory } from "@/components/build/CommitHistory";
import { CodeEditor } from "@/components/repository/CodeEditor";
import { AgentFileTree } from "@/components/build/AgentFileTree";
import { AgentPromptPanel } from "@/components/build/AgentPromptPanel";
import { DiffViewer } from "@/components/build/DiffViewer";
import { AgentProgressMonitor } from "@/components/build/AgentProgressMonitor";
import { useRealtimeRepos } from "@/hooks/useRealtimeRepos";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

export default function Build() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");
  const { toast } = useToast();

  const { repos, loading: reposLoading } = useRealtimeRepos(projectId);
  const defaultRepo = repos.find(r => r.is_default);

  const [files, setFiles] = useState<Array<{ id: string; path: string }>>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; path: string }>>([]);
  const [stagedChanges, setStagedChanges] = useState<any[]>([]);
  const [selectedDiff, setSelectedDiff] = useState<{ old: string; new: string; path: string } | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Load files from default repo
  useEffect(() => {
    if (defaultRepo && projectId) {
      loadFiles();
    }
  }, [defaultRepo, projectId, shareToken]);

  const loadFiles = async () => {
    if (!defaultRepo) return;

    try {
      const { data, error } = await supabase.rpc("get_project_files_with_token", {
        p_project_id: projectId!,
        p_token: shareToken || null,
      });

      if (error) throw error;
      setFiles(data || []);
    } catch (error) {
      console.error("Error loading files:", error);
      toast({
        title: "Error",
        description: "Failed to load project files",
        variant: "destructive",
      });
    }
  };

  const handleSelectFile = (fileId: string, path: string) => {
    setSelectedFileId(fileId);
    setSelectedFilePath(path);
    setSelectedDiff(null);
  };

  const handleAttachToPrompt = (fileId: string, path: string) => {
    if (!attachedFiles.find(f => f.id === fileId)) {
      setAttachedFiles([...attachedFiles, { id: fileId, path }]);
      toast({
        title: "File Attached",
        description: `${path} attached to prompt`,
      });
    }
  };

  const handleRemoveAttachedFile = (fileId: string) => {
    setAttachedFiles(attachedFiles.filter(f => f.id !== fileId));
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

  const handleSubmitTask = (prompt: string, fileIds: string[]) => {
    toast({
      title: "Task Submitted",
      description: "CodingAgent will process your task",
    });
    // TODO: Trigger agent orchestration
  };

  const handleViewDiff = (change: any) => {
    setSelectedDiff({
      old: change.old_content || "",
      new: change.new_content || "",
      path: change.file_path,
    });
    setSelectedFileId(null);
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
        <ProjectSidebar projectId={projectId} />
        
        <main className="flex-1 w-full">
          <div className="flex flex-col h-screen">
            <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex h-14 items-center px-3 md:px-6">
                <h1 className="text-base md:text-lg font-semibold">Build</h1>
              </div>
            </div>

            {/* Mobile Layout (< md) - Full Screen Tabs */}
            <div className="flex-1 md:hidden overflow-hidden">
              <Tabs defaultValue="files" className="h-full flex flex-col">
                <TabsList className="grid w-full grid-cols-5 shrink-0">
                  <TabsTrigger value="files" className="text-xs">Files</TabsTrigger>
                  <TabsTrigger value="agent" className="text-xs">Agent</TabsTrigger>
                  <TabsTrigger value="progress" className="text-xs">Progress</TabsTrigger>
                  <TabsTrigger value="staging" className="text-xs">Staging</TabsTrigger>
                  <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
                </TabsList>

                <TabsContent value="files" className="flex-1 overflow-hidden mt-0">
                  <div className="h-full flex flex-col">
                    <div className="px-3 py-2 border-b">
                      <h3 className="text-sm font-semibold">Repository Files</h3>
                    </div>
                    <div className="flex-1 overflow-auto">
                      <AgentFileTree
                        files={files}
                        selectedFileId={selectedFileId}
                        onSelectFile={handleSelectFile}
                        onAttachToPrompt={handleAttachToPrompt}
                        onReviewFile={handleReviewFile}
                        onEditFile={handleEditFile}
                        onAuditFile={handleAuditFile}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="agent" className="flex-1 overflow-auto mt-0 p-3">
                  <AgentPromptPanel
                    attachedFiles={attachedFiles}
                    onRemoveFile={handleRemoveAttachedFile}
                    onSubmitTask={handleSubmitTask}
                  />
                </TabsContent>

                <TabsContent value="progress" className="flex-1 overflow-auto mt-0 p-3">
                  <AgentProgressMonitor 
                    sessionId={activeSessionId}
                    shareToken={shareToken}
                  />
                </TabsContent>

                <TabsContent value="staging" className="flex-1 overflow-auto mt-0 p-3">
                  <StagingPanel projectId={projectId} onViewDiff={handleViewDiff} />
                </TabsContent>

                <TabsContent value="history" className="flex-1 overflow-auto mt-0 p-3">
                  <CommitHistory projectId={projectId} />
                </TabsContent>
              </Tabs>
            </div>

            {/* Desktop Layout (>= md) - Resizable Panels */}
            <ResizablePanelGroup direction="horizontal" className="hidden md:flex flex-1">
              {/* Left: File Tree */}
              <ResizablePanel defaultSize={20} minSize={15}>
                <div className="h-full border-r">
                  <div className="px-3 py-2 border-b">
                    <h3 className="text-sm font-semibold">Files</h3>
                  </div>
                  <AgentFileTree
                    files={files}
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
                <div className="h-full">
                  {selectedDiff ? (
                    <DiffViewer
                      oldContent={selectedDiff.old}
                      newContent={selectedDiff.new}
                      filePath={selectedDiff.path}
                    />
                  ) : (
                    <CodeEditor
                      fileId={selectedFileId}
                      filePath={selectedFilePath}
                      repoId={defaultRepo?.id || ""}
                      onClose={() => {
                        setSelectedFileId(null);
                        setSelectedFilePath(null);
                      }}
                      onSave={loadFiles}
                    />
                  )}
                </div>
              </ResizablePanel>

              <ResizableHandle />

              {/* Right: Tabs for Agent/Progress/Staging/History */}
              <ResizablePanel defaultSize={40} minSize={25}>
                <Tabs defaultValue="agent" className="h-full flex flex-col">
                  <TabsList className="grid w-full grid-cols-4 shrink-0">
                    <TabsTrigger value="agent">Agent</TabsTrigger>
                    <TabsTrigger value="progress">Progress</TabsTrigger>
                    <TabsTrigger value="staging">Staging</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                  </TabsList>

                  <TabsContent value="agent" className="flex-1 overflow-hidden mt-0 p-4">
                    <AgentPromptPanel
                      attachedFiles={attachedFiles}
                      onRemoveFile={handleRemoveAttachedFile}
                      onSubmitTask={handleSubmitTask}
                    />
                  </TabsContent>

                  <TabsContent value="progress" className="flex-1 overflow-hidden mt-0 p-4">
                    <AgentProgressMonitor 
                      sessionId={activeSessionId}
                      shareToken={shareToken}
                    />
                  </TabsContent>

                  <TabsContent value="staging" className="flex-1 overflow-auto mt-0 p-4">
                    <StagingPanel projectId={projectId} onViewDiff={handleViewDiff} />
                  </TabsContent>

                  <TabsContent value="history" className="flex-1 overflow-auto mt-0 p-4">
                    <CommitHistory projectId={projectId} />
                  </TabsContent>
                </Tabs>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </main>
      </div>
    </div>
  );
}
