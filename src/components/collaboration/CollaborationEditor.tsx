import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Eye, Code, Save, Loader2, GitCompare, AlertTriangle, Globe, Maximize2, X } from 'lucide-react';
import Editor, { DiffEditor, Monaco } from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { HtmlPreview } from '@/components/chat/HtmlPreview';

interface CollaborationEditorProps {
  content: string;
  previousContent?: string | null;
  isMarkdown: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  hasConflict?: boolean;
  readOnly?: boolean;
  currentVersion: number;
  onAskAI?: (message: string) => void;
}

export function CollaborationEditor({
  content,
  previousContent,
  isMarkdown,
  onChange,
  onSave,
  isSaving,
  hasUnsavedChanges,
  hasConflict = false,
  readOnly = false,
  currentVersion,
  onAskAI,
}: CollaborationEditorProps) {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'rendered' | 'source' | 'diff' | 'html'>(isMarkdown ? 'rendered' : 'source');
  const [isHtmlFullscreen, setIsHtmlFullscreen] = useState(false);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Detect if content looks like HTML
  const isHtmlContent = useMemo(() => {
    const trimmed = content.trim().toLowerCase();
    return (
      trimmed.startsWith('<!doctype html') ||
      trimmed.startsWith('<html') ||
      trimmed.startsWith('<head') ||
      trimmed.startsWith('<body') ||
      (trimmed.includes('<script') && trimmed.includes('</script>')) ||
      (trimmed.includes('<style') && trimmed.includes('</style>')) ||
      (trimmed.includes('<div') && trimmed.includes('</div>'))
    );
  }, [content]);

  // Auto-switch to HTML tab when HTML content is detected
  useEffect(() => {
    if (isHtmlContent && viewMode === 'rendered') {
      setViewMode('html');
    }
  }, [isHtmlContent, viewMode]);

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
    <TooltipProvider>
    <div className="flex flex-col flex-1 min-h-0" onKeyDown={handleKeyDown}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'rendered' | 'source' | 'diff' | 'html')}>
            <TabsList className="h-8">
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="rendered" className="text-xs h-6 px-2">
                    <Eye className="h-3 w-3" />
                    {!isMobile && <span className="ml-1">Preview</span>}
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Preview</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="source" className="text-xs h-6 px-2">
                    <Code className="h-3 w-3" />
                    {!isMobile && <span className="ml-1">Source</span>}
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Source</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger 
                    value="diff" 
                    className="text-xs h-6 px-2"
                    disabled={!hasDiffContent}
                  >
                    <GitCompare className="h-3 w-3" />
                    {!isMobile && <span className="ml-1">Diff</span>}
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Diff</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="html" className="text-xs h-6 px-2">
                    <Globe className="h-3 w-3" />
                    {!isMobile && <span className="ml-1">HTML</span>}
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">HTML</TooltipContent>
              </Tooltip>
            </TabsList>
          </Tabs>
          {currentVersion > 0 && (
            <Badge variant="outline" className="text-xs hidden sm:flex">
              v{currentVersion}
            </Badge>
          )}
          {viewMode === 'html' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsHtmlFullscreen(true)}
                  className="h-7 px-2"
                >
                  <Maximize2 className="h-3 w-3" />
                  {!isMobile && <span className="ml-1">Fullscreen</span>}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Fullscreen</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasConflict && (
            <Badge variant="destructive" className="text-xs flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Conflict
            </Badge>
          )}
          {hasUnsavedChanges && !hasConflict && (
            <Badge variant="secondary" className="text-xs">
              Unsaved
            </Badge>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={hasConflict ? "destructive" : "outline"}
                size="sm"
                onClick={onSave}
                disabled={isSaving || !hasUnsavedChanges}
                className="h-7 px-2"
                title={hasConflict ? "Save to overwrite remote changes" : undefined}
              >
                {isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                {!isMobile && <span className="ml-1">{hasConflict ? 'Overwrite' : 'Save'}</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{hasConflict ? 'Overwrite' : 'Save'}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 min-h-0">
        {viewMode === 'html' ? (
          <HtmlPreview content={content} className="h-full p-2" onAskAI={onAskAI} />
        ) : viewMode === 'rendered' ? (
          <ScrollArea className="h-full">
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

      {/* Fullscreen HTML Preview Modal */}
      <Dialog open={isHtmlFullscreen} onOpenChange={setIsHtmlFullscreen}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] p-0 gap-0">
          <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
            <Badge variant="secondary" className="bg-background/80 backdrop-blur">
              <Globe className="h-3 w-3 mr-1" />
              HTML Preview
            </Badge>
            {currentVersion > 0 && (
              <Badge variant="outline" className="bg-background/80 backdrop-blur text-xs">
                v{currentVersion}
              </Badge>
            )}
          </div>
          <div className="absolute top-2 right-2 z-10">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsHtmlFullscreen(false)}
              className="bg-background/80 backdrop-blur"
            >
              <X className="h-4 w-4 mr-1" />
              Close
            </Button>
          </div>
          <div className="w-full h-full pt-12">
            <HtmlPreview content={content} className="h-full" onAskAI={onAskAI} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
