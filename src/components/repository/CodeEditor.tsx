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
  onSave: () => void;
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
    if (!fileId) return;
    
    setLoading(true);
    try {
      if (isStaged) {
        // Load from repo_staging for staged files
        const { data, error } = await supabase
          .from("repo_staging")
          .select("*")
          .eq("id", fileId)
          .single();

        if (error) throw error;
        if (data) {
          const content = data.new_content || "";
          setContent(content);
          setOriginalContent(content);
        }
      } else {
        // Load from repo_files for committed files
        const { data, error } = await supabase.rpc("get_file_content_with_token", {
          p_file_id: fileId,
          p_token: shareToken || null,
        });

        if (error) throw error;
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
    if (!filePath) return;
    
    setSaving(true);
    try {
      // Stage the file change instead of directly saving to repo_files
      const { error } = await supabase.rpc("stage_file_change_with_token", {
        p_repo_id: repoId,
        p_token: shareToken || null,
        p_operation_type: fileId ? "edit" : "add",
        p_file_path: filePath,
        p_old_content: originalContent,
        p_new_content: content,
      });

      if (error) throw error;

      toast({
        title: "Staged",
        description: "File changes staged successfully. Commit from Build page to persist.",
      });
      onSave();
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
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[#cccccc]">
            Loading...
          </div>
        ) : showDiff ? (
          <DiffEditor
            original={diffOldContent}
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
