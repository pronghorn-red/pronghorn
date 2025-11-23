import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

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
        setArtifacts(data);
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

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading artifacts...</div>;
  }

  if (artifacts.length === 0) {
    return <div className="text-sm text-muted-foreground">No artifacts in this project.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleSelectAll}>
          Select All
        </Button>
        <Button variant="outline" size="sm" onClick={handleSelectNone}>
          Select None
        </Button>
      </div>
      <div className="space-y-2">
        {artifacts.map((artifact) => (
          <div
            key={artifact.id}
            className="flex items-start gap-2 p-2 hover:bg-muted/50 rounded"
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
              <div className="font-medium">
                {artifact.ai_title || "Untitled Artifact"}
              </div>
              <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                {artifact.content.substring(0, 150)}...
              </div>
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}
