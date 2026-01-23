import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Copy, Archive, Eye, Code, Globe, Maximize2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { HtmlPreview } from './HtmlPreview';
import Editor from '@monaco-editor/react';

interface CodeBlockViewerProps {
  code: string;
  language: string;
  onAddArtifact: (content: string) => void;
}

export function CodeBlockViewer({ code, language, onAddArtifact }: CodeBlockViewerProps) {
  const [viewMode, setViewMode] = useState<'preview' | 'source' | 'html'>('preview');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isMobile = useIsMobile();

  // Detect if content is HTML-like
  const isHtmlContent = useMemo(() => {
    const trimmed = code.trim().toLowerCase();
    return (
      language === 'html' ||
      language === 'htm' ||
      trimmed.startsWith('<!doctype') ||
      trimmed.startsWith('<html') ||
      (trimmed.includes('<head') && trimmed.includes('<body')) ||
      (trimmed.includes('<div') && trimmed.includes('</div>') && trimmed.includes('<script')) ||
      (trimmed.includes('<style') && trimmed.includes('</style>'))
    );
  }, [code, language]);

  // Auto-select HTML view for HTML content
  useEffect(() => {
    if (isHtmlContent) {
      setViewMode('html');
    }
  }, [isHtmlContent]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleAddArtifact = () => {
    onAddArtifact(code);
  };

  // Map language to Monaco-supported language
  const monacoLanguage = useMemo(() => {
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'py': 'python',
      'rb': 'ruby',
      'yml': 'yaml',
      'md': 'markdown',
      'sh': 'shell',
      'bash': 'shell',
      'zsh': 'shell',
      'htm': 'html',
    };
    return languageMap[language] || language || 'plaintext';
  }, [language]);

  // Render content based on view mode
  const renderContent = (fullscreen = false) => {
    const height = fullscreen ? 'h-full' : 'max-h-[400px]';
    
    return (
      <div className={cn(height, "overflow-auto")}>
        {viewMode === 'preview' && (
          <pre className="p-4 text-sm overflow-x-auto bg-muted/20 h-full">
            <code className={cn(
              "block whitespace-pre-wrap break-words",
              language && `language-${language}`
            )}>
              {code}
            </code>
          </pre>
        )}
        {viewMode === 'source' && (
          <Editor
            height={fullscreen ? "100%" : "300px"}
            language={monacoLanguage}
            value={code}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              folding: true,
              wordWrap: 'on',
              fontSize: 12,
            }}
            theme="vs-dark"
          />
        )}
        {viewMode === 'html' && isHtmlContent && (
          <HtmlPreview content={code} className={fullscreen ? "h-full" : "h-[300px]"} />
        )}
      </div>
    );
  };

  // Render toolbar
  const renderToolbar = (inFullscreen = false) => (
    <div className="flex items-center justify-between p-2 border-b bg-muted/50">
      {/* Left: View mode tabs */}
      <div className="flex items-center gap-2">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'preview' | 'source' | 'html')}>
          <TabsList className="h-7">
            {isMobile ? (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TabsTrigger value="preview" className="h-6 px-2">
                        <Eye className="h-3 w-3" />
                      </TabsTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Preview</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TabsTrigger value="source" className="h-6 px-2">
                        <Code className="h-3 w-3" />
                      </TabsTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Source</TooltipContent>
                  </Tooltip>
                  {isHtmlContent && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TabsTrigger value="html" className="h-6 px-2">
                          <Globe className="h-3 w-3" />
                        </TabsTrigger>
                      </TooltipTrigger>
                      <TooltipContent>HTML</TooltipContent>
                    </Tooltip>
                  )}
                </TooltipProvider>
              </>
            ) : (
              <>
                <TabsTrigger value="preview" className="h-6 text-xs px-2">Preview</TabsTrigger>
                <TabsTrigger value="source" className="h-6 text-xs px-2">Source</TabsTrigger>
                {isHtmlContent && (
                  <TabsTrigger value="html" className="h-6 text-xs px-2">HTML</TabsTrigger>
                )}
              </>
            )}
          </TabsList>
        </Tabs>
        
        {language && (
          <Badge variant="outline" className="text-xs h-5">
            {language}
          </Badge>
        )}
      </div>
      
      {/* Right: Action buttons */}
      <TooltipProvider>
        <div className="flex gap-1">
          {!inFullscreen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsFullscreen(true)}>
                  <Maximize2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fullscreen</TooltipContent>
            </Tooltip>
          )}
          {inFullscreen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsFullscreen(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
                <Copy className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy code</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleAddArtifact}>
                <Archive className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save as artifact</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );

  return (
    <>
      <div className="my-4 border rounded-lg overflow-hidden bg-muted/30">
        {renderToolbar(false)}
        {renderContent(false)}
      </div>

      {/* Fullscreen Modal */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] p-0 gap-0 flex flex-col">
          {renderToolbar(true)}
          <div className="flex-1 min-h-0">
            {renderContent(true)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
