import { useMemo } from "react";
import { diffLines, Change } from "diff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  filePath: string;
}

export function DiffViewer({ oldContent, newContent, filePath }: DiffViewerProps) {
  const diff = useMemo(() => {
    return diffLines(oldContent || "", newContent || "");
  }, [oldContent, newContent]);

  const renderLine = (change: Change, index: number) => {
    const bgColor = change.added
      ? "bg-green-500/20"
      : change.removed
      ? "bg-red-500/20"
      : "bg-transparent";
    
    const textColor = change.added
      ? "text-green-300"
      : change.removed
      ? "text-red-300"
      : "text-muted-foreground";
    
    const prefix = change.added ? "+ " : change.removed ? "- " : "  ";

    return (
      <div key={index} className={`${bgColor} ${textColor} font-mono text-xs px-2 py-0.5`}>
        {change.value.split("\n").map((line, i) => (
          <div key={i}>
            {prefix}{line}
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="shrink-0">
        <CardTitle className="text-sm font-mono">{filePath}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="bg-[#1e1e1e] text-[#cccccc]">
            {diff.map((change, index) => renderLine(change, index))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
