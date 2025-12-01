import { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { DiffEditor } from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";
import { Save, X, FileText } from "lucide-react";

interface CodeEditorProps {
  fileId: string | null;
  filePath: string | null;
  repoId: string;
  isStaged?: boolean;
  initialContent?: string;
  showDiff?: boolean;
  diffOldContent?: string;
  onClose: () => void;
  onSave?: () => void;
  onAutoSync?: () => void;
}

export function CodeEditor({ 
  fileId, 
  filePath, 
  repoId, 
  isStaged, 
  initialContent, 
  showDiff = false,
  diffOldContent = "",
  onClose, 
  onSave, 
  onAutoSync 
}: CodeEditorProps) {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDiffMode, setShowDiffMode] = useState(false);
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("token");

  useEffect(() => {
    if (initialContent !== undefined) {
      // Use provided content directly
      setContent(initialContent);
      setOriginalContent(initialContent);
      setLoading(false);
    } else if (fileId) {
      loadFileContent();
    } else {
      setContent("");
      setOriginalContent("");
    }
  }, [fileId, isStaged, filePath, initialContent]);

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
          setContent(stagedContent);
          // Preserve the original baseline content for diffs/commits
          setOriginalContent(latestChange.old_content || stagedContent);
          console.log("Loaded staged content for:", filePath);
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
          <FileText className="h-4 w-4 text-[#cccccc] shrink-0" />
          <h3 className="text-sm font-normal truncate text-[#cccccc]">{filePath}</h3>
        </div>
        <div className="flex items-center gap-3">
          {isStaged && originalContent !== content && (
            <label className="flex items-center gap-2 text-xs text-[#cccccc] cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={showDiffMode}
                onChange={(e) => setShowDiffMode(e.target.checked)}
                className="w-4 h-4"
              />
              Show diff
            </label>
          )}
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || loading}
              variant="secondary"
              className="h-8 gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </Button>
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
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[#cccccc]">
            Loading...
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
