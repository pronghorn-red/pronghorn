import { useMemo } from 'react';
import { Bot, User } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { format } from 'date-fns';

interface HistoryEntry {
  id: string;
  version_number: number;
  actor_type: 'human' | 'agent';
  actor_identifier: string | null;
  created_at: string;
}

interface CollaborationHeatmapProps {
  history: HistoryEntry[];
  maxVisible?: number;
}

export function CollaborationHeatmap({ 
  history, 
  maxVisible = 20 
}: CollaborationHeatmapProps) {
  const recentHistory = useMemo(() => {
    const sorted = [...history].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return sorted.slice(0, maxVisible).reverse();
  }, [history, maxVisible]);

  const actorStats = useMemo(() => {
    const stats: Record<string, { count: number; type: 'human' | 'agent' }> = {};
    history.forEach(entry => {
      const key = entry.actor_identifier || (entry.actor_type === 'agent' ? 'AI Agent' : 'Unknown User');
      if (!stats[key]) {
        stats[key] = { count: 0, type: entry.actor_type };
      }
      stats[key].count++;
    });
    return Object.entries(stats)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [history]);

  if (history.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-2">
        No edits yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Mini heatmap bar */}
      <div className="flex gap-[2px]">
        <TooltipProvider>
          {recentHistory.map((entry) => (
            <Tooltip key={entry.id}>
              <TooltipTrigger asChild>
                <div
                  className={`flex-1 h-4 rounded-sm cursor-pointer transition-colors ${
                    entry.actor_type === 'agent'
                      ? 'bg-primary/60 hover:bg-primary/80'
                      : 'bg-secondary hover:bg-secondary/80'
                  }`}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <div className="flex items-center gap-1">
                  {entry.actor_type === 'agent' ? (
                    <Bot className="h-3 w-3" />
                  ) : (
                    <User className="h-3 w-3" />
                  )}
                  <span>
                    {entry.actor_identifier || (entry.actor_type === 'agent' ? 'AI Agent' : 'User')}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  v{entry.version_number} • {format(new Date(entry.created_at), 'HH:mm')}
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>

      {/* Actor summary */}
      <div className="flex flex-wrap gap-2">
        {actorStats.slice(0, 4).map((actor) => (
          <div
            key={actor.name}
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            <div className={`w-3 h-3 rounded-full flex items-center justify-center ${
              actor.type === 'agent' ? 'bg-primary/20' : 'bg-secondary'
            }`}>
              {actor.type === 'agent' ? (
                <Bot className="h-2 w-2 text-primary" />
              ) : (
                <User className="h-2 w-2" />
              )}
            </div>
            <span className="truncate max-w-[80px]">{actor.name}</span>
            <span className="text-muted-foreground/60">({actor.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
