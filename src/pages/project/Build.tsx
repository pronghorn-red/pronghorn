import { useState, useEffect, useRef, useCallback } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { useParams } from "react-router-dom";
import { useShareToken } from "@/hooks/useShareToken";
import { TokenRecoveryMessage } from "@/components/project/TokenRecoveryMessage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { AgentFileTree } from "@/components/build/AgentFileTree";
import { CodeEditor, CodeEditorHandle } from "@/components/repository/CodeEditor";
import { StagingPanel } from "@/components/build/StagingPanel";
import { CommitHistory } from "@/components/build/CommitHistory";
import { UnifiedAgentInterface } from "@/components/build/UnifiedAgentInterface";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRealtimeRepos } from "@/hooks/useRealtimeRepos";
import { useFileBuffer } from "@/hooks/useFileBuffer";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Menu, FilePlus, FolderPlus, Eye, EyeOff, Upload, Trash2 } from "lucide-react";
import { CreateFileDialog } from "@/components/repository/CreateFileDialog";
import { RenameDialog } from "@/components/repository/RenameDialog";
import { stageFile } from "@/lib/stagingOperations";

const BINARY_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'pdf', 'zip', 'tar', 'gz', 'exe', 'dll', 'so', 'dylib', 'woff', 'woff2', 'ttf', 'eot', 'mp3', 'mp4', 'wav', 'ogg', 'webm', 'avi', 'mov'];

function isBinaryFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return BINARY_EXTENSIONS.includes(ext || '');
}

export default function Build() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token: shareToken, isTokenSet, tokenMissing } = useShareToken(projectId || null);
  const isMobile = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<CodeEditorHandle>(null);

  const { repos } = useRealtimeRepos(projectId || null, shareToken);
  // Use Prime repo for file operations (source of truth), fallback to default
  const defaultRepo = repos.find((r) => r.is_prime) || repos.find((r) => r.is_default);

  const [files, setFiles] = useState<Array<{ id: string; path: string; isStaged?: boolean }>>([]);
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
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [itemToRename, setItemToRename] = useState<{ id: string; path: string; type: "file" | "folder" } | null>(null);
  const [autoCommit, setAutoCommit] = useState(false);
  const [desktopActiveTab, setDesktopActiveTab] = useState("chat");
  const [stagingRefreshTrigger, setStagingRefreshTrigger] = useState(0);

  // File buffer system for instant file switching and background saves
  const {
    currentFile,
    currentPath,
    hasDirtyFiles,
    isSaving,
    switchFile,
    updateContent,
    saveCurrentFile,
    saveAllDirty,
    closeFile,
    clearFile,
    reloadCurrentFile,
  } = useFileBuffer({
    repoId: defaultRepo?.id,
    shareToken: shareToken || null,
    onFileSaved: () => {
      // Will be called after file is saved - reload files list
      if (defaultRepo && projectId) {
        loadFilesRef.current?.();
      }
    },
  });

  // Ref to hold loadFiles function for callback
  const loadFilesRef = useRef<(() => void) | null>(null);

  // Helper function to get unique file path with " (Copy)" suffix
  const getUniqueFilePath = (desiredPath: string, existingPaths: string[]): string => {
    if (!existingPaths.includes(desiredPath)) {
      return desiredPath;
    }
    
    // Split path into directory, name, and extension
    const lastSlash = desiredPath.lastIndexOf('/');
    const directory = lastSlash >= 0 ? desiredPath.substring(0, lastSlash + 1) : '';
    const filename = lastSlash >= 0 ? desiredPath.substring(lastSlash + 1) : desiredPath;
    
    const lastDot = filename.lastIndexOf('.');
    const baseName = lastDot > 0 ? filename.substring(0, lastDot) : filename;
    const extension = lastDot > 0 ? filename.substring(lastDot) : '';
    
    // Append " (Copy)" until unique
    let copyNumber = 1;
    let newPath: string;
    do {
      const suffix = copyNumber === 1 ? ' (Copy)' : ` (Copy ${copyNumber})`;
      newPath = `${directory}${baseName}${suffix}${extension}`;
      copyNumber++;
    } while (existingPaths.includes(newPath));
    
    return newPath;
  };

  // Load files function - defined as useCallback before useEffects that use it
  const loadFiles = useCallback(async () => {
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

      // Filter to Prime repo files only
      const primeRepoFiles = (committedFiles || []).filter(
        (f: any) => f.repo_id === defaultRepo.id
      );

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

      // Create a set of old_paths from rename operations to filter out original files
      const renamedFromPaths = new Set(
        (staged || [])
          .filter((s: any) => s.operation_type === "rename" && s.old_path)
          .map((s: any) => s.old_path)
      );

      // Add all committed files from Prime repo (excluding those being renamed from)
      primeRepoFiles.forEach((f: any) => {
        // Skip files that are being renamed (old path)
        if (renamedFromPaths.has(f.path)) {
          return;
        }
        
        const stagedChange = stagedMap.get(f.path);
        // Filter out deleted files if toggle is off
        if (!showDeletedFiles && stagedChange?.operation_type === "delete") {
          return;
        }
        // Use staging ID if file is staged, otherwise use repo_files ID
        allFiles.push({
          id: stagedChange ? stagedChange.id : f.id,
          path: f.path,
          isStaged: stagedChange ? true : false,
        });
      });

      // Add new staged files (add and rename operations create new paths)
      (staged || []).forEach((change: any) => {
        if (change.operation_type === "add" || change.operation_type === "rename") {
          const existsInCommitted = primeRepoFiles.some(
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
  }, [defaultRepo, projectId, shareToken, showDeletedFiles]);

  // Assign loadFiles to ref for callback use
  loadFilesRef.current = loadFiles;

  // Load files from default repo
  useEffect(() => {
    if (defaultRepo && projectId && isTokenSet) {
      loadFiles();
    }
  }, [defaultRepo, projectId, isTokenSet, loadFiles]);

  // Real-time subscription for file and staging changes
  useEffect(() => {
    if (!projectId || !defaultRepo || !isTokenSet) return;

    console.log("Setting up file tree real-time subscriptions for project:", projectId);

    // Channel for repo_files changes and repo_files_refresh broadcasts
    const filesChannel = supabase
       .channel(`repo-changes-${projectId}`)
       .on(
         "broadcast",
         { event: "repo_files_refresh" },
         (payload) => {
           console.log("Received repo files refresh broadcast:", payload);
           loadFiles();
         }
       )
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
       .subscribe((status) => {
         console.log(`[Build] Files channel subscription status: ${status}`);
       });

    // Separate channel for staging changes - listens for staging_refresh broadcasts
    const stagingChannel = supabase
      .channel(`repo-staging-${defaultRepo.id}`)
      .on(
        "broadcast",
        { event: "staging_refresh" },
        (payload) => {
          console.log("Received staging_refresh broadcast:", payload);
          loadFiles();
          
          // If current file was affected, reload it
          if (currentPathRef.current && !hasDirtyFilesRef.current) {
            reloadCurrentFileRef.current?.();
          }
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
          
          // Clear buffer for changed file so it reloads fresh from DB
          const changedPath = (payload.new as any)?.file_path || (payload.old as any)?.file_path;
          if (changedPath) {
            // Clear from buffer to force fresh load on next access
            clearFileRef.current?.(changedPath);
          }
          
          loadFiles();
          
          // If the changed file is currently open in the editor, reload it from DB
          if (changedPath && changedPath === currentPathRef.current) {
            if (!hasDirtyFilesRef.current) {
              // User has no unsaved changes - safe to reload
              console.log("Reloading current file due to external change:", changedPath);
              reloadCurrentFileRef.current?.();
            } else {
              // User has unsaved changes - notify them
              toast.info("File updated externally - save your changes to see updates");
            }
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Build] Staging channel subscription status: ${status}`);
      });

    return () => {
      supabase.removeChannel(filesChannel);
      supabase.removeChannel(stagingChannel);
    };
  }, [projectId, defaultRepo, isTokenSet, loadFiles]);

  // Handle editor save - buffer handles save, we just need to reload files
  const handleEditorSave = useCallback(() => {
    saveCurrentFile();
  }, [saveCurrentFile]);
  // Refs for stable access in effects - prevents re-running effects on every keystroke
  const saveAllDirtyRef = useRef(saveAllDirty);
  const hasDirtyFilesRef = useRef(hasDirtyFiles);
  const currentPathRef = useRef(currentPath);
  const reloadCurrentFileRef = useRef(reloadCurrentFile);
  const clearFileRef = useRef(clearFile);
  saveAllDirtyRef.current = saveAllDirty;
  hasDirtyFilesRef.current = hasDirtyFiles;
  currentPathRef.current = currentPath;
  reloadCurrentFileRef.current = reloadCurrentFile;
  clearFileRef.current = clearFile;

  // Beforeunload handler for tab/page close - save dirty files
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasDirtyFilesRef.current) {
        saveAllDirtyRef.current?.();
        e.preventDefault();
        e.returnValue = "Saving changes...";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []); // Empty deps - runs once, uses refs for latest values

  // Cleanup: save dirty files when navigating away (component unmount only)
  useEffect(() => {
    return () => {
      saveAllDirtyRef.current?.();
    };
  }, []); // Empty deps - cleanup runs only on unmount

  // Instant file switching - no blocking
  const handleSelectFile = (fileId: string, path: string, isStaged?: boolean) => {
    // Track folder selection for context-aware file/folder creation
    const file = files.find(f => f.path === path);
    if (file && path.includes('/')) {
      const folderPath = path.substring(0, path.lastIndexOf('/'));
      setSelectedFolderPath(folderPath);
    } else {
      setSelectedFolderPath('/');
    }

    // Instant switch - buffer handles dirty file saving in background
    // Force reload for staged files to ensure fresh content from DB
    switchFile(fileId, path, isStaged, isStaged);
    
    // On mobile, switch to editor tab when a file is selected
    if (isMobile) {
      setMobileActiveTab("editor");
    }
  };

  // Handle close with autosave
  const handleCloseEditor = useCallback(async () => {
    await closeFile();
  }, [closeFile]);

  const handleCreateFile = async (name: string) => {
    if (!defaultRepo || !projectId) return;

    try {
      let fullPath = selectedFolderPath && selectedFolderPath !== '/'
        ? `${selectedFolderPath}/${name}` 
        : name;

      // Get unique path to prevent duplicates
      const existingPaths = files.map(f => f.path);
      const originalPath = fullPath;
      fullPath = getUniqueFilePath(fullPath, existingPaths);
      
      if (fullPath !== originalPath) {
        toast.warning(`Path already exists. Creating as: ${fullPath.split('/').pop()}`);
      }

      if (createType === "folder") {
        // Stage .gitkeep file in folder as add operation
        await stageFile({
          repoId: defaultRepo.id,
          shareToken: shareToken || null,
          filePath: `${fullPath}/.gitkeep`,
          operationType: "add",
          newContent: "",
        });
      } else {
        // Stage new file as add operation
        await stageFile({
          repoId: defaultRepo.id,
          shareToken: shareToken || null,
          filePath: fullPath,
          operationType: "add",
          newContent: "",
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

  const handleRenameFile = (fileId: string, path: string) => {
    const isFolder = !path.includes('.') || path.endsWith('/');
    setItemToRename({ id: fileId, path, type: isFolder ? "folder" : "file" });
    setRenameDialogOpen(true);
  };

  const handleConfirmRename = async (newName: string) => {
    if (!itemToRename || !defaultRepo || !projectId) return;
    
    const oldPath = itemToRename.path;
    const lastSlash = oldPath.lastIndexOf('/');
    const directory = lastSlash >= 0 ? oldPath.substring(0, lastSlash + 1) : '';
    let newPath = `${directory}${newName}`;
    
    // Check for duplicates and get unique path
    const existingPaths = files.map(f => f.path);
    newPath = getUniqueFilePath(newPath, existingPaths.filter(p => p !== oldPath));
    
    if (newPath !== `${directory}${newName}`) {
      toast.warning(`Path already exists. Renamed to: ${newPath.split('/').pop()}`);
    }
    
    try {
      // Get old content for staging
      let oldContent: string | null = null;
      const stagedFile = stagedChanges.find(s => s.file_path === oldPath);
      
      if (stagedFile?.new_content) {
        oldContent = stagedFile.new_content;
      } else {
        const fileRecord = files.find(f => f.path === oldPath);
        if (fileRecord) {
          const { data: fileData } = await supabase.rpc("get_file_content_with_token", {
            p_file_id: fileRecord.id,
            p_token: shareToken || null,
          });
          if (fileData && fileData.length > 0) {
            oldContent = fileData[0].content;
          }
        }
      }
      
      // Stage the rename
      await stageFile({
        repoId: defaultRepo.id,
        shareToken: shareToken || null,
        filePath: newPath,
        operationType: "rename",
        oldPath: oldPath,
        oldContent: oldContent,
        newContent: oldContent,
      });

      toast.success(`Renamed to ${newPath.split('/').pop()}`);
      setRenameDialogOpen(false);
      setItemToRename(null);
      loadFiles();
    } catch (error: any) {
      console.error("Error renaming file:", error);
      toast.error(error.message || "Failed to rename file");
    }
  };

  const handleDeleteFromContext = async (fileId: string, path: string) => {
    if (!defaultRepo || !projectId) {
      toast.error("No repository available");
      return;
    }

    try {
      let oldContent: string | null = null;
      const stagedFile = stagedChanges.find(s => s.file_path === path);
      
      if (!stagedFile) {
        const { data: fileData } = await supabase.rpc("get_file_content_with_token", {
          p_file_id: fileId,
          p_token: shareToken || null,
        });
        
        if (fileData && fileData.length > 0) {
          oldContent = fileData[0].content;
        }
      }

      await stageFile({
        repoId: defaultRepo.id,
        shareToken: shareToken || null,
        filePath: path,
        operationType: "delete",
        oldContent: oldContent,
        newContent: null,
      });

      toast.success(`Staged for deletion: ${path}`);
      if (currentPath === path) {
        closeFile();
      }
      loadFiles();
    } catch (error: any) {
      console.error("Error staging file for deletion:", error);
      toast.error(error.message || "Failed to stage file for deletion");
    }
  };

  const handleViewDiff = (change: any) => {
    const fileInfo = files.find((f) => f.path === change.file_path);
    if (fileInfo) {
      switchFile(fileInfo.id, fileInfo.path, true, true); // Force reload for staged file
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0 || !defaultRepo || !projectId) return;

    const existingPaths = files.map(f => f.path);

    for (const file of Array.from(uploadedFiles)) {
      try {
        let fullPath = selectedFolderPath && selectedFolderPath !== '/'
          ? `${selectedFolderPath}/${file.name}`
          : file.name;

        // Get unique path to prevent duplicates
        const originalPath = fullPath;
        fullPath = getUniqueFilePath(fullPath, existingPaths);
        
        if (fullPath !== originalPath) {
          toast.warning(`Path already exists. Uploading as: ${fullPath.split('/').pop()}`);
        }
        
        // Add to existing paths for subsequent files in the same upload
        existingPaths.push(fullPath);

        const isBinary = isBinaryFile(file.name);
        let content: string;

        if (isBinary) {
          // Read as base64 for binary files
          content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = (reader.result as string).split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        } else {
          // Read as text for text files
          content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsText(file);
          });
        }

        // Stage the file via edge function for broadcast
        await stageFile({
          repoId: defaultRepo.id,
          shareToken: shareToken || null,
          filePath: fullPath,
          operationType: "add",
          oldContent: null,
          newContent: content,
        });

        toast.success(`Uploaded and staged: ${fullPath.split('/').pop()}`);
      } catch (error: any) {
        console.error("Error uploading file:", error);
        toast.error(`Failed to upload ${file.name}: ${error.message || "Unknown error"}`);
      }
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    loadFiles();
  };

  const handleDeleteFile = async () => {
    if (!currentFile || !defaultRepo || !projectId) {
      toast.error("No file selected");
      return;
    }

    try {
      // Get the current content for the old_content field
      let oldContent: string | null = null;
      
      if (!currentFile.isStaged) {
        // Get content from committed files
        const { data: fileData, error: readError } = await supabase.rpc("get_file_content_with_token", {
          p_file_id: currentFile.id,
          p_token: shareToken || null,
        });
        
        if (!readError && fileData && fileData.length > 0) {
          oldContent = fileData[0].content;
        }
      }

      // Stage the file for deletion via edge function
      await stageFile({
        repoId: defaultRepo.id,
        shareToken: shareToken || null,
        filePath: currentFile.path,
        operationType: "delete",
        oldContent: oldContent,
        newContent: null,
      });

      toast.success(`Staged for deletion: ${currentFile.path}`);
      closeFile();
      loadFiles();
    } catch (error: any) {
      console.error("Error staging file for deletion:", error);
      toast.error(error.message || "Failed to stage file for deletion");
    }
  };

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  // Show token recovery message if token is missing
  if (tokenMissing) {
    return (
      <div className="flex flex-col bg-background h-screen">
        <PrimaryNav />
        <TokenRecoveryMessage />
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
                              onClick={() => fileInputRef.current?.click()}
                              className="h-6 w-6 hover:bg-[#2a2d2e] text-[#cccccc]"
                              title="Upload File"
                            >
                              <Upload className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleDeleteFile}
                              disabled={!currentFile}
                              className="h-6 w-6 hover:bg-[#2a2d2e] text-[#cccccc] disabled:opacity-50"
                              title="Delete File"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <input
                              ref={fileInputRef}
                              type="file"
                              multiple
                              className="hidden"
                              onChange={handleFileUpload}
                            />
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
                          selectedFilePath={currentPath}
                          onSelectFile={handleSelectFile}
                          onFolderSelect={setSelectedFolderPath}
                          onAttachToPrompt={handleAttachToPrompt}
                          onRenameFile={handleRenameFile}
                          onDeleteFile={handleDeleteFromContext}
                        />
                      </div>
                    </div>
                  </ResizablePanel>

                  <ResizableHandle withHandle />

                  {/* Center: Code Editor */}
                  <ResizablePanel defaultSize={isSidebarCollapsed ? 70 : 50} minSize={30}>
                    <div className="h-full">
                      {currentFile ? (
                        <CodeEditor
                          ref={editorRef}
                          key={currentFile.path}
                          fileId={currentFile.id}
                          filePath={currentFile.path}
                          repoId={defaultRepo?.id || ""}
                          isStaged={currentFile.isStaged}
                          bufferContent={currentFile.content}
                          bufferOriginalContent={currentFile.originalContent}
                          onContentChange={updateContent}
                          showDiff={showDiff}
                          onShowDiffChange={setShowDiff}
                          onClose={handleCloseEditor}
                          onSave={handleEditorSave}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full bg-[#1e1e1e] text-gray-400">
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
                          <div className="h-full w-full flex flex-col min-w-0 overflow-hidden">
                            <div className="flex items-center justify-between p-2 border-b shrink-0">
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
                          <Tabs value={desktopActiveTab} onValueChange={(v) => {
                            setDesktopActiveTab(v);
                            if (v === 'staging') {
                              setStagingRefreshTrigger(prev => prev + 1);
                            }
                          }} className="flex-1 flex flex-col min-h-0 min-w-0 w-full overflow-hidden">
                            {/* Fixed tabs header - cannot shrink */}
                            <div className="shrink-0 p-1 w-full">
                              <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="chat">Chat</TabsTrigger>
                                <TabsTrigger value="staging">Staging</TabsTrigger>
                                <TabsTrigger value="history">History</TabsTrigger>
                              </TabsList>
                            </div>

                            {/* Scrollable content area - constrained to remaining space */}
                            <div className="flex-1 min-h-0 min-w-0 w-full overflow-hidden">
                              <TabsContent value="chat" className="h-full w-full overflow-hidden mt-0">
                                <UnifiedAgentInterface
                                  projectId={projectId}
                                  repoId={defaultRepo?.id || null}
                                  shareToken={shareToken}
                                  attachedFiles={attachedFiles}
                                  onRemoveFile={handleRemoveAttachedFile}
                                  files={files}
                                  autoCommit={autoCommit}
                                  onAutoCommitChange={setAutoCommit}
                                />
                              </TabsContent>

                              <TabsContent value="staging" className="h-full w-full overflow-hidden mt-0">
                                <StagingPanel
                                  projectId={projectId}
                                  shareToken={shareToken}
                                  onViewDiff={handleViewDiff}
                                  autoCommit={autoCommit}
                                  onAutoCommitChange={setAutoCommit}
                                  refreshTrigger={stagingRefreshTrigger}
                                />
                              </TabsContent>

                              <TabsContent value="history" className="h-full w-full overflow-hidden mt-0">
                                <CommitHistory
                                  projectId={projectId}
                                  shareToken={shareToken}
                                />
                              </TabsContent>
                            </div>
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
                <Tabs value={mobileActiveTab} onValueChange={(v) => {
                  setMobileActiveTab(v);
                  if (v === 'staging') {
                    setStagingRefreshTrigger(prev => prev + 1);
                  }
                }} className="flex-1 flex flex-col min-h-0">
                  <TabsList className="grid w-full grid-cols-4 shrink-0">
                    <TabsTrigger value="files">Files</TabsTrigger>
                    <TabsTrigger value="editor">Editor</TabsTrigger>
                    <TabsTrigger value="chat">Chat</TabsTrigger>
                    <TabsTrigger value="staging">Stage</TabsTrigger>
                  </TabsList>

                  <TabsContent value="files" forceMount className="flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden">
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
                              onClick={() => fileInputRef.current?.click()}
                              className="h-6 w-6 hover:bg-[#2a2d2e] text-[#cccccc]"
                              title="Upload File"
                            >
                              <Upload className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleDeleteFile}
                              disabled={!currentFile}
                              className="h-6 w-6 hover:bg-[#2a2d2e] text-[#cccccc] disabled:opacity-50"
                              title="Delete File"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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
                          selectedFilePath={currentPath}
                          onSelectFile={handleSelectFile}
                          onFolderSelect={setSelectedFolderPath}
                          onAttachToPrompt={handleAttachToPrompt}
                          onRenameFile={handleRenameFile}
                          onDeleteFile={handleDeleteFromContext}
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="editor" forceMount className="flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden">
                    {currentFile ? (
                      <CodeEditor
                        ref={editorRef}
                        key={`mobile-${currentFile.path}`}
                        fileId={currentFile.id}
                        filePath={currentFile.path}
                        repoId={defaultRepo?.id || ""}
                        isStaged={currentFile.isStaged}
                        bufferContent={currentFile.content}
                        bufferOriginalContent={currentFile.originalContent}
                        onContentChange={updateContent}
                        showDiff={showDiff}
                        onShowDiffChange={setShowDiff}
                        onClose={handleCloseEditor}
                        onSave={handleEditorSave}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p>Select a file</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="chat" forceMount className="flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden">
                    <UnifiedAgentInterface
                      projectId={projectId}
                      repoId={defaultRepo?.id || null}
                      shareToken={shareToken}
                      attachedFiles={attachedFiles}
                      onRemoveFile={handleRemoveAttachedFile}
                      files={files}
                      autoCommit={autoCommit}
                      onAutoCommitChange={setAutoCommit}
                    />
                  </TabsContent>

                  <TabsContent value="staging" forceMount className="flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden">
                    <StagingPanel
                      projectId={projectId}
                      shareToken={shareToken}
                      onViewDiff={handleViewDiff}
                      autoCommit={autoCommit}
                      onAutoCommitChange={setAutoCommit}
                      refreshTrigger={stagingRefreshTrigger}
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

      <RenameDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        currentName={itemToRename?.path.split('/').pop() || ''}
        type={itemToRename?.type || "file"}
        onConfirm={handleConfirmRename}
      />
    </div>
  );
}
