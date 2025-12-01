import { DiffEditor } from "@monaco-editor/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MonacoDiffEditorProps {
  oldContent: string;
  newContent: string;
  filePath: string;
  onContentChange?: (content: string) => void;
}

export function MonacoDiffEditor({
  oldContent,
  newContent,
  filePath,
  onContentChange,
}: MonacoDiffEditorProps) {
  const getLanguage = (path: string): string => {
    const ext = path.split(".").pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      js: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      json: "json",
      html: "html",
      css: "css",
      scss: "scss",
      py: "python",
      md: "markdown",
      yml: "yaml",
      yaml: "yaml",
      xml: "xml",
      sql: "sql",
      sh: "shell",
    };
    return languageMap[ext || ""] || "plaintext";
  };

  const handleEditorDidMount = (editor: any) => {
    if (onContentChange) {
      const modifiedEditor = editor.getModifiedEditor();
      modifiedEditor.onDidChangeModelContent(() => {
        const value = modifiedEditor.getValue();
        onContentChange(value);
      });
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="shrink-0">
        <CardTitle className="text-sm font-mono">{filePath}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
        <DiffEditor
          original={oldContent}
          modified={newContent}
          language={getLanguage(filePath)}
          theme="vs-dark"
          onMount={handleEditorDidMount}
          options={{
            readOnly: false,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            renderSideBySide: false, // Inline diff mode with color overlays
            renderOverviewRuler: false,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: "on",
            diffWordWrap: "on",
            enableSplitViewResizing: false,
            renderIndicators: true,
            ignoreTrimWhitespace: false,
          }}
        />
      </CardContent>
    </Card>
  );
}
