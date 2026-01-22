import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2, FileWarning, HardDrive, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export interface PendingLargeFile {
  path: string;
  size: number;
  rawUrl: string;
  commitSha: string;
}

interface LargeFileStatus {
  path: string;
  size: number;
  status: 'pending' | 'processing' | 'success' | 'error' | 'skipped';
  error?: string;
}

interface LargeFileTrackerProps {
  pendingFiles: PendingLargeFile[];
  repoId: string;
  projectId: string;
  shareToken: string | null;
  pat: string;
  onComplete: (results: { success: number; failed: number }) => void;
  onCancel: () => void;
}

export function LargeFileTracker({
  pendingFiles,
  repoId,
  projectId,
  shareToken,
  pat,
  onComplete,
  onCancel,
}: LargeFileTrackerProps) {
  const [fileStatuses, setFileStatuses] = useState<LargeFileStatus[]>(
    pendingFiles.map(f => ({
      path: f.path,
      size: f.size,
      status: 'pending',
    }))
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const processNextFile = async () => {
    if (currentIndex >= pendingFiles.length) {
      // All done
      const successCount = fileStatuses.filter(f => f.status === 'success').length;
      const failedCount = fileStatuses.filter(f => f.status === 'error').length;
      setIsComplete(true);
      setIsProcessing(false);
      onComplete({ success: successCount, failed: failedCount });
      return;
    }

    const file = pendingFiles[currentIndex];
    
    // Update status to processing
    setFileStatuses(prev => prev.map((f, i) => 
      i === currentIndex ? { ...f, status: 'processing' } : f
    ));

    try {
      // Get current session for auth token
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-large-file`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            repoId,
            projectId,
            shareToken,
            file: {
              path: file.path,
              size: file.size,
              rawUrl: file.rawUrl,
              commitSha: file.commitSha,
            },
            pat,
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        setFileStatuses(prev => prev.map((f, i) => 
          i === currentIndex ? { ...f, status: 'success' } : f
        ));
      } else if (result.skipped) {
        // File was skipped due to size limit
        setFileStatuses(prev => prev.map((f, i) => 
          i === currentIndex ? { ...f, status: 'skipped', error: result.error } : f
        ));
      } else {
        setFileStatuses(prev => prev.map((f, i) => 
          i === currentIndex ? { ...f, status: 'error', error: result.error } : f
        ));
      }
    } catch (err) {
      setFileStatuses(prev => prev.map((f, i) => 
        i === currentIndex ? { 
          ...f, 
          status: 'error', 
          error: err instanceof Error ? err.message : 'Unknown error' 
        } : f
      ));
    }

    setCurrentIndex(prev => prev + 1);
  };

  // Start processing when component mounts or index changes
  useEffect(() => {
    if (isProcessing && currentIndex < pendingFiles.length) {
      processNextFile();
    }
  }, [currentIndex, isProcessing]);

  // Auto-start processing
  useEffect(() => {
    if (pendingFiles.length > 0 && !isProcessing && !isComplete) {
      setIsProcessing(true);
      processNextFile();
    }
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const completedCount = fileStatuses.filter(f => f.status === 'success' || f.status === 'error' || f.status === 'skipped').length;
  const skippedCount = fileStatuses.filter(f => f.status === 'skipped').length;
  const progressPercent = pendingFiles.length > 0 ? (completedCount / pendingFiles.length) * 100 : 0;

  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <HardDrive className="h-5 w-5 text-warning" />
          Processing Large Files
          <span className="text-sm font-normal text-muted-foreground ml-2">
            ({completedCount}/{pendingFiles.length})
            {skippedCount > 0 && <span className="text-warning ml-1">({skippedCount} too large)</span>}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={progressPercent} className="h-2" />
        
        <div className="max-h-48 overflow-y-auto space-y-2">
          {fileStatuses.map((file, index) => (
            <div 
              key={file.path}
              className={`flex items-center gap-3 p-2 rounded text-sm ${
                file.status === 'processing' ? 'bg-primary/10' :
                file.status === 'success' ? 'bg-success/10' :
                file.status === 'error' ? 'bg-destructive/10' :
                file.status === 'skipped' ? 'bg-warning/10' : 'bg-muted/50'
              }`}
            >
              <div className="flex-shrink-0">
                {file.status === 'pending' && (
                  <FileWarning className="h-4 w-4 text-muted-foreground" />
                )}
                {file.status === 'processing' && (
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                )}
                {file.status === 'success' && (
                  <CheckCircle className="h-4 w-4 text-success" />
                )}
                {file.status === 'error' && (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                {file.status === 'skipped' && (
                  <AlertTriangle className="h-4 w-4 text-warning" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="truncate font-mono text-xs">{file.path}</p>
                {file.error && (
                  <p className="text-xs text-destructive truncate">{file.error}</p>
                )}
              </div>
              
              <div className="flex-shrink-0 text-xs text-muted-foreground">
                {formatSize(file.size)}
              </div>
            </div>
          ))}
        </div>

        {isComplete ? (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => onComplete({ 
              success: fileStatuses.filter(f => f.status === 'success').length,
              failed: fileStatuses.filter(f => f.status === 'error').length 
            })}>
              Done
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
