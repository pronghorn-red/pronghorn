import { useState, useMemo, useCallback } from "react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Grid3X3, FileJson, FileSpreadsheet, Search, MessageSquare } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type TesseractCell = Database["public"]["Tables"]["audit_tesseract_cells"]["Row"];

export interface TesseractElement {
  id: string;
  label: string;
  content: string;
  category?: string;
}

interface TesseractVisualizerProps {
  cells: TesseractCell[];
  currentIteration?: number;
  onCellClick?: (cell: TesseractCell) => void;
  d1Elements?: TesseractElement[];
  d2Elements?: TesseractElement[];
  d1Label?: string;
  d2Label?: string;
  onDeepDive?: (conceptLabel: string, d1Items: TesseractElement[], d2Items: TesseractElement[]) => void;
}

interface ConceptColumn {
  conceptLabel: string;
  conceptId: string;
  polarity: number;
  criticality: string | null;
  rationale: string | null;
  d1ElementIds: string[];
  d2ElementIds: string[];
}

export function TesseractVisualizer({
  cells,
  currentIteration = 0,
  onCellClick,
  d1Elements = [],
  d2Elements = [],
  d1Label = "D1",
  d2Label = "D2",
  onDeepDive,
}: TesseractVisualizerProps) {
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);
  const [deepDiveData, setDeepDiveData] = useState<{
    conceptLabel: string;
    d1Items: TesseractElement[];
    d2Items: TesseractElement[];
    polarity: number;
    rationale: string | null;
  } | null>(null);

  // Build column-based structure from cells
  const columns = useMemo<ConceptColumn[]>(() => {
    const columnMap = new Map<string, ConceptColumn>();

    cells.forEach((cell, idx) => {
      const conceptLabel = cell.x_element_label || `Concept ${idx + 1}`;
      const conceptId = cell.x_element_id;

      if (!columnMap.has(conceptId)) {
        // Parse evidence_refs to get D1/D2 element IDs
        let d1Ids: string[] = [];
        let d2Ids: string[] = [];
        
        if (cell.evidence_refs) {
          // Support both field naming conventions: d1Ids/d2Ids (DB format) and d1ElementIds/d2ElementIds
          const refs = cell.evidence_refs as { d1Ids?: string[]; d2Ids?: string[]; d1ElementIds?: string[]; d2ElementIds?: string[] };
          d1Ids = refs.d1Ids || refs.d1ElementIds || [];
          d2Ids = refs.d2Ids || refs.d2ElementIds || [];
        }

        columnMap.set(conceptId, {
          conceptLabel,
          conceptId,
          polarity: cell.z_polarity,
          criticality: cell.z_criticality,
          rationale: cell.evidence_summary,
          d1ElementIds: d1Ids,
          d2ElementIds: d2Ids,
        });
      }
    });

    return Array.from(columnMap.values());
  }, [cells]);

  // Get polarity display info
  const getPolarityInfo = (polarity: number) => {
    if (polarity > 0.5) {
      return { label: "HIGH", color: "bg-green-500 text-white", textColor: "text-green-600" };
    } else if (polarity > 0) {
      return { label: "MED", color: "bg-yellow-500 text-white", textColor: "text-yellow-600" };
    } else if (polarity === 0) {
      return { label: "NEUTRAL", color: "bg-muted text-muted-foreground", textColor: "text-muted-foreground" };
    } else {
      return { label: "LOW", color: "bg-red-500 text-white", textColor: "text-red-600" };
    }
  };

  // Get D1/D2 elements for a column
  const getD1Items = useCallback((elementIds: string[]): TesseractElement[] => {
    return d1Elements.filter(el => elementIds.includes(el.id));
  }, [d1Elements]);

  const getD2Items = useCallback((elementIds: string[]): TesseractElement[] => {
    return d2Elements.filter(el => elementIds.includes(el.id));
  }, [d2Elements]);

  // Handle column click for selection
  const handleColumnClick = (column: ConceptColumn) => {
    setSelectedColumn(selectedColumn === column.conceptId ? null : column.conceptId);
  };

  // Handle deep dive button click
  const handleDeepDiveClick = (column: ConceptColumn) => {
    const d1Items = getD1Items(column.d1ElementIds);
    const d2Items = getD2Items(column.d2ElementIds);
    
    setDeepDiveData({
      conceptLabel: column.conceptLabel,
      d1Items,
      d2Items,
      polarity: column.polarity,
      rationale: column.rationale,
    });
    setDeepDiveOpen(true);
    
    onDeepDive?.(column.conceptLabel, d1Items, d2Items);
  };

  // Export as JSON
  const exportAsJson = useCallback(() => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      iteration: currentIteration,
      stats: {
        totalCells: cells.length,
        columns: columns.length,
      },
      columns: columns.map(col => ({
        conceptLabel: col.conceptLabel,
        conceptId: col.conceptId,
        polarity: col.polarity,
        criticality: col.criticality,
        rationale: col.rationale,
        d1ElementIds: col.d1ElementIds,
        d2ElementIds: col.d2ElementIds,
        d1Elements: getD1Items(col.d1ElementIds),
        d2Elements: getD2Items(col.d2ElementIds),
      })),
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tesseract-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [cells, currentIteration, columns, getD1Items, getD2Items]);

  // Export as CSV
  const exportAsCsv = useCallback(() => {
    const rows = [
      ["Concept", "Polarity", "Criticality", "Rationale", "D1 Element IDs", "D2 Element IDs"],
      ...columns.map(col => [
        col.conceptLabel,
        col.polarity.toString(),
        col.criticality || "",
        col.rationale || "",
        col.d1ElementIds.join("; "),
        col.d2ElementIds.join("; "),
      ]),
    ];
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tesseract-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [columns]);

  // Show empty grid skeleton when no cells
  const showEmptyGrid = cells.length === 0 || columns.length === 0;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2">
            {/* Title row */}
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <Grid3X3 className="h-5 w-5" />
              <span>Tesseract Visualization</span>
              {currentIteration > 0 && (
                <Badge variant="outline" className="text-xs">
                  Iteration {currentIteration}
                </Badge>
              )}
            </CardTitle>
            
            {/* Controls row */}
            <div className="flex items-center gap-1 flex-wrap">
              {cells.length > 0 && (
                <>
                  <Button variant="outline" size="sm" className="h-8" onClick={exportAsJson}>
                    <FileJson className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">JSON</span>
                  </Button>
                  <Button variant="outline" size="sm" className="h-8" onClick={exportAsCsv}>
                    <FileSpreadsheet className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">CSV</span>
                  </Button>
                </>
              )}
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
              {/* Empty grid skeleton - now column-based */}
              <div className="flex gap-4 justify-center">
                {[1, 2, 3].map((i) => (
                  <div
                    key={`skeleton-${i}`}
                    className="w-48 border border-border/30 rounded-lg p-3 bg-muted/10"
                  >
                    <div className="h-5 bg-muted/30 rounded mb-3" />
                    <div className="h-8 bg-muted/20 rounded mb-3" />
                    <div className="space-y-2 mb-3">
                      <div className="h-4 bg-blue-500/10 rounded w-3/4" />
                      <div className="h-4 bg-blue-500/10 rounded w-1/2" />
                    </div>
                    <div className="space-y-2 mb-3">
                      <div className="h-4 bg-green-500/10 rounded w-2/3" />
                      <div className="h-4 bg-green-500/10 rounded w-3/4" />
                    </div>
                    <div className="h-8 bg-muted/20 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <ScrollArea className="w-full">
              <div className="flex gap-4 pb-4 pr-4 min-w-max">
                {columns.map((column) => {
                  const polarityInfo = getPolarityInfo(column.polarity);
                  const d1Items = getD1Items(column.d1ElementIds);
                  const d2Items = getD2Items(column.d2ElementIds);
                  const isSelected = selectedColumn === column.conceptId;

                  return (
                    <div
                      key={column.conceptId}
                      className={`
                        min-w-[220px] max-w-[280px] flex-shrink-0 border rounded-lg overflow-hidden
                        transition-all duration-200 cursor-pointer
                        ${isSelected 
                          ? "ring-2 ring-primary border-primary shadow-lg" 
                          : "border-border hover:border-primary/50 hover:shadow-md"
                        }
                      `}
                      onClick={() => handleColumnClick(column)}
                    >
                      {/* Concept Title Header */}
                      <div className="bg-muted/50 p-3 border-b">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <h3 className="font-semibold text-sm truncate">
                                {column.conceptLabel}
                              </h3>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="font-medium">{column.conceptLabel}</p>
                              {column.rationale && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {column.rationale}
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>

                      {/* Alignment / Polarity Row */}
                      <div className="p-3 border-b bg-background">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">Alignment</span>
                          <Badge className={`${polarityInfo.color} text-xs`}>
                            {polarityInfo.label} ({column.polarity > 0 ? "+" : ""}{column.polarity.toFixed(1)})
                          </Badge>
                        </div>
                      </div>

                      {/* D1 Items Section */}
                      <div className="p-3 border-b">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                          <span className="text-xs font-medium text-blue-600">{d1Label}</span>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-auto">
                            {d1Items.length || column.d1ElementIds.length}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          {d1Items.length > 0 ? (
                            d1Items.map((item) => (
                              <TooltipProvider key={item.id}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="text-xs px-2 py-1 bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded truncate cursor-help">
                                      {item.label}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-sm">
                                    <p className="font-medium">{item.label}</p>
                                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-4">
                                      {item.content.slice(0, 200)}...
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ))
                          ) : column.d1ElementIds.length > 0 ? (
                            column.d1ElementIds.slice(0, 3).map((id) => (
                              <div 
                                key={id} 
                                className="text-xs px-2 py-1 bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded truncate"
                              >
                                {id.slice(0, 20)}...
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No items</p>
                          )}
                        </div>
                      </div>

                      {/* D2 Items Section */}
                      <div className="p-3 border-b">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="text-xs font-medium text-green-600">{d2Label}</span>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-auto">
                            {d2Items.length || column.d2ElementIds.length}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          {d2Items.length > 0 ? (
                            d2Items.map((item) => (
                              <TooltipProvider key={item.id}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="text-xs px-2 py-1 bg-green-500/10 text-green-700 dark:text-green-300 rounded truncate cursor-help">
                                      {item.label}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-sm">
                                    <p className="font-medium">{item.label}</p>
                                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-4">
                                      {item.content.slice(0, 200)}...
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ))
                          ) : column.d2ElementIds.length > 0 ? (
                            column.d2ElementIds.slice(0, 3).map((id) => (
                              <div 
                                key={id} 
                                className="text-xs px-2 py-1 bg-green-500/10 text-green-700 dark:text-green-300 rounded truncate"
                              >
                                {id.slice(0, 20)}...
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No items</p>
                          )}
                        </div>
                      </div>

                      {/* Deep Dive Button */}
                      <div className="p-3 bg-muted/30">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeepDiveClick(column);
                          }}
                        >
                          <Search className="h-4 w-4" />
                          Deep Dive
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mt-4 pt-4 border-t text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span>{d1Label} Items</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>{d2Label} Items</span>
            </div>
            <div className="border-l pl-2 flex items-center gap-1">
              <Badge className="bg-green-500 text-white text-[10px] h-4 px-1">HIGH</Badge>
              <span className="hidden sm:inline">Strong Alignment</span>
            </div>
            <div className="flex items-center gap-1">
              <Badge className="bg-yellow-500 text-white text-[10px] h-4 px-1">MED</Badge>
              <span className="hidden sm:inline">Partial</span>
            </div>
            <div className="flex items-center gap-1">
              <Badge className="bg-red-500 text-white text-[10px] h-4 px-1">LOW</Badge>
              <span className="hidden sm:inline">Gap</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deep Dive Panel */}
      <Sheet open={deepDiveOpen} onOpenChange={setDeepDiveOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Deep Dive: {deepDiveData?.conceptLabel}
            </SheetTitle>
            <SheetDescription>
              Analyze the fit/gap between {d1Label} and {d2Label} elements for this concept
            </SheetDescription>
          </SheetHeader>
          
          {deepDiveData && (
            <div className="mt-6 space-y-6">
              {/* Alignment Summary */}
              <div className="p-4 rounded-lg bg-muted/30 border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Current Alignment</span>
                  <Badge className={getPolarityInfo(deepDiveData.polarity).color}>
                    {getPolarityInfo(deepDiveData.polarity).label} ({deepDiveData.polarity > 0 ? "+" : ""}{deepDiveData.polarity.toFixed(2)})
                  </Badge>
                </div>
                {deepDiveData.rationale && (
                  <p className="text-sm text-muted-foreground">{deepDiveData.rationale}</p>
                )}
              </div>

              {/* D1 Elements */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <h4 className="font-medium">{d1Label} Elements ({deepDiveData.d1Items.length})</h4>
                </div>
                <div className="space-y-2">
                  {deepDiveData.d1Items.map((item) => (
                    <div key={item.id} className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.content.slice(0, 150)}...</p>
                    </div>
                  ))}
                  {deepDiveData.d1Items.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No {d1Label} elements linked to this concept</p>
                  )}
                </div>
              </div>

              {/* D2 Elements */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <h4 className="font-medium">{d2Label} Elements ({deepDiveData.d2Items.length})</h4>
                </div>
                <div className="space-y-2">
                  {deepDiveData.d2Items.map((item) => (
                    <div key={item.id} className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <p className="text-sm font-medium text-green-700 dark:text-green-300">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.content.slice(0, 150)}...</p>
                    </div>
                  ))}
                  {deepDiveData.d2Items.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">No {d2Label} elements linked to this concept</p>
                  )}
                </div>
              </div>

              {/* Deep Dive Chat Placeholder */}
              <div className="p-4 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/10">
                <div className="flex items-center gap-3 mb-3">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">Ask AI (Coming Soon)</span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Perform a deep dive fit/gap analysis between the {d1Label} and {d2Label} elements.
                  The AI will analyze specific gaps and provide recommendations.
                </p>
                <Button disabled className="w-full gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Start Deep Dive Analysis
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
