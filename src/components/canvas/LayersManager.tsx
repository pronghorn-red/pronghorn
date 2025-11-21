import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Trash2, Plus, Edit2, Check, X, Circle, CheckCircle2 } from "lucide-react";
import { Layer } from "@/hooks/useRealtimeLayers";
import { Node } from "reactflow";

interface LayersManagerProps {
  layers: Layer[];
  selectedNodes: Node[];
  onSaveLayer: (layer: Partial<Layer> & { id: string }) => void;
  onDeleteLayer: (layerId: string) => void;
  onSelectLayer: (nodeIds: string[]) => void;
  activeLayerId: string | null;
  onSetActiveLayer: (layerId: string | null) => void;
}

export function LayersManager({
  layers,
  selectedNodes,
  onSaveLayer,
  onDeleteLayer,
  onSelectLayer,
  activeLayerId,
  onSetActiveLayer,
}: LayersManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleCreateLayer = () => {
    console.log("LayersManager.handleCreateLayer selectedNodes", selectedNodes.map(n => ({ id: n.id, selected: (n as any).selected })));
    if (selectedNodes.length === 0) return;

    const newLayer = {
      id: crypto.randomUUID(),
      name: `Layer ${layers.length + 1}`,
      node_ids: selectedNodes.map((n) => n.id),
      visible: true,
    };

    console.log("LayersManager.handleCreateLayer newLayer", newLayer);
    onSaveLayer(newLayer);
  };

  const handleToggleVisibility = (layer: Layer) => {
    onSaveLayer({
      ...layer,
      visible: !layer.visible,
    });
  };

  const handleStartEdit = (layer: Layer) => {
    setEditingId(layer.id);
    setEditName(layer.name);
  };

  const handleSaveEdit = (layer: Layer) => {
    onSaveLayer({
      ...layer,
      name: editName,
    });
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Button
          onClick={handleCreateLayer}
          disabled={selectedNodes.length === 0}
          size="sm"
          className="w-full"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add Selected to Layer ({selectedNodes.length})
        </Button>
      </div>

      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {layers.map((layer) => {
          const isActive = layer.id === activeLayerId;
          return (
            <div
              key={layer.id}
              className={`flex items-center gap-2 p-2 rounded-md group transition-colors ${
                isActive ? "bg-green-500/20 border border-green-500/50" : "bg-muted/50"
              }`}
            >
              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-6 w-6"
                onClick={() => onSetActiveLayer(isActive ? null : layer.id)}
                title={isActive ? "Deactivate layer" : "Set as active layer"}
              >
                {isActive ? (
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                ) : (
                  <Circle className="w-3 h-3" />
                )}
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-6 w-6"
                onClick={() => handleToggleVisibility(layer)}
              >
                {layer.visible ? (
                  <Eye className="w-3 h-3" />
                ) : (
                  <EyeOff className="w-3 h-3 text-muted-foreground" />
                )}
              </Button>

            {editingId === layer.id ? (
              <>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-6 text-xs flex-1"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1 h-6 w-6"
                  onClick={() => handleSaveEdit(layer)}
                >
                  <Check className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1 h-6 w-6"
                  onClick={handleCancelEdit}
                >
                  <X className="w-3 h-3" />
                </Button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onSelectLayer(layer.node_ids)}
                  className="flex-1 text-left text-xs hover:text-primary transition-colors"
                >
                  {layer.name}
                  <span className="text-muted-foreground ml-1">
                    ({layer.node_ids.length})
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleStartEdit(layer)}
                >
                  <Edit2 className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                  onClick={() => onDeleteLayer(layer.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </>
            )}
            </div>
          );
        })}

        {layers.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Select nodes and create a layer
          </p>
        )}
      </div>
    </div>
  );
}
