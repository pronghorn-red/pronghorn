import { useState, useEffect } from "react";
import { X, Trash2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Node } from "reactflow";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface NodePropertiesPanelProps {
  node: Node | null;
  onClose: () => void;
  onUpdate: (nodeId: string, updates: Partial<Node>) => void;
  onDelete?: (nodeId: string) => void;
  projectId: string;
  isOpen: boolean;
  onToggle: () => void;
}

export function NodePropertiesPanel({ node, onClose, onUpdate, onDelete, projectId, isOpen, onToggle }: NodePropertiesPanelProps) {
  const [label, setLabel] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState<any[]>([]);
  const [standards, setStandards] = useState<any[]>([]);
  const [techStacks, setTechStacks] = useState<any[]>([]);

  useEffect(() => {
    if (node) {
      setLabel(node.data.label || "");
      setSubtitle(node.data.subtitle || "");
      setDescription(node.data.description || "");
      loadDropdownData();
    }
  }, [node?.id]);

  const loadDropdownData = async () => {
    if (!node) return;

    // CRITICAL: Load requirements via RPC with token for project data
    if (node.data.type === "REQUIREMENT") {
      // Get share token from URL
      const urlParams = new URLSearchParams(window.location.search);
      const shareToken = urlParams.get("token");
      
      if (shareToken) {
        const { data } = await supabase.rpc("get_requirements_with_token", {
          p_project_id: projectId,
          p_token: shareToken
        });
        setRequirements(data || []);
      }
    }

    // Standards table is not project-scoped, direct query allowed
    if (node.data.type === "STANDARD") {
      const { data } = await supabase
        .from("standards")
        .select("id, code, title")
        .order("code");
      setStandards(data || []);
    }

    // Tech stacks table is not project-scoped, direct query allowed
    if (node.data.type === "TECH_STACK") {
      const { data } = await supabase
        .from("tech_stacks")
        .select("id, name")
        .order("name");
      setTechStacks(data || []);
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

  const handleDelete = () => {
    if (!node || !onDelete) return;
    onDelete(node.id);
    onClose();
  };

  const handleRequirementChange = async (requirementId: string) => {
    if (!node) return;
    
    // Find requirement from already loaded list (no additional query needed)
    const requirement = requirements.find(r => r.id === requirementId);
    const newSubtitle = requirement ? `${requirement.code} - ${requirement.title}` : subtitle;
    
    onUpdate(node.id, {
      data: { 
        ...node.data, 
        requirementId,
        subtitle: newSubtitle
      },
    });
    setSubtitle(newSubtitle);
    toast.success("Requirement linked");
  };

  const handleStandardChange = async (standardId: string) => {
    if (!node) return;
    
    // Load the standard to get its label
    const { data } = await supabase
      .from("standards")
      .select("code, title")
      .eq("id", standardId)
      .single();
    
    const newSubtitle = data ? `${data.code} - ${data.title}` : subtitle;
    
    onUpdate(node.id, {
      data: { 
        ...node.data, 
        standardId,
        subtitle: newSubtitle
      },
    });
    setSubtitle(newSubtitle);
    toast.success("Standard linked");
  };

  const handleTechStackChange = async (techStackId: string) => {
    if (!node) return;
    
    // Load the tech stack to get its name
    const { data } = await supabase
      .from("tech_stacks")
      .select("name")
      .eq("id", techStackId)
      .single();
    
    const newSubtitle = data ? data.name : subtitle;
    
    onUpdate(node.id, {
      data: { 
        ...node.data, 
        techStackId,
        subtitle: newSubtitle
      },
    });
    setSubtitle(newSubtitle);
    toast.success("Tech stack linked");
  };

  if (!node) return null;

  if (!isOpen) {
    return (
      <div className="w-12 border-l border-border bg-card flex flex-col items-center py-4 h-full z-50 animate-slide-in-right">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-8 w-8"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col h-full z-50 animate-slide-in-right">
      <div className="p-4 border-b border-border flex items-center justify-between flex-shrink-0">
        <h3 className="font-semibold text-lg">Node Properties</h3>
        <Button variant="ghost" size="icon" onClick={onToggle}>
          <ChevronRight className="h-4 w-4" />
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
                <Label>Link to Requirement</Label>
                <Select
                  value={node.data.requirementId || ""}
                  onValueChange={handleRequirementChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a requirement..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {requirements.map((req) => (
                      <SelectItem key={req.id} value={req.id}>
                        {req.code} - {req.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
            </>
          )}

          {/* Select Standard - Only for STANDARD nodes */}
          {node.data.type === "STANDARD" && (
            <>
              <div className="space-y-3">
                <Label>Link to Standard</Label>
                <Select
                  value={node.data.standardId || ""}
                  onValueChange={handleStandardChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a standard..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {standards.map((std) => (
                      <SelectItem key={std.id} value={std.id}>
                        {std.code} - {std.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
            </>
          )}

          {/* Select Tech Stack - Only for TECH_STACK nodes */}
          {node.data.type === "TECH_STACK" && (
            <>
              <div className="space-y-3">
                <Label>Link to Tech Stack</Label>
                <Select
                  value={node.data.techStackId || ""}
                  onValueChange={handleTechStackChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a tech stack..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {techStacks.map((stack) => (
                      <SelectItem key={stack.id} value={stack.id}>
                        {stack.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

      <div className="p-4 border-t border-border space-y-2 flex-shrink-0">
        <Button onClick={handleSave} className="w-full">
          Save Changes
        </Button>
        {onDelete && (
          <Button onClick={handleDelete} variant="destructive" className="w-full">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Node
          </Button>
        )}
      </div>
    </div>
  );
}
