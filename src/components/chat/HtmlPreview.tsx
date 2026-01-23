import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, AlertTriangle, ChevronUp, Copy, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CapturedError {
  type: 'error' | 'unhandled-rejection' | 'console-error';
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  timestamp: Date;
}

interface HtmlPreviewProps {
  content: string;
  className?: string;
}

export function HtmlPreview({ content, className }: HtmlPreviewProps) {
  const [key, setKey] = useState(0);
  const [errors, setErrors] = useState<CapturedError[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Error capture script to inject into iframe
  const errorCaptureScript = `
<script>
(function() {
  var postError = function(type, msg, source, lineno, colno) {
    try {
      window.parent.postMessage({
        type: 'iframe-error',
        payload: { type: type, message: String(msg || 'Unknown error'), source: source, lineno: lineno, colno: colno }
      }, '*');
    } catch(e) {}
  };
  
  window.onerror = function(msg, source, lineno, colno, error) {
    postError('error', error && error.message ? error.message : msg, source, lineno, colno);
    return false;
  };
  
  window.onunhandledrejection = function(event) {
    var reason = event.reason;
    postError('unhandled-rejection', reason && reason.message ? reason.message : String(reason));
  };
  
  var origConsoleError = console.error;
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    postError('console-error', args.map(function(a) { return String(a); }).join(' '));
    origConsoleError.apply(console, args);
  };
})();
</script>`;

  // Wrap content in full HTML structure if needed and inject error capture
  const wrappedContent = useMemo(() => {
    const trimmed = content.trim().toLowerCase();
    let html = content;
    
    // If content already has full HTML structure, use as-is
    if (!trimmed.startsWith('<!doctype') && !trimmed.startsWith('<html')) {
      // Otherwise, wrap in basic HTML structure
      html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 16px; }
    </style>
  </head>
  <body>
    ${content}
  </body>
</html>`;
    }
    
    // Inject error capture script
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${errorCaptureScript}</head>`);
    } else if (html.includes('<body')) {
      html = html.replace('<body', `${errorCaptureScript}<body`);
    } else {
      html = errorCaptureScript + html;
    }
    
    return html;
  }, [content, errorCaptureScript]);

  // Listen for error messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'iframe-error') {
        const { type, message, source, lineno, colno } = event.data.payload;
        setErrors(prev => [...prev, {
          type,
          message,
          source,
          lineno,
          colno,
          timestamp: new Date()
        }]);
        setShowErrors(true);
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Clear errors and refresh when content changes
  useEffect(() => {
    setErrors([]);
    setShowErrors(false);
    setKey(prev => prev + 1);
  }, [content]);

  const handleRefresh = () => {
    setErrors([]);
    setKey(prev => prev + 1);
  };

  const copyError = async (err: CapturedError) => {
    const text = `[${err.type}] ${err.message}${err.lineno ? ` (Line ${err.lineno}${err.colno ? `:${err.colno}` : ''})` : ''}`;
    await navigator.clipboard.writeText(text);
    toast.success('Error copied');
  };

  const copyAllErrors = async () => {
    const text = errors.map(err => 
      `[${err.type}] ${err.message}${err.lineno ? ` (Line ${err.lineno}${err.colno ? `:${err.colno}` : ''})` : ''}`
    ).join('\n');
    await navigator.clipboard.writeText(text);
    toast.success(`${errors.length} error(s) copied`);
  };

  const clearErrors = () => {
    setErrors([]);
    setShowErrors(false);
  };

  return (
    <div className={cn("relative w-full h-full flex flex-col", className)}>
      {/* Top toolbar */}
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        {errors.length > 0 && (
          <Badge variant="destructive" className="h-7 px-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {errors.length}
          </Badge>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRefresh}
          className="h-7 bg-background/80 backdrop-blur"
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Iframe preview */}
      <iframe
        ref={iframeRef}
        key={key}
        srcDoc={wrappedContent}
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
        className={cn(
          "w-full flex-1 border-0 bg-white rounded",
          errors.length > 0 && showErrors && "rounded-b-none"
        )}
        title="HTML Preview"
      />

      {/* Error Panel */}
      {errors.length > 0 && (
        <div className="border-t border-destructive/30 bg-destructive/5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowErrors(!showErrors)}
            className="w-full rounded-none justify-between h-8 px-3 hover:bg-destructive/10 text-destructive"
          >
            <span className="flex items-center gap-2 text-xs font-medium">
              <AlertTriangle className="h-3 w-3" />
              {errors.length} Error{errors.length !== 1 ? 's' : ''} Captured
            </span>
            <ChevronUp className={cn("h-4 w-4 transition-transform", !showErrors && "rotate-180")} />
          </Button>
          
          {showErrors && (
            <div className="max-h-48 overflow-auto">
              {errors.map((err, i) => (
                <div 
                  key={i} 
                  className="flex items-start justify-between p-2 border-b border-destructive/10 text-xs hover:bg-destructive/5"
                >
                  <div className="flex-1 min-w-0 flex items-start gap-2">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px] shrink-0 mt-0.5",
                        err.type === 'error' && "border-destructive/50 text-destructive",
                        err.type === 'unhandled-rejection' && "border-orange-500/50 text-orange-600",
                        err.type === 'console-error' && "border-yellow-500/50 text-yellow-600"
                      )}
                    >
                      {err.type === 'unhandled-rejection' ? 'rejection' : err.type}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <span className="text-foreground break-all">
                        {err.message}
                      </span>
                      {err.lineno && (
                        <span className="text-muted-foreground ml-2">
                          Line {err.lineno}{err.colno ? `:${err.colno}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0 hover:bg-destructive/10"
                    onClick={() => copyError(err)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              
              {/* Actions footer */}
              <div className="p-2 flex justify-end gap-2 border-t border-destructive/10 bg-destructive/5">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearErrors}
                  className="h-7 text-xs hover:bg-destructive/10"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={copyAllErrors}
                  className="h-7 text-xs"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy All
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
