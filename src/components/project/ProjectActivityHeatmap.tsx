import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Activity } from "lucide-react";

interface ActivityCount {
  period: string;
  count: number;
}

interface EntityActivity {
  key: string;
  label: string;
  data: ActivityCount[];
}

interface ActivityResponse {
  entities: EntityActivity[];
  periods: string[];
  granularity: string;
}

interface ProjectActivityHeatmapProps {
  projectId: string;
  shareToken: string | null;
}

export function ProjectActivityHeatmap({ projectId, shareToken }: ProjectActivityHeatmapProps) {
  const [granularity, setGranularity] = useState<string>("week");

  const { data: activity, isLoading } = useQuery({
    queryKey: ["project-activity", projectId, granularity],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("project-activity", {
        body: { projectId, shareToken, granularity },
      });

      if (error) throw error;
      return data as ActivityResponse;
    },
    enabled: !!projectId,
    staleTime: 60000, // Cache for 1 minute
  });

  const getHeatColor = (count: number, maxCount: number): string => {
    if (count === 0) return "bg-muted";
    const intensity = Math.min(count / Math.max(maxCount, 1), 1);

    if (intensity < 0.2) return "bg-emerald-100 dark:bg-emerald-950";
    if (intensity < 0.4) return "bg-emerald-200 dark:bg-emerald-900";
    if (intensity < 0.6) return "bg-emerald-300 dark:bg-emerald-800";
    if (intensity < 0.8) return "bg-emerald-400 dark:bg-emerald-700";
    return "bg-emerald-500 dark:bg-emerald-600";
  };

  const formatPeriodLabel = (period: string): string => {
    const date = new Date(period);
    if (granularity === "day") {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } else if (granularity === "week") {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } else {
      return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    }
  };

  // Calculate max count across all entities for consistent color scaling
  const maxCount = activity?.entities.reduce((max, entity) => {
    const entityMax = Math.max(...entity.data.map((d) => d.count));
    return Math.max(max, entityMax);
  }, 0) || 1;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Project Activity</CardTitle>
              <CardDescription>Activity heatmap across project entities</CardDescription>
            </div>
          </div>
          <Select value={granularity} onValueChange={setGranularity}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Days</SelectItem>
              <SelectItem value="week">Weeks</SelectItem>
              <SelectItem value="month">Months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-4 w-32" />
                <div className="flex gap-1">
                  {Array.from({ length: 12 }).map((_, j) => (
                    <Skeleton key={j} className="h-4 w-4" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : !activity || activity.periods.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No activity recorded yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Single scrollable container for entire grid */}
            <div className="overflow-x-auto">
              <div className="min-w-max space-y-1">
                {/* Period headers */}
                <div className="flex items-center gap-1">
                  <div className="w-36 shrink-0" />
                  <div className="flex gap-1">
                    {activity.periods.map((period, idx) => (
                      <div
                        key={period}
                        className="w-5 h-4 text-[9px] text-muted-foreground text-center shrink-0"
                        title={formatPeriodLabel(period)}
                      >
                        {idx % 2 === 0 ? formatPeriodLabel(period).slice(0, 3) : ""}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Entity rows */}
                {activity.entities.map((entity) => {
                  const totalCount = entity.data.reduce((sum, d) => sum + d.count, 0);
                  return (
                    <div key={entity.key} className="flex items-center gap-1">
                      <div
                        className="w-36 shrink-0 text-xs text-muted-foreground truncate"
                        title={entity.label}
                      >
                        {entity.label}
                        <span className="ml-1 text-foreground font-medium">({totalCount})</span>
                      </div>
                      <div className="flex gap-1">
                        {entity.data.map((d) => (
                          <div
                            key={d.period}
                            className={`w-5 h-5 rounded-sm shrink-0 ${getHeatColor(d.count, maxCount)} transition-colors cursor-default`}
                            title={`${entity.label}: ${d.count} on ${formatPeriodLabel(d.period)}`}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend - outside scroll container */}
            <div className="flex items-center gap-2 pt-3 border-t text-xs text-muted-foreground">
              <span>Less</span>
              <div className="flex gap-1">
                <div className="w-4 h-4 rounded-sm bg-muted" title="0" />
                <div className="w-4 h-4 rounded-sm bg-emerald-100 dark:bg-emerald-950" title="Low" />
                <div className="w-4 h-4 rounded-sm bg-emerald-200 dark:bg-emerald-900" title="Low-Medium" />
                <div className="w-4 h-4 rounded-sm bg-emerald-300 dark:bg-emerald-800" title="Medium" />
                <div className="w-4 h-4 rounded-sm bg-emerald-400 dark:bg-emerald-700" title="Medium-High" />
                <div className="w-4 h-4 rounded-sm bg-emerald-500 dark:bg-emerald-600" title="High" />
              </div>
              <span>More</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
