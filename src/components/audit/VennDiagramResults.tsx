import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CircleDot,
  ChevronDown,
  Download,
  FileJson,
  FileSpreadsheet,
} from "lucide-react";
import { useState } from "react";
import type { Json } from "@/integrations/supabase/types";

interface VennItem {
  id: string;
  label: string;
  category: "unique_d1" | "aligned" | "unique_d2";
  criticality: "critical" | "major" | "minor" | "info";
  evidence?: string;
  sourceElement?: string;
  targetElement?: string;
}

interface VennResult {
  unique_to_d1: VennItem[];
  aligned: VennItem[];
  unique_to_d2: VennItem[];
  summary: {
    total_d1_coverage: number;
    total_d2_coverage: number;
    alignment_score: number;
  };
}

interface VennDiagramResultsProps {
  vennResult: Json | null;
  dataset1Label?: string;
  dataset2Label?: string;
}

export function VennDiagramResults({
  vennResult,
  dataset1Label = "Dataset 1",
  dataset2Label = "Dataset 2",
}: VennDiagramResultsProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["aligned"])
  );

  // Parse and validate venn result
  const result: VennResult | null = useMemo(() => {
    if (!vennResult) return null;
    try {
      const parsed = vennResult as unknown as VennResult;
      if (parsed.unique_to_d1 && parsed.aligned && parsed.unique_to_d2) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }, [vennResult]);

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

  const getCriticalityColor = (criticality: string) => {
    switch (criticality) {
      case "critical":
        return "text-red-500 bg-red-500/10";
      case "major":
        return "text-orange-500 bg-orange-500/10";
      case "minor":
        return "text-yellow-500 bg-yellow-500/10";
      default:
        return "text-blue-500 bg-blue-500/10";
    }
  };

  const getCriticalityBadge = (
    criticality: string
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

  const exportAsJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-venn-results.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsCsv = () => {
    if (!result) return;
    const rows = [
      ["Category", "ID", "Label", "Criticality", "Evidence"],
      ...result.unique_to_d1.map((item) => [
        `Unique to ${dataset1Label}`,
        item.id,
        item.label,
        item.criticality,
        item.evidence || "",
      ]),
      ...result.aligned.map((item) => [
        "Aligned",
        item.id,
        item.label,
        item.criticality,
        item.evidence || "",
      ]),
      ...result.unique_to_d2.map((item) => [
        `Unique to ${dataset2Label}`,
        item.id,
        item.label,
        item.criticality,
        item.evidence || "",
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-venn-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CircleDot className="h-5 w-5" />
            Venn Diagram Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            No results yet. Complete an audit to see the Venn diagram synthesis.
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderSection = (
    title: string,
    items: VennItem[],
    sectionKey: string,
    colorClass: string
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
            <span className="font-medium">{title}</span>
            <Badge variant="secondary">{items.length} items</Badge>
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
              No items in this category
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="border rounded-lg p-3 bg-card space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{item.label}</p>
                    {item.sourceElement && (
                      <p className="text-xs text-muted-foreground">
                        Source: {item.sourceElement}
                      </p>
                    )}
                  </div>
                  <Badge variant={getCriticalityBadge(item.criticality)}>
                    {item.criticality}
                  </Badge>
                </div>
                {item.evidence && (
                  <p className="text-xs text-muted-foreground border-t pt-2">
                    {item.evidence}
                  </p>
                )}
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
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CircleDot className="h-5 w-5" />
            Venn Diagram Results
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportAsJson}>
              <FileJson className="h-4 w-4 mr-1" />
              JSON
            </Button>
            <Button variant="outline" size="sm" onClick={exportAsCsv}>
              <FileSpreadsheet className="h-4 w-4 mr-1" />
              CSV
            </Button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="text-center p-3 rounded-lg bg-red-500/10">
            <div className="text-2xl font-bold text-red-500">
              {result.summary.total_d1_coverage}%
            </div>
            <div className="text-xs text-muted-foreground">
              {dataset1Label} Coverage
            </div>
          </div>
          <div className="text-center p-3 rounded-lg bg-green-500/10">
            <div className="text-2xl font-bold text-green-500">
              {result.summary.alignment_score}%
            </div>
            <div className="text-xs text-muted-foreground">Alignment Score</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-blue-500/10">
            <div className="text-2xl font-bold text-blue-500">
              {result.summary.total_d2_coverage}%
            </div>
            <div className="text-xs text-muted-foreground">
              {dataset2Label} Coverage
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full max-h-[600px]">
          <div className="divide-y">
            {renderSection(
              `Unique to ${dataset1Label}`,
              result.unique_to_d1,
              "unique_d1",
              "bg-red-500/5"
            )}
            {renderSection(
              "Aligned (Present in Both)",
              result.aligned,
              "aligned",
              "bg-green-500/5"
            )}
            {renderSection(
              `Unique to ${dataset2Label}`,
              result.unique_to_d2,
              "unique_d2",
              "bg-blue-500/5"
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
