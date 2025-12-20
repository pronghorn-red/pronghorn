import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  Bot, 
  User,
  History
} from 'lucide-react';
import { format } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface HistoryEntry {
  id: string;
  version_number: number;
  actor_type: 'human' | 'agent';
  actor_identifier: string | null;
  operation_type: 'edit' | 'insert' | 'delete';
  start_line: number;
  end_line: number;
  old_content: string | null;
  new_content: string | null;
  full_content_snapshot?: string | null;
  narrative: string | null;
  created_at: string;
}

interface CollaborationTimelineProps {
  history: HistoryEntry[];
  currentVersion: number;
  latestVersion: number;
  onVersionChange: (version: number) => void;
  onRestore: (version: number) => void;
  isRestoring?: boolean;
  compact?: boolean;
}

export function CollaborationTimeline({
  history,
  currentVersion,
  latestVersion,
  onVersionChange,
  onRestore,
  isRestoring = false,
  compact = false,
}: CollaborationTimelineProps) {
  const sortedHistory = useMemo(() => 
    [...history].sort((a, b) => a.version_number - b.version_number),
    [history]
  );

  const currentEntry = sortedHistory.find(h => h.version_number === currentVersion);

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-2 border-t bg-muted/30">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onVersionChange(Math.max(1, currentVersion - 1))}
                disabled={currentVersion <= 1 || isRestoring}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Previous version</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex-1 flex items-center gap-2">
          <History className="h-3 w-3 text-muted-foreground" />
          <Slider
            value={[currentVersion]}
            min={1}
            max={latestVersion || 1}
            step={1}
            onValueChange={([value]) => onVersionChange(value)}
            disabled={latestVersion <= 1 || isRestoring}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[60px] text-right">
            {currentVersion} / {latestVersion || 1}
          </span>
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onVersionChange(Math.min(latestVersion, currentVersion + 1))}
                disabled={currentVersion >= latestVersion || isRestoring}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Next version</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onRestore(currentVersion)}
                disabled={isRestoring}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Restore
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create new version from this content</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <History className="h-4 w-4" />
          Version History
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {latestVersion} total versions
        </p>
      </div>

      <div className="p-3 border-b space-y-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onVersionChange(Math.max(1, currentVersion - 1))}
            disabled={currentVersion <= 1 || isRestoring}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Slider
            value={[currentVersion]}
            min={1}
            max={latestVersion || 1}
            step={1}
            onValueChange={([value]) => onVersionChange(value)}
            disabled={latestVersion <= 1 || isRestoring}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onVersionChange(Math.min(latestVersion, currentVersion + 1))}
            disabled={currentVersion >= latestVersion || isRestoring}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            Version {currentVersion} of {latestVersion || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRestore(currentVersion)}
            disabled={isRestoring}
          >
            <RotateCcw className="h-3 w-3 mr-2" />
            Restore v{currentVersion}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {sortedHistory.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onVersionChange(entry.version_number)}
              className={`w-full text-left p-2 rounded-md transition-colors ${
                entry.version_number === currentVersion
                  ? 'bg-primary/10 border border-primary/20'
                  : 'hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  entry.actor_type === 'agent' 
                    ? 'bg-primary/10' 
                    : 'bg-secondary'
                }`}>
                  {entry.actor_type === 'agent' ? (
                    <Bot className="h-3 w-3 text-primary" />
                  ) : (
                    <User className="h-3 w-3 text-secondary-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">v{entry.version_number}</span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {entry.operation_type}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {entry.actor_identifier || (entry.actor_type === 'agent' ? 'AI Agent' : 'User')}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(entry.created_at), 'HH:mm')}
                </span>
              </div>
              {entry.narrative && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 pl-8">
                  {entry.narrative}
                </p>
              )}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
