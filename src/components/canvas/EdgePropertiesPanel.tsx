import { useState, useEffect } from "react";
import { Edge } from "reactflow";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

interface EdgePropertiesPanelProps {
  edge: Edge | null;
  onClose: () => void;
  onUpdate: (edgeId: string, updates: Partial<Edge>) => void;
  onDelete: (edgeId: string) => void;
}

export function EdgePropertiesPanel({
  edge,
  onClose,
  onUpdate,
  onDelete,
}: EdgePropertiesPanelProps) {
  const [label, setLabel] = useState("");
  const [lineType, setLineType] = useState("default");
  const [color, setColor] = useState("#64748b");
  const [thickness, setThickness] = useState(2);

  useEffect(() => {
    if (edge) {
      setLabel(edge.label as string || "");
      setLineType(edge.type || "default");
      setColor(edge.style?.stroke as string || "#64748b");
      setThickness((edge.style?.strokeWidth as number) || 2);
    }
  }, [edge]);

  if (!edge) return null;

  const handleUpdate = () => {
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
    <div className="w-80 bg-card border-l border-border h-full overflow-y-auto">
      <div className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
        <h3 className="font-semibold text-foreground">Edge Properties</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="edge-label">Label</Label>
          <Input
            id="edge-label"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              handleUpdate();
            }}
            placeholder="Enter edge label"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="line-type">Line Type</Label>
          <Select
            value={lineType}
            onValueChange={(value) => {
              setLineType(value);
              handleUpdate();
            }}
          >
            <SelectTrigger id="line-type">
              <SelectValue placeholder="Select line type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Straight</SelectItem>
              <SelectItem value="smoothstep">Smooth Step</SelectItem>
              <SelectItem value="step">Step</SelectItem>
              <SelectItem value="straight">Bezier</SelectItem>
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
              onChange={(e) => {
                setColor(e.target.value);
                handleUpdate();
              }}
              className="w-20 h-10"
            />
            <Input
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                handleUpdate();
              }}
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
            onValueChange={([value]) => {
              setThickness(value);
              handleUpdate();
            }}
            min={1}
            max={10}
            step={1}
            className="w-full"
          />
        </div>

        <div className="pt-4 border-t border-border">
          <Button
            variant="destructive"
            onClick={handleDelete}
            className="w-full"
          >
            Delete Edge
          </Button>
        </div>
      </div>
    </div>
  );
}
