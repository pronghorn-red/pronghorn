import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Eye, Code, Save, Loader2, GitCompare } from 'lucide-react';
import Editor, { DiffEditor, Monaco } from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CollaborationEditorProps {
  content: string;
  previousContent?: string | null;
  isMarkdown: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  readOnly?: boolean;
  currentVersion: number;
}

export function CollaborationEditor({
  content,
  previousContent,
  isMarkdown,
  onChange,
  onSave,
  isSaving,
  hasUnsavedChanges,
  readOnly = false,
  currentVersion,
}: CollaborationEditorProps) {
  const [viewMode, setViewMode] = useState<'rendered' | 'source' | 'diff'>(isMarkdown ? 'rendered' : 'source');
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-save on blur or after idle period
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  const handleContentChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      onChange(value);
    }
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (hasUnsavedChanges) {
        onSave();
      }
    }
  }, [onSave, hasUnsavedChanges]);

  // Check if we have diff content - enable if we have a previous version to compare against
  const hasDiffContent = previousContent !== null && previousContent !== undefined;

  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'rendered' | 'source' | 'diff')}>
            <TabsList className="h-8">
              <TabsTrigger value="rendered" className="text-xs h-6 px-2">
                <Eye className="h-3 w-3 mr-1" />
                Preview
              </TabsTrigger>
              <TabsTrigger value="source" className="text-xs h-6 px-2">
                <Code className="h-3 w-3 mr-1" />
                Source
              </TabsTrigger>
              <TabsTrigger 
                value="diff" 
                className="text-xs h-6 px-2"
                disabled={!hasDiffContent}
              >
                <GitCompare className="h-3 w-3 mr-1" />
                Diff
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {currentVersion > 0 && (
            <Badge variant="outline" className="text-xs">
              v{currentVersion}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <Badge variant="secondary" className="text-xs">
              Unsaved
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={isSaving || !hasUnsavedChanges}
            className="h-7"
          >
            {isSaving ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Save className="h-3 w-3 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === 'rendered' ? (
          <ScrollArea className="h-full max-h-full">
            <div 
              className="p-4 prose prose-sm dark:prose-invert max-w-none cursor-pointer
                         [&_p]:mb-4 [&_p]:whitespace-pre-wrap
                         [&_br]:block [&_br]:content-[''] [&_br]:mt-2"
              onClick={() => !readOnly && setViewMode('source')}
            >
              {content ? (
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Preserve line breaks within paragraphs
                    p: ({ children }) => <p className="mb-4 whitespace-pre-wrap">{children}</p>,
                  }}
                >
                  {content}
                </ReactMarkdown>
              ) : (
                <p className="text-muted-foreground italic">
                  {readOnly ? 'No content' : 'Click to edit...'}
                </p>
              )}
            </div>
          </ScrollArea>
        ) : viewMode === 'diff' && hasDiffContent ? (
          <DiffEditor
            height="100%"
            language={isMarkdown ? 'markdown' : 'plaintext'}
            original={previousContent || ''}
            modified={content}
            options={{
              minimap: { enabled: false },
              wordWrap: 'on',
              fontSize: 13,
              scrollBeyondLastLine: false,
              readOnly: true,
              renderSideBySide: true,
              padding: { top: 12 },
              automaticLayout: true,
              originalEditable: false,
            }}
            theme="vs-dark"
          />
        ) : (
          <Editor
            height="100%"
            defaultLanguage={isMarkdown ? 'markdown' : 'plaintext'}
            value={content}
            onChange={handleContentChange}
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: false },
              wordWrap: 'on',
              lineNumbers: 'on',
              fontSize: 13,
              scrollBeyondLastLine: false,
              readOnly,
              padding: { top: 12 },
              automaticLayout: true,
            }}
            theme="vs-dark"
          />
        )}
      </div>
    </div>
  );
}