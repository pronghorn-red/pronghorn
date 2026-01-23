import { Eye, EyeOff, ChevronLeft, ChevronRight, Menu, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { LayersManager } from "./LayersManager";
import { CanvasNavigator } from "./CanvasNavigator";
import { Layer } from "@/hooks/useRealtimeLayers";
import { ProjectCanvas } from "@/hooks/useProjectCanvases";
import { Node } from "reactflow";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNodeTypes, CanvasNodeType, groupByCategory } from "@/hooks/useNodeTypes";
import { getCategoryLabel, getCategoryOrder } from "@/lib/connectionLogic";

interface CanvasPaletteProps {
  visibleNodeTypes: Set<string>;
  onToggleVisibility: (type: string) => void;
  onNodeClick?: (type: string) => void;
  layers: Layer[];
  selectedNodes: Node[];
  onSaveLayer: (layer: Partial<Layer> & { id: string }) => void;
  onDeleteLayer: (layerId: string) => void;
  onSelectLayer: (nodeIds: string[]) => void;
  activeLayerId: string | null;
  onSetActiveLayer: (layerId: string | null) => void;
  onMenuClick: () => void;
  // Multi-canvas props
  canvases: ProjectCanvas[];
  activeCanvas: ProjectCanvas | null;
  activeCanvasId: string | null;
  isLegacyMode: boolean;
  onSelectCanvas: (canvasId: string) => void;
  onPreviousCanvas: () => void;
  onNextCanvas: () => void;
  onCreateCanvas: (name: string, description?: string, tags?: string[]) => void;
  onUpdateCanvas: (canvas: Partial<ProjectCanvas> & { id: string }) => void;
  onDeleteCanvas: (canvasId: string) => void;
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
  // Multi-canvas props
  canvases,
  activeCanvas,
  activeCanvasId,
  isLegacyMode,
  onSelectCanvas,
  onPreviousCanvas,
  onNextCanvas,
  onCreateCanvas,
  onUpdateCanvas,
  onDeleteCanvas,
}: CanvasPaletteProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Fetch node types from database (exclude legacy types for palette)
  const { data: nodeTypes, isLoading } = useNodeTypes(false);
  
  // Group node types by category
  const groupedNodeTypes = useMemo(() => {
    if (!nodeTypes) return {};
    return groupByCategory(nodeTypes);
  }, [nodeTypes]);
  
  // Get ordered categories
  const categoryOrder = getCategoryOrder();

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleNodeClick = (e: React.MouseEvent, type: string) => {
    // Only trigger click-to-add on mobile/touch devices
    if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
      e.preventDefault();
      onNodeClick?.(type);
    }
  };

  const allNodeTypeNames = useMemo(() => {
    return nodeTypes?.map(nt => nt.system_name) || [];
  }, [nodeTypes]);

  const handleToggleAllNodeTypes = () => {
    const allVisible = allNodeTypeNames.every((type) => visibleNodeTypes.has(type));
    allNodeTypeNames.forEach((type) => {
      if (allVisible && visibleNodeTypes.has(type)) {
        onToggleVisibility(type);
      } else if (!allVisible && !visibleNodeTypes.has(type)) {
        onToggleVisibility(type);
      }
    });
  };

  const handleToggleAllLayers = () => {
    const allVisible = layers.every((layer) => layer.visible);
    layers.forEach((layer) => {
      onSaveLayer({ ...layer, visible: !allVisible });
    });
  };

  return (
    <div
      className={`border-r border-border bg-card flex flex-col h-full overflow-hidden transition-all duration-300 ${isCollapsed ? "w-12" : "w-80"}`}
    >
      {isCollapsed ? (
        <div className="flex flex-col items-center py-4 h-full">
          <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <div className="p-2 border-b border-border flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={onMenuClick} className="h-8 w-8" aria-label="Open menu">
                <Menu className="h-4 w-4" />
              </Button>
              <h3 className="text-sm font-semibold">Canvas Palette</h3>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(true)} className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>

          {/* Canvas Navigator */}
          <CanvasNavigator
            canvases={canvases}
            activeCanvas={activeCanvas}
            activeCanvasId={activeCanvasId}
            isLegacyMode={isLegacyMode}
            onSelectCanvas={onSelectCanvas}
            onPrevious={onPreviousCanvas}
            onNext={onNextCanvas}
            onCreateCanvas={onCreateCanvas}
            onUpdateCanvas={onUpdateCanvas}
            onDeleteCanvas={onDeleteCanvas}
          />

          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Accordion type="multiple" defaultValue={["nodes", "layers"]} className="space-y-2">
                  <AccordionItem value="nodes" className="border rounded-lg px-3">
                    <AccordionTrigger className="text-sm py-2 hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-2">
                        <span>Node Types</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-1 h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleAllNodeTypes();
                          }}
                          title="Toggle all node types visibility"
                        >
                          {allNodeTypeNames.every((type) => visibleNodeTypes.has(type)) ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        </Button>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pb-2">
                      {categoryOrder.map((category) => {
                        const categoryNodes = groupedNodeTypes[category];
                        if (!categoryNodes || categoryNodes.length === 0) return null;
                        
                        return (
                          <div key={category} className="space-y-1">
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                              {getCategoryLabel(category)}
                            </div>
                            {categoryNodes.map((nodeType: CanvasNodeType) => (
                              <div key={nodeType.system_name} className="flex items-center justify-between gap-2 group">
                                <div
                                  draggable
                                  onDragStart={(e) => onDragStart(e, nodeType.system_name)}
                                  onClick={(e) => handleNodeClick(e, nodeType.system_name)}
                                  className={`flex items-center gap-2 px-3 py-2 rounded cursor-move flex-1 transition-colors ${
                                    visibleNodeTypes.has(nodeType.system_name)
                                      ? "bg-muted hover:bg-muted/80"
                                      : "bg-muted/30 hover:bg-muted/50 opacity-50"
                                  }`}
                                  title={nodeType.description || nodeType.display_label}
                                >
                                  <span className="text-base">{nodeType.emoji || '📦'}</span>
                                  <span className="text-xs font-medium">{nodeType.display_label}</span>
                                </div>
                                <button
                                  onClick={() => onToggleVisibility(nodeType.system_name)}
                                  className={`p-1 rounded transition-colors ${
                                    visibleNodeTypes.has(nodeType.system_name)
                                      ? "text-foreground hover:text-primary"
                                      : "text-muted-foreground hover:text-foreground"
                                  }`}
                                  title={visibleNodeTypes.has(nodeType.system_name) ? "Hide" : "Show"}
                                >
                                  {visibleNodeTypes.has(nodeType.system_name) ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                </button>
                              </div>
                            ))}
                          </div>
                        );
                      })}
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
                          {layers.every((l) => l.visible) ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
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
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
