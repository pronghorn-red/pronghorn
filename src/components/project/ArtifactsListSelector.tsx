import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Artifact {
  id: string;
  ai_title: string | null;
  content: string;
  created_at: string;
}

interface ArtifactsListSelectorProps {
  projectId: string;
  shareToken: string | null;
  selectedArtifacts: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
}

const formatSize = (chars: number): string => {
  if (chars >= 1000000) return `${(chars / 1000000).toFixed(1)}M`;
  if (chars >= 1000) return `${(chars / 1000).toFixed(1)}K`;
  return `${chars}`;
};

const getSizeClass = (chars: number): { class: string; warning: boolean } => {
  if (chars >= 200000) return { class: "bg-destructive text-destructive-foreground", warning: true };
  if (chars >= 100000) return { class: "bg-orange-500 text-white", warning: true };
  if (chars >= 50000) return { class: "bg-yellow-500 text-black", warning: false };
  return { class: "bg-muted text-muted-foreground", warning: false };
};

export function ArtifactsListSelector({
  projectId,
  shareToken,
  selectedArtifacts,
  onSelectionChange
}: ArtifactsListSelectorProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadArtifacts();
  }, [projectId]);

  const loadArtifacts = async () => {
    try {
      const { data } = await supabase.rpc("get_artifacts_with_token", {
        p_project_id: projectId,
        p_token: shareToken
      });

      if (data) {
        // Sort by size descending so largest are at top
        const sorted = [...data].sort((a, b) => 
          (b.content?.length || 0) - (a.content?.length || 0)
        );
        setArtifacts(sorted);
      }
    } catch (error) {
      console.error("Error loading artifacts:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleArtifact = (id: string) => {
    const newSelected = new Set(selectedArtifacts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    onSelectionChange(newSelected);
  };

  const handleSelectAll = () => {
    onSelectionChange(new Set(artifacts.map(a => a.id)));
  };

  const handleSelectNone = () => {
    onSelectionChange(new Set());
  };

  // Select only items under 100K chars
  const handleSelectSmall = () => {
    const smallItems = artifacts.filter(a => (a.content?.length || 0) < 100000);
    onSelectionChange(new Set(smallItems.map(a => a.id)));
  };

  const totalSelectedChars = artifacts
    .filter(a => selectedArtifacts.has(a.id))
    .reduce((sum, a) => sum + (a.content?.length || 0), 0);

  const largeItemCount = artifacts.filter(a => (a.content?.length || 0) >= 100000).length;

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading artifacts...</div>;
  }

  if (artifacts.length === 0) {
    return <div className="text-sm text-muted-foreground">No artifacts in this project.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Button variant="outline" size="sm" onClick={handleSelectAll}>
          Select All
        </Button>
        <Button variant="outline" size="sm" onClick={handleSelectNone}>
          Select None
        </Button>
        {largeItemCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleSelectSmall}>
            Select &lt;100K only
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          Selected: {formatSize(totalSelectedChars)} chars
        </span>
      </div>
      
      {largeItemCount > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-orange-500/10 border border-orange-500/20 text-sm">
          <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />
          <span className="text-orange-600 dark:text-orange-400">
            {largeItemCount} large artifact{largeItemCount > 1 ? 's' : ''} detected. Items over 100K chars may cause timeouts.
          </span>
        </div>
      )}

      <div className="space-y-2">
        {artifacts.map((artifact) => {
          const charCount = artifact.content?.length || 0;
          const sizeInfo = getSizeClass(charCount);
          
          return (
            <div
              key={artifact.id}
              className={cn(
                "flex items-start gap-2 p-2 hover:bg-muted/50 rounded border",
                sizeInfo.warning && "border-orange-500/30"
              )}
            >
              <Checkbox
                id={`artifact-${artifact.id}`}
                checked={selectedArtifacts.has(artifact.id)}
                onCheckedChange={() => toggleArtifact(artifact.id)}
              />
              <Label
                htmlFor={`artifact-${artifact.id}`}
                className="text-sm cursor-pointer flex-1"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {artifact.ai_title || "Untitled Artifact"}
                  </span>
                  <Badge variant="secondary" className={cn("text-xs", sizeInfo.class)}>
                    {formatSize(charCount)}
                  </Badge>
                  {sizeInfo.warning && (
                    <AlertTriangle className="h-3 w-3 text-orange-500" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                  {artifact.content.substring(0, 150)}...
                </div>
              </Label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
