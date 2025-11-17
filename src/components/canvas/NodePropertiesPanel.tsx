import { useState, useEffect } from "react";
import { X, Link2, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Node } from "reactflow";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface NodePropertiesPanelProps {
  node: Node | null;
  onClose: () => void;
  onUpdate: (nodeId: string, updates: Partial<Node>) => void;
  projectId: string;
}

export function NodePropertiesPanel({ node, onClose, onUpdate, projectId }: NodePropertiesPanelProps) {
  const [label, setLabel] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [linkedStandards, setLinkedStandards] = useState<any[]>([]);
  const [linkedRequirements, setLinkedRequirements] = useState<any[]>([]);
  const [showLinkDialog, setShowLinkDialog] = useState(false);

  useEffect(() => {
    if (node) {
      setLabel(node.data.label || "");
      setSubtitle(node.data.subtitle || "");
      setDescription(node.data.description || "");
      loadLinkedItems();
    }
  }, [node]);

  const loadLinkedItems = async () => {
    if (!node) return;

    // Load linked standards
    if (node.data.standardIds) {
      const { data } = await supabase
        .from("standards")
        .select("id, code, title")
        .in("id", node.data.standardIds);
      setLinkedStandards(data || []);
    }

    // Load linked requirements
    if (node.data.requirementIds) {
      const { data } = await supabase
        .from("requirements")
        .select("id, code, title")
        .in("id", node.data.requirementIds);
      setLinkedRequirements(data || []);
    }
  };

  const handleSave = () => {
    if (!node) return;

    onUpdate(node.id, {
      data: {
        ...node.data,
        label,
        subtitle,
        description,
      },
    });
    toast.success("Node updated");
  };

  const handleLinkStandard = async (standardId: string) => {
    if (!node) return;

    const currentIds = node.data.standardIds || [];
    const newIds = [...currentIds, standardId];

    onUpdate(node.id, {
      data: {
        ...node.data,
        standardIds: newIds,
      },
    });

    loadLinkedItems();
    toast.success("Standard linked");
  };

  const handleUnlinkStandard = (standardId: string) => {
    if (!node) return;

    const currentIds = node.data.standardIds || [];
    const newIds = currentIds.filter((id: string) => id !== standardId);

    onUpdate(node.id, {
      data: {
        ...node.data,
        standardIds: newIds,
      },
    });

    loadLinkedItems();
    toast.success("Standard unlinked");
  };

  if (!node) return null;

  return (
    <div className="w-80 border-l border-border bg-card h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-lg">Node Properties</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="node-label">Name</Label>
              <Input
                id="node-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Node name"
              />
            </div>

            <div>
              <Label htmlFor="node-subtitle">Subtitle</Label>
              <Input
                id="node-subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Node subtitle"
              />
            </div>

            <div>
              <Label htmlFor="node-description">Description</Label>
              <Textarea
                id="node-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Node description"
                rows={4}
              />
            </div>

            <div>
              <Label>Type</Label>
              <Badge variant="outline" className="mt-1">
                {node.data.type}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Linked Standards */}
          {(node.data.type === "REQUIREMENT" || node.data.type === "STANDARD") && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Linked Standards</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLinkDialog(true)}
                  >
                    <Link2 className="h-3 w-3 mr-1" />
                    Link
                  </Button>
                </div>

                {linkedStandards.length > 0 ? (
                  <div className="space-y-2">
                    {linkedStandards.map((standard) => (
                      <div
                        key={standard.id}
                        className="flex items-center justify-between p-2 rounded-lg border border-border bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-3 w-3" />
                          <div>
                            <div className="text-xs font-medium">{standard.code}</div>
                            <div className="text-xs text-muted-foreground">
                              {standard.title}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleUnlinkStandard(standard.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No standards linked</p>
                )}
              </div>

              <Separator />
            </>
          )}

          {/* Node Info */}
          <div className="space-y-2 text-xs text-muted-foreground">
            <div>
              <span className="font-medium">Node ID:</span> {node.id}
            </div>
            <div>
              <span className="font-medium">Position:</span> ({Math.round(node.position.x)}, {Math.round(node.position.y)})
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border">
        <Button onClick={handleSave} className="w-full">
          Save Changes
        </Button>
      </div>
    </div>
  );
}
