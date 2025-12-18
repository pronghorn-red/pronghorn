import React from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Pause, 
  Play, 
  Square, 
  Download,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

interface ExecutionProgress {
  currentBatch: number;
  totalBatches: number;
  rowsCompleted: number;
  totalRows: number;
  currentStatement: string;
  status: 'running' | 'paused' | 'completed' | 'error';
  errors: { row: number; error: string }[];
  startTime?: number;
}

interface ImportProgressTrackerProps {
  progress: ExecutionProgress;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetryFailed?: () => void;
}

export default function ImportProgressTracker({
  progress,
  onPause,
  onResume,
  onCancel,
  onRetryFailed
}: ImportProgressTrackerProps) {
  const percentComplete = progress.totalRows > 0 
    ? Math.round((progress.rowsCompleted / progress.totalRows) * 100) 
    : 0;

  const elapsedMs = progress.startTime 
    ? Date.now() - progress.startTime 
    : 0;

  const rowsPerSecond = elapsedMs > 1000 
    ? (progress.rowsCompleted / (elapsedMs / 1000)).toFixed(1) 
    : '—';

  const estimatedRemaining = progress.rowsCompleted > 0 && progress.startTime
    ? Math.round(((progress.totalRows - progress.rowsCompleted) / progress.rowsCompleted) * (elapsedMs / 1000))
    : null;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const downloadErrorLog = () => {
    if (progress.errors.length === 0) return;
    
    const content = progress.errors.map(e => 
      `Row ${e.row}: ${e.error}`
    ).join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import_errors.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Error log downloaded');
  };

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {progress.status === 'running' && (
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          )}
          {progress.status === 'paused' && (
            <Pause className="h-6 w-6 text-amber-500" />
          )}
          {progress.status === 'completed' && (
            <CheckCircle2 className="h-6 w-6 text-green-500" />
          )}
          {progress.status === 'error' && (
            <XCircle className="h-6 w-6 text-destructive" />
          )}
          
          <div>
            <h3 className="font-semibold">
              {progress.status === 'running' && 'Importing data...'}
              {progress.status === 'paused' && 'Import paused'}
              {progress.status === 'completed' && 'Import completed'}
              {progress.status === 'error' && 'Import failed'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {progress.rowsCompleted.toLocaleString()} of {progress.totalRows.toLocaleString()} rows
            </p>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center gap-2">
          {progress.status === 'running' && (
            <>
              <Button variant="outline" size="sm" onClick={onPause}>
                <Pause className="h-4 w-4 mr-1" />
                Pause
              </Button>
              <Button variant="destructive" size="sm" onClick={onCancel}>
                <Square className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </>
          )}
          {progress.status === 'paused' && (
            <>
              <Button variant="default" size="sm" onClick={onResume}>
                <Play className="h-4 w-4 mr-1" />
                Resume
              </Button>
              <Button variant="destructive" size="sm" onClick={onCancel}>
                <Square className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>{percentComplete}% complete</span>
          <span className="text-muted-foreground">
            Batch {progress.currentBatch} of {progress.totalBatches}
          </span>
        </div>
        <Progress value={percentComplete} className="h-3" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-3 rounded-lg bg-muted/50 text-center">
          <div className="text-2xl font-bold text-primary">
            {progress.rowsCompleted.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Rows Imported</div>
        </div>
        <div className="p-3 rounded-lg bg-muted/50 text-center">
          <div className="text-2xl font-bold">
            {rowsPerSecond}
          </div>
          <div className="text-xs text-muted-foreground">Rows/Second</div>
        </div>
        <div className="p-3 rounded-lg bg-muted/50 text-center">
          <div className="text-2xl font-bold">
            {formatTime(Math.round(elapsedMs / 1000))}
          </div>
          <div className="text-xs text-muted-foreground">Elapsed Time</div>
        </div>
        <div className="p-3 rounded-lg bg-muted/50 text-center">
          <div className="text-2xl font-bold">
            {estimatedRemaining !== null ? formatTime(estimatedRemaining) : '—'}
          </div>
          <div className="text-xs text-muted-foreground">Est. Remaining</div>
        </div>
      </div>

      {/* Current Statement */}
      {progress.currentStatement && progress.status === 'running' && (
        <div className="p-3 rounded-lg bg-muted/30 border">
          <div className="text-xs text-muted-foreground mb-1">Current operation:</div>
          <div className="text-sm font-mono truncate">{progress.currentStatement}</div>
        </div>
      )}

      {/* Errors */}
      {progress.errors.length > 0 && (
        <div className="flex-1 min-h-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="font-medium text-destructive">
                {progress.errors.length} error(s)
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onRetryFailed && progress.status === 'completed' && (
                <Button variant="outline" size="sm" onClick={onRetryFailed}>
                  Retry Failed Rows
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={downloadErrorLog}>
                <Download className="h-4 w-4 mr-1" />
                Download Error Log
              </Button>
            </div>
          </div>
          
          <div className="border rounded-lg overflow-hidden">
            <ScrollArea className="h-[200px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-20">Row</th>
                    <th className="px-3 py-2 text-left font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.errors.map((err, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{err.row}</td>
                      <td className="px-3 py-2 text-destructive text-xs">{err.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        </div>
      )}

      {/* Success Message */}
      {progress.status === 'completed' && progress.errors.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h3 className="text-xl font-semibold">Import Successful!</h3>
            <p className="text-muted-foreground">
              Successfully imported {progress.rowsCompleted.toLocaleString()} rows in {formatTime(Math.round(elapsedMs / 1000))}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
