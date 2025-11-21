import { useState, useEffect } from "react";
import { Edge } from "reactflow";
import { X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EdgePropertiesPanelProps {
  edge: Edge | null;
  onClose: () => void;
  onUpdate: (edgeId: string, updates: Partial<Edge>) => void;
  onVisualUpdate: (edgeId: string, updates: Partial<Edge>) => void;
  onDelete: (edgeId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function EdgePropertiesPanel({
  edge,
  onClose,
  onUpdate,
  onVisualUpdate,
  onDelete,
  isOpen,
  onToggle,
}: EdgePropertiesPanelProps) {
  const [label, setLabel] = useState("");
  const [lineType, setLineType] = useState("default");
  const [color, setColor] = useState("#64748b");
  const [thickness, setThickness] = useState(2);

  useEffect(() => {
    if (edge) {
      setLabel((edge.label as string) || "");
      // Default to React Flow's default edge type (Bezier) when not explicitly set
      setLineType(edge.type || "default");
      setColor((edge.style?.stroke as string) || "#64748b");
      setThickness((edge.style?.strokeWidth as number) || 2);
    }
  }, [edge]);

  if (!edge) return null;

  if (!isOpen) {
    return (
      <div className="w-12 border-l border-border bg-card flex flex-col items-center py-4 h-full">
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

  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel);
    onVisualUpdate(edge.id, { label: newLabel });
  };

  const handleLineTypeChange = (newType: string) => {
    setLineType(newType);
    onVisualUpdate(edge.id, { type: newType });
  };

  const handleColorChange = (newColor: string) => {
    setColor(newColor);
    onVisualUpdate(edge.id, {
      style: {
        ...edge.style,
        stroke: newColor,
        strokeWidth: thickness,
      },
    });
  };

  const handleThicknessChange = (newThickness: number) => {
    setThickness(newThickness);
    onVisualUpdate(edge.id, {
      style: {
        ...edge.style,
        stroke: color,
        strokeWidth: newThickness,
      },
    });
  };

  const handleSave = () => {
    onUpdate(edge.id, {
      label,
      type: lineType,
      style: {
        ...edge.style,
        stroke: color,
        strokeWidth: thickness,
      },
    });
  };

  const handleDelete = () => {
    onDelete(edge.id);
    onClose();
  };

  return (
    <div className="w-80 bg-card border-l border-border flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between flex-shrink-0">
        <h3 className="font-semibold text-foreground">Edge Properties</h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onToggle}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="edge-label">Label</Label>
          <Input
            id="edge-label"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="Enter edge label"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="line-type">Line Type</Label>
          <Select
            value={lineType}
            onValueChange={handleLineTypeChange}
          >
            <SelectTrigger id="line-type">
              <SelectValue placeholder="Select line type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="straight">Straight</SelectItem>
              <SelectItem value="default">Bezier</SelectItem>
              <SelectItem value="smoothstep">Smooth Step</SelectItem>
              <SelectItem value="step">Step</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edge-color">Color</Label>
          <div className="flex gap-2">
            <Input
              id="edge-color"
              type="color"
              value={color}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-20 h-10"
            />
            <Input
              value={color}
              onChange={(e) => handleColorChange(e.target.value)}
              placeholder="#000000"
              className="flex-1"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edge-thickness">Thickness: {thickness}px</Label>
          <Slider
            id="edge-thickness"
            value={[thickness]}
            onValueChange={([value]) => handleThicknessChange(value)}
            min={1}
            max={10}
            step={1}
            className="w-full"
          />
        </div>
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border space-y-2 flex-shrink-0">
        <Button
          onClick={handleSave}
          className="w-full"
        >
          Save Edge
        </Button>
        <Button
          variant="destructive"
          onClick={handleDelete}
          className="w-full"
        >
          Delete Edge
        </Button>
      </div>
    </div>
  );
}
