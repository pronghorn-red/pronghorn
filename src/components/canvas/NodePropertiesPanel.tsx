import { useState, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
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
import { LinkSelector } from "./LinkSelector";

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
  const [linkedTechStacks, setLinkedTechStacks] = useState<any[]>([]);

  useEffect(() => {
    if (node) {
      setLabel(node.data.label || "");
      setSubtitle(node.data.subtitle || "");
      setDescription(node.data.description || "");
      // Load linked items and auto-populate subtitle if needed
      loadLinkedItems();
    }
  }, [node?.id]); // Only re-run when node ID changes, not on every node update

  const loadLinkedItems = async () => {
    if (!node) return;

    let autoSubtitle = "";

    // Load linked standards
    if (node.data.standardIds && node.data.standardIds.length > 0) {
      const { data } = await supabase
        .from("standards")
        .select("id, code, title")
        .in("id", node.data.standardIds);
      setLinkedStandards(data || []);
    } else {
      setLinkedStandards([]);
    }

    // Load linked requirements
    if (node.data.requirementIds && node.data.requirementIds.length > 0) {
      const { data } = await supabase
        .from("requirements")
        .select("id, code, title")
        .in("id", node.data.requirementIds);
      setLinkedRequirements(data || []);
    } else {
      setLinkedRequirements([]);
    }

    // Load linked tech stacks
    if (node.data.techStackIds && node.data.techStackIds.length > 0) {
      const { data } = await supabase
        .from("tech_stacks")
        .select("id, name")
        .in("id", node.data.techStackIds);
      setLinkedTechStacks(data || []);
    } else {
      setLinkedTechStacks([]);
    }

    // For specific node types, load single linked item and auto-populate subtitle
    if (node.data.type === "REQUIREMENT" && node.data.requirementId) {
      const { data } = await supabase
        .from("requirements")
        .select("code, title")
        .eq("id", node.data.requirementId)
        .single();
      if (data) {
        autoSubtitle = `${data.code} - ${data.title}`;
      }
    } else if (node.data.type === "STANDARD" && node.data.standardId) {
      const { data } = await supabase
        .from("standards")
        .select("code, title")
        .eq("id", node.data.standardId)
        .single();
      if (data) {
        autoSubtitle = `${data.code} - ${data.title}`;
      }
    } else if (node.data.type === "TECH_STACK" && node.data.techStackId) {
      const { data } = await supabase
        .from("tech_stacks")
        .select("name")
        .eq("id", node.data.techStackId)
        .single();
      if (data) {
        autoSubtitle = data.name;
      }
    }

    // Auto-update subtitle if we have one and current subtitle is empty
    if (autoSubtitle && !subtitle) {
      setSubtitle(autoSubtitle);
      onUpdate(node.id, {
        data: {
          ...node.data,
          subtitle: autoSubtitle,
        },
      });
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
      data: { ...node.data, standardIds: newIds },
    });
    loadLinkedItems();
  };

  const handleUnlinkStandard = (standardId: string) => {
    if (!node) return;
    const currentIds = node.data.standardIds || [];
    const newIds = currentIds.filter((id: string) => id !== standardId);
    onUpdate(node.id, {
      data: { ...node.data, standardIds: newIds },
    });
    loadLinkedItems();
  };

  const handleLinkRequirement = async (requirementId: string) => {
    if (!node) return;
    const currentIds = node.data.requirementIds || [];
    const newIds = [...currentIds, requirementId];
    onUpdate(node.id, {
      data: { ...node.data, requirementIds: newIds },
    });
    loadLinkedItems();
  };

  const handleUnlinkRequirement = (requirementId: string) => {
    if (!node) return;
    const currentIds = node.data.requirementIds || [];
    const newIds = currentIds.filter((id: string) => id !== requirementId);
    onUpdate(node.id, {
      data: { ...node.data, requirementIds: newIds },
    });
    loadLinkedItems();
  };

  const handleLinkTechStack = async (techStackId: string) => {
    if (!node) return;
    const currentIds = node.data.techStackIds || [];
    const newIds = [...currentIds, techStackId];
    onUpdate(node.id, {
      data: { ...node.data, techStackIds: newIds },
    });
    loadLinkedItems();
  };

  const handleUnlinkTechStack = (techStackId: string) => {
    if (!node) return;
    const currentIds = node.data.techStackIds || [];
    const newIds = currentIds.filter((id: string) => id !== techStackId);
    onUpdate(node.id, {
      data: { ...node.data, techStackIds: newIds },
    });
    loadLinkedItems();
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

          {/* Select Requirement - Only for REQUIREMENT nodes */}
          {node.data.type === "REQUIREMENT" && (
            <>
              <div className="space-y-3">
                <Label>Select Requirement</Label>
                <LinkSelector
                  type="requirement"
                  projectId={projectId}
                  selectedIds={node.data.requirementId ? [node.data.requirementId] : []}
                  onSelect={(id) => {
                    onUpdate(node.id, {
                      data: { ...node.data, requirementId: id }
                    });
                    loadLinkedItems();
                  }}
                  onUnselect={() => {
                    onUpdate(node.id, {
                      data: { ...node.data, requirementId: null }
                    });
                    loadLinkedItems();
                  }}
                />
              </div>
              <Separator />
            </>
          )}

          {/* Select Standard - Only for STANDARD nodes */}
          {node.data.type === "STANDARD" && (
            <>
              <div className="space-y-3">
                <Label>Select Standard</Label>
                <LinkSelector
                  type="standard"
                  selectedIds={node.data.standardId ? [node.data.standardId] : []}
                  onSelect={(id) => {
                    onUpdate(node.id, {
                      data: { ...node.data, standardId: id }
                    });
                    loadLinkedItems();
                  }}
                  onUnselect={() => {
                    onUpdate(node.id, {
                      data: { ...node.data, standardId: null }
                    });
                    loadLinkedItems();
                  }}
                />
              </div>
              <Separator />
            </>
          )}

          {/* Select Tech Stack - Only for TECH_STACK nodes */}
          {node.data.type === "TECH_STACK" && (
            <>
              <div className="space-y-3">
                <Label>Select Tech Stack</Label>
                <LinkSelector
                  type="tech_stack"
                  selectedIds={node.data.techStackId ? [node.data.techStackId] : []}
                  onSelect={(id) => {
                    onUpdate(node.id, {
                      data: { ...node.data, techStackId: id }
                    });
                    loadLinkedItems();
                  }}
                  onUnselect={() => {
                    onUpdate(node.id, {
                      data: { ...node.data, techStackId: null }
                    });
                    loadLinkedItems();
                  }}
                />
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
