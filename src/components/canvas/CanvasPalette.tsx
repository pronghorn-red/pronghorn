import { NodeType } from "./NodePalette";
import { Eye, EyeOff, ChevronLeft, ChevronRight, Menu } from "lucide-react";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LayersManager } from "./LayersManager";
import { Layer } from "@/hooks/useRealtimeLayers";
import { Node } from "reactflow";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const nodeIcons: Record<NodeType, string> = {
  PROJECT: "🎯",
  PAGE: "📄",
  COMPONENT: "⚛️",
  API: "🔌",
  DATABASE: "🗄️",
  SERVICE: "⚙️",
  WEBHOOK: "🪝",
  FIREWALL: "🛡️",
  SECURITY: "🔒",
  REQUIREMENT: "📋",
  STANDARD: "📏",
  TECH_STACK: "🔧",
};

const nodeLabels: Record<NodeType, string> = {
  PROJECT: "Project",
  PAGE: "Page",
  COMPONENT: "Component",
  API: "API",
  DATABASE: "Database",
  SERVICE: "Service",
  WEBHOOK: "Webhook",
  FIREWALL: "Firewall",
  SECURITY: "Security",
  REQUIREMENT: "Requirement",
  STANDARD: "Standard",
  TECH_STACK: "Tech Stack",
};

interface CanvasPaletteProps {
  visibleNodeTypes: Set<NodeType>;
  onToggleVisibility: (type: NodeType) => void;
  onNodeClick?: (type: NodeType) => void;
  layers: Layer[];
  selectedNodes: Node[];
  onSaveLayer: (layer: Partial<Layer> & { id: string }) => void;
  onDeleteLayer: (layerId: string) => void;
  onSelectLayer: (nodeIds: string[]) => void;
  activeLayerId: string | null;
  onSetActiveLayer: (layerId: string | null) => void;
  onMenuClick: () => void;
}

export function CanvasPalette({
  visibleNodeTypes,
  onToggleVisibility,
  onNodeClick,
  layers,
  selectedNodes,
  onSaveLayer,
  onDeleteLayer,
  onSelectLayer,
  activeLayerId,
  onSetActiveLayer,
  onMenuClick,
}: CanvasPaletteProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const onDragStart = (event: React.DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleNodeClick = (e: React.MouseEvent, type: NodeType) => {
    // Only trigger click-to-add on mobile/touch devices
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      e.preventDefault();
      onNodeClick?.(type);
    }
  };

  const nodeTypes: NodeType[] = [
    "PROJECT",
    "PAGE",
    "COMPONENT",
    "API",
    "DATABASE",
    "SERVICE",
    "WEBHOOK",
    "FIREWALL",
    "SECURITY",
    "REQUIREMENT",
    "STANDARD",
    "TECH_STACK",
  ];

  if (isCollapsed) {
    return (
      <div className="w-12 border-r border-border bg-card flex flex-col items-center py-4 h-full animate-slide-in-left">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="h-8 w-8"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const handleToggleAllLayers = () => {
    const allVisible = layers.every((layer) => layer.visible);
    layers.forEach((layer) => {
      onSaveLayer({ ...layer, visible: !allVisible });
    });
  };

  return (
    <div className="w-80 border-r border-border bg-card flex flex-col h-full overflow-hidden animate-slide-in-left">
      <div className="p-4 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="h-8 w-8"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <h3 className="text-sm font-semibold">Canvas Palette</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(true)}
          className="h-8 w-8"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="p-4">
          <Accordion type="multiple" defaultValue={["nodes", "layers"]} className="space-y-2">
          <AccordionItem value="nodes" className="border rounded-lg px-3">
            <AccordionTrigger className="text-sm py-2 hover:no-underline">
              Node Types
            </AccordionTrigger>
            <AccordionContent className="space-y-1 pb-2">
              {nodeTypes.map((type) => (
                <div
                  key={type}
                  className="flex items-center justify-between gap-2 group"
                >
                  <div
                    draggable
                    onDragStart={(e) => onDragStart(e, type)}
                    onClick={(e) => handleNodeClick(e, type)}
                    className={`flex items-center gap-2 px-3 py-2 rounded cursor-move flex-1 transition-colors ${
                      visibleNodeTypes.has(type)
                        ? "bg-muted hover:bg-muted/80"
                        : "bg-muted/30 hover:bg-muted/50 opacity-50"
                    }`}
                  >
                    <span className="text-base">{nodeIcons[type]}</span>
                    <span className="text-xs font-medium">{nodeLabels[type]}</span>
                  </div>
                  <button
                    onClick={() => onToggleVisibility(type)}
                    className={`p-1 rounded transition-colors ${
                      visibleNodeTypes.has(type)
                        ? "text-foreground hover:text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title={visibleNodeTypes.has(type) ? "Hide" : "Show"}
                  >
                    {visibleNodeTypes.has(type) ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="layers" className="border rounded-lg px-3">
            <AccordionTrigger className="text-sm py-2 hover:no-underline">
              <div className="flex items-center justify-between w-full pr-2">
                <span>Layers</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1 h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleAllLayers();
                  }}
                  title="Toggle all layers visibility"
                >
                  {layers.every((l) => l.visible) ? (
                    <Eye className="w-3 h-3" />
                  ) : (
                    <EyeOff className="w-3 h-3" />
                  )}
                </Button>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-2">
              <LayersManager
                layers={layers}
                selectedNodes={selectedNodes}
                onSaveLayer={onSaveLayer}
                onDeleteLayer={onDeleteLayer}
                onSelectLayer={onSelectLayer}
                activeLayerId={activeLayerId}
                onSetActiveLayer={onSetActiveLayer}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        </div>
      </ScrollArea>
    </div>
  );
}
