import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Play, Trash2, History, Loader2, AlignLeft, AlertTriangle, ShieldAlert, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface SqlQueryEditorProps {
  query: string;
  onQueryChange: (sql: string) => void;
  onExecute: (sql: string) => Promise<void>;
  isExecuting?: boolean;
  onSaveQuery?: (sql: string) => void;
}

const MAX_HISTORY = 20;

// Patterns for query type detection
const DESTRUCTIVE_PATTERNS = [
  /^\s*DROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|FUNCTION|TRIGGER|SEQUENCE)/i,
  /^\s*TRUNCATE\s+/i,
  /^\s*DELETE\s+FROM\s+/i,
  /^\s*ALTER\s+TABLE\s+.*\s+DROP\s+/i,
];

const WRITE_PATTERNS = [
  /^\s*INSERT\s+/i,
  /^\s*UPDATE\s+/i,
  /^\s*CREATE\s+/i,
  /^\s*ALTER\s+/i,
];

export function SqlQueryEditor({ query, onQueryChange, onExecute, isExecuting, onSaveQuery }: SqlQueryEditorProps) {
  // Internal query state is the source of truth; parent can seed/replace via query prop
  const [internalQuery, setInternalQuery] = useState<string>(query ?? "SELECT 1;");
  const lastExternalQuery = useRef<string | null>(query ?? "SELECT 1;");
  const editorValue = internalQuery;

  const [queryHistory, setQueryHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("db-query-history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const editorRef = useRef<any>(null);

  // Sync internal state when parent intentionally changes query (e.g. schema tree, saved queries)
  useEffect(() => {
    if (query !== lastExternalQuery.current) {
      const next = query ?? "SELECT 1;";
      setInternalQuery(next);
      lastExternalQuery.current = next;
    }
  }, [query]);

  // Detect query type for visual indicator
  const queryType = useMemo(() => {
    if (DESTRUCTIVE_PATTERNS.some((p) => p.test(editorValue))) return "destructive";
    if (WRITE_PATTERNS.some((p) => p.test(editorValue))) return "write";
    return "read";
  }, [editorValue]);

  // Use ref to always have access to latest execute logic
  const executeRef = useRef<() => Promise<void>>();
  
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Add Ctrl+Enter keyboard shortcut - use ref to avoid stale closure
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      executeRef.current?.();
    });

    // Add Ctrl+S keyboard shortcut for save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const currentValue = editor.getValue();
      if (onSaveQuery && currentValue.trim()) {
        onSaveQuery(currentValue);
      }
    });
  };

  const handleEditorChange = (value: string | undefined) => {
    setInternalQuery(value ?? "");
  };

  const handleExecute = useCallback(async () => {
    const sql = internalQuery.trim();
    if (!sql || isExecuting) return;

    // Add to history
    const newHistory = [sql, ...queryHistory.filter((q) => q !== sql)].slice(0, MAX_HISTORY);
    setQueryHistory(newHistory);
    localStorage.setItem("db-query-history", JSON.stringify(newHistory));

    lastExternalQuery.current = internalQuery;
    onQueryChange?.(internalQuery);

    await onExecute(internalQuery);
  }, [internalQuery, queryHistory, onExecute, isExecuting, onQueryChange]);

  // Keep executeRef updated so keyboard shortcut always uses latest
  useEffect(() => {
    executeRef.current = handleExecute;
  }, [handleExecute]);

  const handleClear = () => {
    const next = "";
    setInternalQuery(next);
    lastExternalQuery.current = next;
    onQueryChange?.(next);
    editorRef.current?.focus();
  };

  const handleSelectHistory = (historyQuery: string) => {
    const next = historyQuery;
    setInternalQuery(next);
    lastExternalQuery.current = next;
    onQueryChange?.(next);
  };

  const handleFormat = () => {
    // Basic SQL formatting - in production you'd use a proper SQL formatter library
    const formatted = editorValue
      .replace(/\s+/g, " ")
      .replace(/\s*,\s*/g, ",\n  ")
      .replace(/\bSELECT\b/gi, "SELECT\n  ")
      .replace(/\bFROM\b/gi, "\nFROM")
      .replace(/\bWHERE\b/gi, "\nWHERE")
      .replace(/\bAND\b/gi, "\n  AND")
      .replace(/\bOR\b/gi, "\n  OR")
      .replace(/\bORDER BY\b/gi, "\nORDER BY")
      .replace(/\bGROUP BY\b/gi, "\nGROUP BY")
      .replace(/\bHAVING\b/gi, "\nHAVING")
      .replace(/\bJOIN\b/gi, "\nJOIN")
      .replace(/\bLEFT JOIN\b/gi, "\nLEFT JOIN")
      .replace(/\bRIGHT JOIN\b/gi, "\nRIGHT JOIN")
      .replace(/\bINNER JOIN\b/gi, "\nINNER JOIN")
      .replace(/\bON\b/gi, "\n  ON")
      .replace(/\bLIMIT\b/gi, "\nLIMIT")
      .replace(/\bOFFSET\b/gi, "\nOFFSET")
      .trim();
    const next = formatted;
    setInternalQuery(next);
    lastExternalQuery.current = next;
    onQueryChange?.(next);
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#3e3e42] bg-[#252526]">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleExecute}
            disabled={isExecuting || !editorValue.trim()}
            className="h-7 gap-1.5"
          >
            {isExecuting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Run
          </Button>
          <span className="text-xs text-muted-foreground">Ctrl+Enter</span>
          
          {/* Query type indicator */}
          {queryType === 'destructive' && (
            <Badge variant="destructive" className="gap-1 h-5 text-[10px]">
              <ShieldAlert className="h-3 w-3" />
              Destructive
            </Badge>
          )}
          {queryType === 'write' && (
            <Badge variant="secondary" className="gap-1 h-5 text-[10px] bg-amber-500/20 text-amber-600 border-amber-500/30">
              <AlertTriangle className="h-3 w-3" />
              Write
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
            {onSaveQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSaveQuery(editorValue)}
              disabled={!editorValue.trim()}
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
              title="Save Query (Ctrl+S)"
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFormat}
            className="h-7 px-2 text-muted-foreground hover:text-foreground"
            title="Format SQL"
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground hover:text-foreground"
                disabled={queryHistory.length === 0}
              >
                <History className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-[400px] max-h-[300px] overflow-auto">
              {queryHistory.map((historyQuery, index) => (
                <DropdownMenuItem
                  key={index}
                  onClick={() => handleSelectHistory(historyQuery)}
                  className="font-mono text-xs truncate"
                >
                  {historyQuery.slice(0, 60)}{historyQuery.length > 60 ? "..." : ""}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-7 px-2 text-muted-foreground hover:text-foreground"
            title="Clear"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="sql"
          theme="vs-dark"
          value={editorValue}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: "on",
            padding: { top: 8, bottom: 8 },
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
          }}
        />
      </div>
    </div>
  );
}
