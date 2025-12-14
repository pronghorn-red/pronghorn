import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BufferedFile {
  id: string;
  path: string;
  isStaged?: boolean;
  content: string;
  originalContent: string;    // Baseline from DB - NEVER changes after load (for diffs)
  lastSavedContent: string;   // What was last saved to staging (for dirty detection)
  isDirty: boolean;
  isSaving: boolean;
}

interface UseFileBufferOptions {
  repoId: string | undefined;
  shareToken: string | null;
  onFileSaved?: () => void;
}

export function useFileBuffer({ repoId, shareToken, onFileSaved }: UseFileBufferOptions) {
  const [buffer, setBuffer] = useState<Map<string, BufferedFile>>(new Map());
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const savePromisesRef = useRef<Map<string, Promise<void>>>(new Map());

  // Get current file from buffer
  const currentFile = currentPath ? buffer.get(currentPath) || null : null;

  // Check if any files are dirty
  const hasDirtyFiles = Array.from(buffer.values()).some(f => f.isDirty);

  // Check if any files are currently saving
  const isSaving = Array.from(buffer.values()).some(f => f.isSaving);

  // Load file content from database
  const loadFileContent = useCallback(async (
    fileId: string,
    filePath: string,
    isStaged?: boolean
  ): Promise<{ content: string; originalContent: string } | null> => {
    if (!repoId) return null;

    try {
      // First check for staged content
      if (isStaged) {
        const { data: staged, error: stagedError } = await supabase.rpc(
          "get_staged_changes_with_token",
          {
            p_repo_id: repoId,
            p_token: shareToken || null,
          }
        );

        if (stagedError) throw stagedError;

        const changesForFile = (staged || []).filter(
          (change: any) => change.file_path === filePath
        );

        if (changesForFile.length > 0) {
          const latestChange = changesForFile.reduce(
            (latest: any, current: any) =>
              new Date(current.created_at) > new Date(latest.created_at)
                ? current
                : latest,
            changesForFile[0]
          );

          return {
            content: latestChange.new_content || "",
            originalContent: latestChange.old_content || "",
          };
        }
      }

      // Load from committed files
      const { data, error } = await supabase.rpc("get_file_content_with_token", {
        p_file_id: fileId,
        p_token: shareToken || null,
      });

      if (error) throw error;

      if (data && data.length > 0) {
        return {
          content: data[0].content,
          originalContent: data[0].content,
        };
      }

      return { content: "", originalContent: "" };
    } catch (error) {
      console.error("Error loading file content:", error);
      return null;
    }
  }, [repoId, shareToken]);

  // Save a single file (async, returns promise)
  const saveFileAsync = useCallback(async (filePath: string): Promise<void> => {
    const file = buffer.get(filePath);
    if (!file || !file.isDirty || file.isSaving || !repoId) return;

    // Mark as saving
    setBuffer(prev => {
      const newMap = new Map(prev);
      const f = newMap.get(filePath);
      if (f) {
        newMap.set(filePath, { ...f, isSaving: true });
      }
      return newMap;
    });

    try {
      // SMART UNSTAGE: If content matches original BASELINE, unstage instead of staging
      if (file.content === file.originalContent) {
        console.log("Content reverted to baseline, unstaging file:", filePath);
        const { error } = await supabase.rpc("unstage_file_with_token", {
          p_repo_id: repoId,
          p_file_path: filePath,
          p_token: shareToken || null,
        });

        if (error) throw error;

        // Mark as clean and update lastSavedContent
        setBuffer(prev => {
          const newMap = new Map(prev);
          const f = newMap.get(filePath);
          if (f) {
            if (filePath === currentPath) {
              newMap.set(filePath, {
                ...f,
                isDirty: false,
                isSaving: false,
                isStaged: false,
                lastSavedContent: f.content,
              });
            } else {
              newMap.delete(filePath);
            }
          }
          return newMap;
        });

        onFileSaved?.();
        return;
      }

      // Check for existing staged change
      const { data: staged, error: stagedError } = await supabase.rpc(
        "get_staged_changes_with_token",
        {
          p_repo_id: repoId,
          p_token: shareToken || null,
        }
      );

      if (stagedError) throw stagedError;

      const existing = (staged || []).find(
        (change: any) => change.file_path === filePath
      );

      // Use locally tracked originalContent - staging no longer returns content for token optimization
      let oldContentToUse = file.originalContent;

      if (existing) {
        // For new files (add operation), old_content should be empty string
        if (existing.operation_type === "add") {
          oldContentToUse = "";
        }
        // Otherwise use the locally tracked originalContent
        // Remove existing staged row
        await supabase.rpc("unstage_file_with_token", {
          p_repo_id: repoId,
          p_file_path: filePath,
          p_token: shareToken || null,
        });
      }

      const operationType = existing
        ? existing.operation_type
        : file.id && !file.isStaged
          ? "edit"
          : "add";

      const { error } = await supabase.rpc("stage_file_change_with_token", {
        p_repo_id: repoId,
        p_token: shareToken || null,
        p_operation_type: operationType,
        p_file_path: filePath,
        p_old_content: oldContentToUse,
        p_new_content: file.content,
      });

      if (error) throw error;

      // Update buffer: mark as clean, update lastSavedContent but PRESERVE originalContent
      setBuffer(prev => {
        const newMap = new Map(prev);
        const f = newMap.get(filePath);
        if (f) {
          if (filePath === currentPath) {
            newMap.set(filePath, {
              ...f,
              isDirty: false,
              isSaving: false,
              lastSavedContent: f.content,  // Update last saved
              // originalContent stays unchanged - it's the baseline for diffs!
              isStaged: true,
            });
          } else {
            newMap.delete(filePath);
          }
        }
        return newMap;
      });

      onFileSaved?.();
    } catch (error) {
      console.error("Error saving file:", filePath, error);
      toast.error(`Failed to save ${filePath}`);

      // Reset saving state
      setBuffer(prev => {
        const newMap = new Map(prev);
        const f = newMap.get(filePath);
        if (f) {
          newMap.set(filePath, { ...f, isSaving: false });
        }
        return newMap;
      });
    }
  }, [buffer, repoId, shareToken, currentPath, onFileSaved]);

  // Switch to a new file - triggers async save for dirty current file
  const switchFile = useCallback(async (
    fileId: string,
    filePath: string,
    isStaged?: boolean,
    forceReload?: boolean
  ): Promise<void> => {
    if (!repoId) return;

    // If current file is dirty, trigger async save (fire-and-forget)
    if (currentPath && buffer.get(currentPath)?.isDirty) {
      const pathToSave = currentPath;
      const savePromise = saveFileAsync(pathToSave);
      savePromisesRef.current.set(pathToSave, savePromise);
      savePromise.finally(() => {
        savePromisesRef.current.delete(pathToSave);
      });
    }

    // Check if file is already in buffer - skip cache if forceReload
    if (!forceReload) {
      const existingFile = buffer.get(filePath);
      if (existingFile) {
        setCurrentPath(filePath);
        return;
      }
    }

    // Load file content
    const loadedContent = await loadFileContent(fileId, filePath, isStaged);
    
    if (loadedContent) {
      setBuffer(prev => {
        const newMap = new Map(prev);
        newMap.set(filePath, {
          id: fileId,
          path: filePath,
          isStaged,
          content: loadedContent.content,
          originalContent: loadedContent.originalContent,  // Baseline for diffs
          lastSavedContent: loadedContent.content,         // Initial = content
          isDirty: false,
          isSaving: false,
        });
        return newMap;
      });
    }

    setCurrentPath(filePath);
  }, [repoId, buffer, currentPath, saveFileAsync, loadFileContent]);

  // Update content for current file
  const updateContent = useCallback((newContent: string) => {
    if (!currentPath) return;

    setBuffer(prev => {
      const newMap = new Map(prev);
      const file = newMap.get(currentPath);
      if (file) {
        // Dirty = content differs from last saved content (not original baseline)
        const isDirty = newContent !== file.lastSavedContent;
        newMap.set(currentPath, { ...file, content: newContent, isDirty });
      }
      return newMap;
    });
  }, [currentPath]);

  // Manual save for current file (returns promise for Save button)
  const saveCurrentFile = useCallback(async (): Promise<boolean> => {
    if (!currentPath) return false;

    const file = buffer.get(currentPath);
    if (!file?.isDirty) return true;

    try {
      await saveFileAsync(currentPath);
      return true;
    } catch {
      return false;
    }
  }, [currentPath, buffer, saveFileAsync]);

  // Save all dirty files (for navigation away)
  const saveAllDirty = useCallback(() => {
    const dirtyFiles = Array.from(buffer.entries())
      .filter(([_, file]) => file.isDirty && !file.isSaving);

    dirtyFiles.forEach(([path]) => {
      const savePromise = saveFileAsync(path);
      savePromisesRef.current.set(path, savePromise);
      savePromise.finally(() => {
        savePromisesRef.current.delete(path);
      });
    });
  }, [buffer, saveFileAsync]);

  // Close current file
  const closeFile = useCallback(async () => {
    if (!currentPath) return;

    const file = buffer.get(currentPath);
    if (file?.isDirty) {
      await saveFileAsync(currentPath);
    }

    setBuffer(prev => {
      const newMap = new Map(prev);
      newMap.delete(currentPath);
      return newMap;
    });
    setCurrentPath(null);
  }, [currentPath, buffer, saveFileAsync]);

  // Clear the buffer for a specific file
  const clearFile = useCallback((filePath: string) => {
    setBuffer(prev => {
      const newMap = new Map(prev);
      newMap.delete(filePath);
      return newMap;
    });
    if (currentPath === filePath) {
      setCurrentPath(null);
    }
  }, [currentPath]);

  // Reload current file from database (discard local changes)
  const reloadCurrentFile = useCallback(async () => {
    if (!currentPath || !repoId) return;

    const file = buffer.get(currentPath);
    if (!file) return;

    const loadedContent = await loadFileContent(file.id, file.path, file.isStaged);
    
    if (loadedContent) {
      setBuffer(prev => {
        const newMap = new Map(prev);
        newMap.set(currentPath, {
          ...file,
          content: loadedContent.content,
          originalContent: loadedContent.originalContent,
          lastSavedContent: loadedContent.content,
          isDirty: false,
          isSaving: false,
        });
        return newMap;
      });
    }
  }, [currentPath, buffer, repoId, loadFileContent]);

  return {
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
  };
}
