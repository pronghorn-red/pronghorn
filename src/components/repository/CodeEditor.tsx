import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Editor from "@monaco-editor/react";
import { DiffEditor } from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";
import { Save, X, FileText, ImageIcon, GitCompare, Eye } from "lucide-react";

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif', 'tiff', 'tif'];

function isImageFile(path: string | null): boolean {
  if (!path) return false;
  const ext = path.split('.').pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext || '');
}

function getImageMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    svg: 'image/svg+xml',
  };
  return mimeMap[ext || ''] || 'image/png';
}

interface CodeEditorProps {
  fileId: string | null;
  filePath: string | null;
  repoId: string;
  isStaged?: boolean;
  isBinary?: boolean;
  initialContent?: string;
  showDiff?: boolean;
  diffOldContent?: string;
  onShowDiffChange?: (show: boolean) => void;
  onClose: () => void;
  onSave?: () => void;
  onAutoSync?: () => void;
}

export function CodeEditor({ 
  fileId, 
  filePath, 
  repoId, 
  isStaged,
  isBinary, 
  initialContent, 
  showDiff = false,
  diffOldContent,
  onShowDiffChange,
  onClose, 
  onSave, 
  onAutoSync 
}: CodeEditorProps) {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const showDiffMode = showDiff ?? false;
  const handleShowDiffToggle = (checked: boolean) => {
    onShowDiffChange?.(checked);
  };
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");

  // Ref for debounced blur save timeout
  const blurSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Dirty state tracking
  const isDirty = content !== originalContent;

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (blurSaveTimeoutRef.current) {
        clearTimeout(blurSaveTimeoutRef.current);
      }
    };
  }, []);

  // Auto-save function
  const autoSaveFile = useCallback(async () => {
    if (!filePath || !repoId || isImageFile(filePath)) return;
    if (!isDirty) return;

    console.log("Auto-saving file on blur:", filePath);
    
    try {
      // Check if there's already a staged change for this file
      const { data: staged, error: stagedError } = await supabase.rpc(
        "get_staged_changes_with_token",
        {
          p_repo_id: repoId,
          p_token: shareToken || null,
        },
      );

      if (stagedError) throw stagedError;

      const existing = (staged || []).find(
        (change: any) => change.file_path === filePath,
      );

      let oldContentToUse = originalContent;

      if (existing) {
        if (existing.old_content !== null && existing.old_content !== undefined) {
          oldContentToUse = existing.old_content;
        } else if (existing.operation_type === 'add') {
          oldContentToUse = "";
        }

        await supabase.rpc("unstage_file_with_token", {
          p_repo_id: repoId,
          p_file_path: filePath,
          p_token: shareToken || null,
        });
      }

      const operationType = existing ? existing.operation_type : "edit";

      await supabase.rpc("stage_file_change_with_token", {
        p_repo_id: repoId,
        p_token: shareToken || null,
        p_operation_type: operationType,
        p_file_path: filePath,
        p_old_content: oldContentToUse,
        p_new_content: content,
      });

      toast({
        title: "Auto-saved",
        description: `Changes to ${filePath.split('/').pop()} staged automatically`,
      });
      onAutoSync?.();
    } catch (error) {
      console.error("Error auto-saving file:", error);
    }
  }, [filePath, repoId, shareToken, isDirty, content, originalContent, toast, onAutoSync]);

  // onBlur handler - debounced save when focus leaves the editor area
  // Debounce prevents saves during Monaco's internal focus changes (undo/redo operations)
  const handleEditorBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    // Only save if focus is leaving the editor entirely (not just moving within it)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (isDirty && filePath && !isImageFile(filePath)) {
        // Clear any existing pending save
        if (blurSaveTimeoutRef.current) {
          clearTimeout(blurSaveTimeoutRef.current);
        }
        // Debounce: wait 200ms before saving to allow undo operations to settle
        blurSaveTimeoutRef.current = setTimeout(() => {
          console.log("BLUR - auto-saving after debounce:", filePath);
          autoSaveFile();
          blurSaveTimeoutRef.current = null;
        }, 200);
      }
    }
  }, [isDirty, filePath, autoSaveFile]);

  // onFocus handler - cancels any pending blur save when focus returns
  // This prevents saves from firing during undo/redo operations that temporarily shift focus
  const handleEditorFocus = useCallback(() => {
    if (blurSaveTimeoutRef.current) {
      console.log("Focus returned - canceling pending save");
      clearTimeout(blurSaveTimeoutRef.current);
      blurSaveTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (initialContent !== undefined) {
      // Use provided content directly when passed in (e.g. from StagingPanel)
      setContent(initialContent);
      // Use diffOldContent as the original baseline when provided, otherwise fall back to initialContent
      if (typeof diffOldContent === "string") {
        setOriginalContent(diffOldContent);
      } else {
        setOriginalContent(initialContent);
      }
      setLoading(false);
    } else if (fileId) {
      loadFileContent();
    } else {
      setContent("");
      setOriginalContent("");
    }
  }, [fileId, isStaged, filePath, initialContent, diffOldContent]);

  // Reset markdown preview when file changes
  useEffect(() => {
    setShowMarkdown(false);
  }, [filePath]);

  const loadFileContent = async () => {
    if (!filePath && !fileId) return;

    setLoading(true);
    try {
      // If we have staged content for this file, prefer that
      if (repoId && filePath && isStaged) {
        const { data: staged, error: stagedError } = await supabase.rpc(
          "get_staged_changes_with_token",
          {
            p_repo_id: repoId,
            p_token: shareToken || null,
          },
        );

        if (stagedError) {
          console.error("Error loading staged changes:", stagedError);
          throw stagedError;
        }

        const changesForFile = (staged || []).filter(
          (change: any) => change.file_path === filePath,
        );

        if (changesForFile.length > 0) {
          // Use the most recent staged change
          const latestChange = changesForFile.reduce((latest: any, current: any) =>
            new Date(current.created_at) > new Date(latest.created_at) ? current : latest,
          changesForFile[0]);

          const stagedContent = latestChange.new_content || "";
          const oldContent = latestChange.old_content || "";
          setContent(stagedContent);
          // Preserve the original baseline content for diffs/commits
          // For new files (operation_type='add'), old_content will be null/empty - keep it that way for proper diff
          setOriginalContent(oldContent);
          console.log("Loaded staged content for:", filePath, "operation:", latestChange.operation_type);
          return;
        } else {
          console.log("No staged changes found for:", filePath);
        }
      }

      if (fileId) {
        // Load from repo_files for committed files
        const { data, error } = await supabase.rpc("get_file_content_with_token", {
          p_file_id: fileId,
          p_token: shareToken || null,
        });

        if (error) {
          console.error("Error loading file content:", error);
          throw error;
        }
        if (data && data.length > 0) {
          setContent(data[0].content);
          setOriginalContent(data[0].content);
        }
      }
    } catch (error) {
      console.error("Error loading file:", error);
      toast({
        title: "Error",
        description: "Failed to load file content",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!filePath || !repoId) return;

    setSaving(true);
    try {
      // Check if there's already a staged change for this file via RPC
      const { data: staged, error: stagedError } = await supabase.rpc(
        "get_staged_changes_with_token",
        {
          p_repo_id: repoId,
          p_token: shareToken || null,
        },
      );

      if (stagedError) throw stagedError;

      const existing = (staged || []).find(
        (change: any) => change.file_path === filePath,
      );

      // Preserve the original baseline content for this file
      let oldContentToUse = originalContent;

      if (existing) {
        // CRITICAL: Always preserve the original baseline from the first staged change
        // For AI-created files, old_content might be NULL or empty string - use that
        // For subsequent user edits, use the existing old_content to maintain diff baseline
        if (existing.old_content !== null && existing.old_content !== undefined) {
          oldContentToUse = existing.old_content;
        } else if (existing.operation_type === 'add') {
          // For new files created by AI, old_content should be empty string
          oldContentToUse = "";
        }

        // Remove existing staged row so we maintain a single staged entry per file
        const { error: unstageError } = await supabase.rpc("unstage_file_with_token", {
          p_repo_id: repoId,
          p_file_path: filePath,
          p_token: shareToken || null,
        });

        if (unstageError) throw unstageError;
      }

      const operationType = existing
        ? existing.operation_type
        : fileId
          ? "edit"
          : "add";

      const { error } = await supabase.rpc("stage_file_change_with_token", {
        p_repo_id: repoId,
        p_token: shareToken || null,
        p_operation_type: operationType,
        p_file_path: filePath,
        p_old_content: oldContentToUse,
        p_new_content: content,
      });

      if (error) throw error;

      toast({
        title: "Staged",
        description:
          "File changes staged successfully. Commit from Build page to persist.",
      });
      onSave?.();
      onAutoSync?.();  // Trigger sync to update other views
    } catch (error) {
      console.error("Error staging file:", error);
      toast({
        title: "Error",
        description: "Failed to stage file changes",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getLanguage = (path: string | null) => {
    if (!path) return "plaintext";
    const ext = path.split(".").pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      js: "javascript",
      jsx: "javascript",
      mjs: "javascript",
      cjs: "javascript",
      ts: "typescript",
      tsx: "typescript",
      vue: "html",
      py: "python",
      java: "java",
      kt: "kotlin",
      cpp: "cpp",
      c: "c",
      h: "cpp",
      cs: "csharp",
      go: "go",
      rs: "rust",
      rb: "ruby",
      php: "php",
      html: "html",
      htm: "html",
      css: "css",
      scss: "scss",
      sass: "scss",
      less: "less",
      json: "json",
      jsonc: "json",
      xml: "xml",
      svg: "xml",
      yaml: "yaml",
      yml: "yaml",
      md: "markdown",
      markdown: "markdown",
      sql: "sql",
      sh: "shell",
      bash: "shell",
      zsh: "shell",
      dockerfile: "dockerfile",
      toml: "ini",
      ini: "ini",
      conf: "ini",
      properties: "ini",
    };
    return langMap[ext || ""] || "plaintext";
  };

  // Check if this is an image file that should be displayed as an image
  const isImage = isImageFile(filePath);
  const imageDataUrl = useMemo(() => {
    if (!isImage || !content) return null;
    const mimeType = getImageMimeType(filePath || '');
    // Content is already base64 encoded for binary files
    return `data:${mimeType};base64,${content}`;
  }, [isImage, content, filePath]);

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full bg-[#1e1e1e] text-[#cccccc]">
        Select a file to edit
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#3e3e42] bg-[#252526]">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isImage ? (
            <ImageIcon className="h-4 w-4 text-[#cccccc] shrink-0" />
          ) : (
            <FileText className="h-4 w-4 text-[#cccccc] shrink-0" />
          )}
          <h3 className="text-sm font-normal truncate text-[#cccccc]">{filePath}</h3>
          {/* Dirty indicator - yellow dot when file has unsaved changes */}
          {isDirty && !isImage && (
            <span className="h-2 w-2 rounded-full bg-yellow-500 shrink-0" title="Unsaved changes" />
          )}
        </div>
        <div className="flex items-center gap-3">
          {!isImage && (
            <TooltipProvider>
              <div className="flex items-center gap-1">
                {/* Show Diff Toggle - only for staged files */}
                {isStaged && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Toggle
                        size="sm"
                        pressed={showDiffMode}
                        onPressedChange={(pressed) => {
                          handleShowDiffToggle(pressed);
                          if (pressed) setShowMarkdown(false);
                        }}
                        className="h-8 px-2 border border-[#3e3e42] text-[#cccccc] hover:bg-[#3e3e42] hover:text-white data-[state=on]:bg-blue-600 data-[state=on]:text-white data-[state=on]:border-blue-600"
                      >
                        <GitCompare className="h-4 w-4" />
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Show diff view</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                
                {/* Show Markdown Toggle - for all text files */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Toggle
                      size="sm"
                      pressed={showMarkdown}
                      onPressedChange={(pressed) => {
                        setShowMarkdown(pressed);
                        if (pressed && showDiffMode) handleShowDiffToggle(false);
                      }}
                      className="h-8 px-2 border border-[#3e3e42] text-[#cccccc] hover:bg-[#3e3e42] hover:text-white data-[state=on]:bg-green-600 data-[state=on]:text-white data-[state=on]:border-green-600"
                    >
                      <Eye className="h-4 w-4" />
                    </Toggle>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Preview as Markdown</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          )}
          <div className="flex gap-1">
            {!isImage && (
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || loading}
                variant={isDirty ? "default" : "secondary"}
                className={`h-8 gap-2 ${isDirty ? "bg-yellow-600 hover:bg-yellow-700 text-white" : ""}`}
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : isDirty ? "Save*" : "Save"}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="h-8 hover:bg-[#2a2d2e] text-[#cccccc]"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div 
        tabIndex={-1} 
        onBlur={handleEditorBlur}
        onFocus={handleEditorFocus}
        className="flex-1 overflow-hidden focus:outline-none"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-[#cccccc]">
            Loading...
          </div>
        ) : isImage && imageDataUrl ? (
          <div className="flex items-center justify-center h-full p-4 bg-[#1e1e1e]">
            <img 
              src={imageDataUrl} 
              alt={filePath}
              className="max-w-full max-h-full object-contain"
              onError={() => {
                toast({
                  title: "Image Error",
                  description: "Failed to load image preview",
                  variant: "destructive",
                });
              }}
            />
          </div>
        ) : showMarkdown ? (
          <div className="h-full overflow-auto p-6 bg-[#1e1e1e] text-[#cccccc]">
            <div className="prose prose-invert prose-sm max-w-none 
              prose-headings:text-[#e6e6e6] prose-headings:font-semibold
              prose-headings:mt-6 prose-headings:mb-4
              prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
              prose-p:text-[#cccccc] prose-p:leading-relaxed prose-p:mb-4
              prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
              prose-strong:text-[#e6e6e6] prose-strong:font-semibold
              prose-code:text-[#ce9178] prose-code:bg-[#2d2d2d] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
              prose-pre:bg-[#2d2d2d] prose-pre:border prose-pre:border-[#3e3e42] prose-pre:my-4
              prose-blockquote:border-l-[#4ec9b0] prose-blockquote:text-[#9cdcfe] prose-blockquote:my-4
              prose-ul:text-[#cccccc] prose-ul:my-4 prose-ol:text-[#cccccc] prose-ol:my-4
              prose-li:marker:text-[#808080] prose-li:mb-2
              prose-hr:border-[#3e3e42] prose-hr:my-6
              prose-table:text-[#cccccc]
              prose-th:bg-[#2d2d2d] prose-th:border prose-th:border-[#3e3e42] prose-th:px-3 prose-th:py-2
              prose-td:border prose-td:border-[#3e3e42] prose-td:px-3 prose-td:py-2
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          </div>
        ) : showDiffMode ? (
          <DiffEditor
            original={originalContent}
            modified={content}
            language={getLanguage(filePath)}
            theme="vs-dark"
            onMount={(editor) => {
              const modifiedEditor = editor.getModifiedEditor();
              modifiedEditor.onDidChangeModelContent(() => {
                const value = modifiedEditor.getValue();
                setContent(value);
              });
            }}
            options={{
              readOnly: false,
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: "on",
              renderSideBySide: false, // Inline diff mode with green/red overlays
              renderOverviewRuler: false,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: "on",
              diffWordWrap: "on",
              enableSplitViewResizing: false,
              renderIndicators: true,
              ignoreTrimWhitespace: false,
              fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', 'Monaco', monospace",
              fontLigatures: true,
              cursorBlinking: "smooth",
              smoothScrolling: true,
              renderLineHighlight: "all",
            }}
          />
        ) : (
          <Editor
            height="100%"
            language={getLanguage(filePath)}
            value={content}
            onChange={(value) => setContent(value || "")}
            theme="vs-dark"
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', 'Monaco', monospace",
              fontLigatures: true,
              cursorBlinking: "smooth",
              smoothScrolling: true,
              renderLineHighlight: "all",
              bracketPairColorization: { enabled: true },
              wordWrap: "on",
              tabSize: 2,
              insertSpaces: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
