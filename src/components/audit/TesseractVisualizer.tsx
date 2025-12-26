import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Grid3X3, Layers, ZoomIn, ZoomOut } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type TesseractCell = Database["public"]["Tables"]["audit_tesseract_cells"]["Row"];

interface TesseractVisualizerProps {
  cells: TesseractCell[];
  currentIteration?: number;
  onCellClick?: (cell: TesseractCell) => void;
}

export function TesseractVisualizer({
  cells,
  currentIteration = 0,
  onCellClick,
}: TesseractVisualizerProps) {
  const [zoom, setZoom] = useState(1);
  const [showLabels, setShowLabels] = useState(true);

  // Build grid structure from cells - ensure we have proper x/y grid layout
  const { xElements, ySteps, cellMap, maxPolarity } = useMemo(() => {
    const xSet = new Map<number, { id: string; label: string; type: string }>();
    const ySet = new Map<number, string>();
    const cMap = new Map<string, TesseractCell>();
    let maxP = 1;

    // Default analysis steps if none provided
    const defaultSteps = [
      { step: 1, label: "Identify" },
      { step: 2, label: "Complete" },
      { step: 3, label: "Correct" },
      { step: 4, label: "Quality" },
      { step: 5, label: "Integrate" },
    ];

    cells.forEach((cell, idx) => {
      // Use x_index from cell, or fall back to index in array if all are 0
      const xIndex = cell.x_index !== 0 ? cell.x_index : idx;
      
      xSet.set(xIndex, {
        id: cell.x_element_id,
        label: cell.x_element_label || `Element ${xIndex + 1}`,
        type: cell.x_element_type,
      });
      
      const stepLabel = cell.y_step_label || defaultSteps.find(s => s.step === cell.y_step)?.label || `Step ${cell.y_step}`;
      ySet.set(cell.y_step, stepLabel);
      
      cMap.set(`${xIndex}-${cell.y_step}`, cell);
      maxP = Math.max(maxP, Math.abs(cell.z_polarity));
    });

    // If no steps recorded, add defaults
    if (ySet.size === 0) {
      defaultSteps.forEach(s => ySet.set(s.step, s.label));
    }

    return {
      xElements: Array.from(xSet.entries()).sort((a, b) => a[0] - b[0]),
      ySteps: Array.from(ySet.entries()).sort((a, b) => a[0] - b[0]),
      cellMap: cMap,
      maxPolarity: maxP,
    };
  }, [cells]);

  // Get color based on polarity (-1 to +1)
  const getPolarityColor = (polarity: number): string => {
    if (polarity === 0) return "bg-muted";
    if (polarity > 0) {
      const intensity = Math.min(polarity / maxPolarity, 1);
      if (intensity > 0.7) return "bg-green-500";
      if (intensity > 0.4) return "bg-green-400";
      return "bg-green-300";
    } else {
      const intensity = Math.min(Math.abs(polarity) / maxPolarity, 1);
      if (intensity > 0.7) return "bg-red-500";
      if (intensity > 0.4) return "bg-red-400";
      return "bg-red-300";
    }
  };

  // Get criticality badge variant
  const getCriticalityVariant = (
    criticality?: string | null
  ): "destructive" | "default" | "secondary" | "outline" => {
    switch (criticality) {
      case "critical":
        return "destructive";
      case "major":
        return "default";
      case "minor":
        return "secondary";
      default:
        return "outline";
    }
  };

  const cellSize = 40 * zoom;

  // Show empty grid skeleton when no cells but session exists
  const showEmptyGrid = cells.length === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Grid3X3 className="h-5 w-5" />
            Tesseract Visualization
            {currentIteration > 0 && (
              <Badge variant="outline" className="ml-2">
                Iteration {currentIteration}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9"
              onClick={() => setShowLabels(!showLabels)}
            >
              <Layers className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9"
              onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
              disabled={zoom <= 0.5}
            >
              <ZoomOut className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9"
              onClick={() => setZoom(Math.min(2, zoom + 0.25))}
              disabled={zoom >= 2}
            >
              <ZoomIn className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {showEmptyGrid ? (
          <div className="space-y-4">
            <div className="text-center text-muted-foreground mb-4">
              <p className="font-medium">Empty Tesseract Framework</p>
              <p className="text-sm">Agents will populate this grid during analysis</p>
            </div>
            {/* Empty grid skeleton */}
            <div className="grid gap-1 justify-center">
              <div className="flex items-center gap-1">
                <div className="w-20 h-8" />
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={`header-${i}`}
                    className="w-10 h-8 bg-muted/30 rounded flex items-center justify-center text-xs text-muted-foreground"
                  >
                    E{i}
                  </div>
                ))}
              </div>
              {["Identify", "Complete", "Correct", "Quality", "Integrate"].map((step, stepIdx) => (
                <div key={step} className="flex items-center gap-1">
                  <div className="w-20 h-10 flex items-center text-xs text-muted-foreground truncate pr-1">
                    {step}
                  </div>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={`cell-${stepIdx}-${i}`}
                      className="w-10 h-10 bg-muted/20 border border-border/30 rounded"
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
        <ScrollArea className="w-full">
          <div className="min-w-max">
            {/* Header row with X labels */}
            <div className="flex">
              <div
                style={{ width: cellSize * 2, height: cellSize }}
                className="shrink-0"
              />
              {xElements.map(([xIndex, xData]) => (
                <TooltipProvider key={xIndex}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        style={{ width: cellSize, height: cellSize }}
                        className="flex items-center justify-center text-xs font-medium text-muted-foreground truncate px-1 cursor-help"
                      >
                        {showLabels ? xData.label.slice(0, 6) : xIndex}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{xData.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Type: {xData.type}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>

            {/* Data rows */}
            {ySteps.map(([yStep, yLabel]) => (
              <div key={yStep} className="flex">
                {/* Y axis label */}
                <div
                  style={{ width: cellSize * 2, height: cellSize }}
                  className="flex items-center text-xs font-medium text-muted-foreground truncate pr-2 shrink-0"
                >
                  {showLabels ? yLabel : `Step ${yStep}`}
                </div>

                {/* Cells */}
                {xElements.map(([xIndex]) => {
                  const cell = cellMap.get(`${xIndex}-${yStep}`);
                  return (
                    <TooltipProvider key={`${xIndex}-${yStep}`}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            style={{ width: cellSize, height: cellSize }}
                            className={`
                              border border-border/50 flex items-center justify-center cursor-pointer
                              transition-all duration-200 hover:ring-2 hover:ring-primary/50
                              ${cell ? getPolarityColor(cell.z_polarity) : "bg-muted/30"}
                            `}
                            onClick={() => cell && onCellClick?.(cell)}
                          >
                            {cell?.z_criticality && (
                              <span className="text-[8px] font-bold text-white drop-shadow">
                                {cell.z_criticality[0].toUpperCase()}
                              </span>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          {cell ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={getCriticalityVariant(
                                    cell.z_criticality
                                  )}
                                >
                                  {cell.z_criticality || "info"}
                                </Badge>
                                <span className="text-sm">
                                  Polarity: {cell.z_polarity.toFixed(2)}
                                </span>
                              </div>
                              {cell.evidence_summary && (
                                <p className="text-xs">
                                  {cell.evidence_summary}
                                </p>
                              )}
                              {cell.contributing_agents &&
                                cell.contributing_agents.length > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Contributors:{" "}
                                    {cell.contributing_agents.join(", ")}
                                  </p>
                                )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No data for this cell
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        )}

        {/* Legend - Responsive */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mt-4 pt-4 border-t text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-red-500 rounded" />
            <span className="hidden sm:inline">Negative (-1)</span>
            <span className="sm:hidden">-1</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-muted rounded" />
            <span className="hidden sm:inline">Neutral (0)</span>
            <span className="sm:hidden">0</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-green-500 rounded" />
            <span className="hidden sm:inline">Positive (+1)</span>
            <span className="sm:hidden">+1</span>
          </div>
          <div className="border-l pl-2 flex items-center gap-1">
            <Badge variant="destructive" className="text-[10px] h-4 px-1">
              C
            </Badge>
            <span className="hidden sm:inline">Critical</span>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="default" className="text-[10px] h-4 px-1">
              M
            </Badge>
            <span className="hidden sm:inline">Major</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
