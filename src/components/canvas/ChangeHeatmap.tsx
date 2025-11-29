import { Card } from '@/components/ui/card';

interface ChangeMetric {
  iteration: number;
  agentId: string;
  agentLabel: string;
  nodesAdded: number;
  nodesEdited: number;
  nodesDeleted: number;
  edgesAdded: number;
  edgesEdited: number;
  edgesDeleted: number;
  timestamp: string;
}

interface ChangeHeatmapProps {
  metrics: ChangeMetric[];
  currentIteration: number;
  totalIterations: number;
}

export function ChangeHeatmap({ metrics, currentIteration, totalIterations }: ChangeHeatmapProps) {
  // Group metrics by agent and iteration
  const agentIds = [...new Set(metrics.map(m => m.agentLabel))];
  const iterations = [...new Set(metrics.map(m => m.iteration))].sort((a, b) => a - b);

  // Calculate max change count for color scaling
  const maxChanges = Math.max(
    ...metrics.map(m => 
      m.nodesAdded + m.nodesEdited + m.nodesDeleted + 
      m.edgesAdded + m.edgesEdited + m.edgesDeleted
    ),
    1
  );

  const getChangeCount = (agentLabel: string, iteration: number) => {
    const metric = metrics.find(m => m.agentLabel === agentLabel && m.iteration === iteration);
    if (!metric) return 0;
    return metric.nodesAdded + metric.nodesEdited + metric.nodesDeleted + 
           metric.edgesAdded + metric.edgesEdited + metric.edgesDeleted;
  };

  const getHeatColor = (changeCount: number) => {
    if (changeCount === 0) return 'bg-muted';
    const intensity = Math.min(changeCount / maxChanges, 1);
    
    if (intensity < 0.2) return 'bg-blue-100 dark:bg-blue-950';
    if (intensity < 0.4) return 'bg-blue-200 dark:bg-blue-900';
    if (intensity < 0.6) return 'bg-orange-200 dark:bg-orange-900';
    if (intensity < 0.8) return 'bg-orange-300 dark:bg-orange-800';
    return 'bg-red-300 dark:bg-red-800';
  };

  const getMetricDetails = (agentLabel: string, iteration: number) => {
    const metric = metrics.find(m => m.agentLabel === agentLabel && m.iteration === iteration);
    if (!metric) return null;
    
    return (
      <div className="text-xs space-y-1">
        <div className="font-semibold">{agentLabel} - Iteration {iteration}</div>
        <div className="grid grid-cols-2 gap-1">
          <div>Nodes: +{metric.nodesAdded} ~{metric.nodesEdited} -{metric.nodesDeleted}</div>
          <div>Edges: +{metric.edgesAdded} -{metric.edgesDeleted}</div>
        </div>
      </div>
    );
  };

  return (
    <Card className="p-4">
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">
          Change Heatmap
          {currentIteration > 0 && (
            <span className="ml-2 text-muted-foreground">
              ({currentIteration}/{totalIterations})
            </span>
          )}
        </h3>

        {metrics.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            No change data yet. Start iteration to see heatmap.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="grid gap-1" style={{ 
                gridTemplateColumns: `120px repeat(${iterations.length}, minmax(60px, 1fr))`
              }}>
                {/* Header row */}
                <div className="sticky left-0 bg-background font-semibold text-xs p-2">
                  Agent / Iteration
                </div>
                {iterations.map(iter => (
                  <div key={iter} className="font-semibold text-xs text-center p-2">
                    {iter}
                  </div>
                ))}

                {/* Agent rows */}
                {agentIds.map(agentLabel => (
                  <>
                    <div className="sticky left-0 bg-background text-xs p-2 truncate" title={agentLabel}>
                      {agentLabel}
                    </div>
                    {iterations.map(iter => {
                      const changeCount = getChangeCount(agentLabel, iter);
                      return (
                        <div
                          key={`${agentLabel}-${iter}`}
                          className={`${getHeatColor(changeCount)} p-2 text-center text-xs font-semibold cursor-help transition-colors hover:ring-2 ring-primary`}
                          title={getMetricDetails(agentLabel, iter)?.props.children || ''}
                        >
                          {changeCount > 0 ? changeCount : ''}
                        </div>
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
          <span>Intensity:</span>
          <div className="flex gap-1">
            <div className="w-4 h-4 bg-muted" title="No changes" />
            <div className="w-4 h-4 bg-blue-100 dark:bg-blue-950" title="Low" />
            <div className="w-4 h-4 bg-blue-200 dark:bg-blue-900" title="Low-Medium" />
            <div className="w-4 h-4 bg-orange-200 dark:bg-orange-900" title="Medium" />
            <div className="w-4 h-4 bg-orange-300 dark:bg-orange-800" title="Medium-High" />
            <div className="w-4 h-4 bg-red-300 dark:bg-red-800" title="High" />
          </div>
        </div>
      </div>
    </Card>
  );
}
