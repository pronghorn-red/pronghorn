import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Target,
  ChevronDown,
  FileJson,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from "lucide-react";

interface TesseractCell {
  id: string;
  conceptLabel: string;
  conceptDescription?: string;
  polarity: number;
  rationale: string;
  d1ElementIds?: string[];
  d2ElementIds?: string[];
}

interface FitGapResultsProps {
  tesseractCells: TesseractCell[];
  datasetLabel?: string;
}

interface CategorizedConcept {
  id: string;
  label: string;
  description: string;
  polarity: number;
  rationale: string;
  category: "strong_fit" | "partial_fit" | "gap";
}

export function FitGapResults({
  tesseractCells,
  datasetLabel = "Dataset",
}: FitGapResultsProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["gap"]) // Expand gaps by default as they need attention
  );

  // Categorize cells by polarity into Strong Fit, Partial Fit, Gap
  const categorized = useMemo(() => {
    const strongFit: CategorizedConcept[] = [];
    const partialFit: CategorizedConcept[] = [];
    const gap: CategorizedConcept[] = [];

    for (const cell of tesseractCells) {
      const concept: CategorizedConcept = {
        id: cell.id,
        label: cell.conceptLabel,
        description: cell.conceptDescription || "",
        polarity: cell.polarity,
        rationale: cell.rationale,
        category: cell.polarity >= 0.7 ? "strong_fit" : cell.polarity >= 0.3 ? "partial_fit" : "gap",
      };

      if (cell.polarity >= 0.7) {
        strongFit.push(concept);
      } else if (cell.polarity >= 0.3) {
        partialFit.push(concept);
      } else {
        gap.push(concept);
      }
    }

    // Sort each category by polarity (highest first for fits, lowest first for gaps)
    strongFit.sort((a, b) => b.polarity - a.polarity);
    partialFit.sort((a, b) => b.polarity - a.polarity);
    gap.sort((a, b) => a.polarity - b.polarity);

    return { strongFit, partialFit, gap };
  }, [tesseractCells]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const total = tesseractCells.length;
    if (total === 0) {
      return { avgPolarity: 0, strongFitPct: 0, partialFitPct: 0, gapPct: 0, total: 0 };
    }

    const avgPolarity = tesseractCells.reduce((sum, c) => sum + c.polarity, 0) / total;
    const strongFitPct = (categorized.strongFit.length / total) * 100;
    const partialFitPct = (categorized.partialFit.length / total) * 100;
    const gapPct = (categorized.gap.length / total) * 100;

    return { avgPolarity, strongFitPct, partialFitPct, gapPct, total };
  }, [tesseractCells, categorized]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const exportAsJson = () => {
    const data = {
      summary: {
        totalConcepts: summary.total,
        averagePolarity: summary.avgPolarity,
        strongFitCount: categorized.strongFit.length,
        partialFitCount: categorized.partialFit.length,
        gapCount: categorized.gap.length,
      },
      strongFit: categorized.strongFit,
      partialFit: categorized.partialFit,
      gaps: categorized.gap,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-fit-gap-results.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsCsv = () => {
    const rows = [
      ["Category", "Concept", "Polarity", "Rationale"],
      ...categorized.strongFit.map((c) => [
        "Strong Fit",
        c.label,
        c.polarity.toFixed(2),
        c.rationale.replace(/"/g, '""'),
      ]),
      ...categorized.partialFit.map((c) => [
        "Partial Fit",
        c.label,
        c.polarity.toFixed(2),
        c.rationale.replace(/"/g, '""'),
      ]),
      ...categorized.gap.map((c) => [
        "Gap",
        c.label,
        c.polarity.toFixed(2),
        c.rationale.replace(/"/g, '""'),
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-fit-gap-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (tesseractCells.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Coverage Analysis Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            No results yet. Complete a coverage audit to see the fit/gap analysis.
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderSection = (
    title: string,
    items: CategorizedConcept[],
    sectionKey: string,
    colorClass: string,
    Icon: React.ElementType
  ) => (
    <Collapsible
      open={expandedSections.has(sectionKey)}
      onOpenChange={() => toggleSection(sectionKey)}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className={`w-full justify-between p-4 h-auto ${colorClass} hover:opacity-80`}
        >
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            <span className="font-medium">{title}</span>
            <Badge variant="secondary">{items.length} concepts</Badge>
          </div>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              expandedSections.has(sectionKey) ? "rotate-180" : ""
            }`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-4 pt-0 space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No concepts in this category
            </p>
          ) : (
            items.map((concept) => (
              <div
                key={concept.id}
                className="border rounded-lg p-3 bg-card space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{concept.label}</p>
                    {concept.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {concept.description}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={
                      concept.polarity >= 0.7
                        ? "default"
                        : concept.polarity >= 0.3
                        ? "secondary"
                        : "destructive"
                    }
                  >
                    {(concept.polarity * 100).toFixed(0)}%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground border-t pt-2">
                  {concept.rationale}
                </p>
              </div>
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3">
          {/* Title row */}
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Coverage Analysis: {datasetLabel}
          </CardTitle>

          {/* Export buttons row */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportAsJson}>
              <FileJson className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">JSON</span>
            </Button>
            <Button variant="outline" size="sm" onClick={exportAsCsv}>
              <FileSpreadsheet className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4 mt-4">
          <div className="text-center p-2 sm:p-3 rounded-lg bg-muted/50">
            <div className="text-lg sm:text-2xl font-bold">
              {(summary.avgPolarity * 100).toFixed(0)}%
            </div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">
              Avg Coverage
            </div>
          </div>
          <div className="text-center p-2 sm:p-3 rounded-lg bg-green-500/10">
            <div className="text-lg sm:text-2xl font-bold text-green-500">
              {summary.strongFitPct.toFixed(0)}%
            </div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Strong Fit</div>
          </div>
          <div className="text-center p-2 sm:p-3 rounded-lg bg-yellow-500/10">
            <div className="text-lg sm:text-2xl font-bold text-yellow-500">
              {summary.partialFitPct.toFixed(0)}%
            </div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Partial</div>
          </div>
          <div className="text-center p-2 sm:p-3 rounded-lg bg-red-500/10">
            <div className="text-lg sm:text-2xl font-bold text-red-500">
              {summary.gapPct.toFixed(0)}%
            </div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">Gaps</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="divide-y">
          {renderSection(
            "Strong Fit (≥70%)",
            categorized.strongFit,
            "strong_fit",
            "bg-green-500/5",
            CheckCircle2
          )}
          {renderSection(
            "Partial Fit (30-70%)",
            categorized.partialFit,
            "partial_fit",
            "bg-yellow-500/5",
            AlertCircle
          )}
          {renderSection(
            "Gaps (<30%)",
            categorized.gap,
            "gap",
            "bg-red-500/5",
            XCircle
          )}
        </div>
      </CardContent>
    </Card>
  );
}
