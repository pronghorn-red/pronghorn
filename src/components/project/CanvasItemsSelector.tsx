import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

interface CanvasNode {
  id: string;
  type: string;
  data: any;
}

interface CanvasEdge {
  id: string;
  label: string | null;
  source_id: string;
  target_id: string;
}

interface CanvasLayer {
  id: string;
  name: string;
  node_ids: string[];
}

interface CanvasItemsSelectorProps {
  projectId: string;
  shareToken: string | null;
  selectedNodes: Set<string>;
  selectedEdges: Set<string>;
  selectedLayers: Set<string>;
  onNodesChange: (selectedIds: Set<string>) => void;
  onEdgesChange: (selectedIds: Set<string>) => void;
  onLayersChange: (selectedIds: Set<string>) => void;
}

export function CanvasItemsSelector({
  projectId,
  shareToken,
  selectedNodes,
  selectedEdges,
  selectedLayers,
  onNodesChange,
  onEdgesChange,
  onLayersChange
}: CanvasItemsSelectorProps) {
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [layers, setLayers] = useState<CanvasLayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCanvasItems();
  }, [projectId]);

  const loadCanvasItems = async () => {
    try {
      const [nodesData, edgesData, layersData] = await Promise.all([
        supabase.rpc("get_canvas_nodes_with_token", {
          p_project_id: projectId,
          p_token: shareToken
        }),
        supabase.rpc("get_canvas_edges_with_token", {
          p_project_id: projectId,
          p_token: shareToken
        }),
        supabase.rpc("get_canvas_layers_with_token", {
          p_project_id: projectId,
          p_token: shareToken
        })
      ]);

      if (nodesData.data) setNodes(nodesData.data);
      if (edgesData.data) setEdges(edgesData.data);
      if (layersData.data) setLayers(layersData.data);
    } catch (error) {
      console.error("Error loading canvas items:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleNode = (id: string) => {
    const newSelected = new Set(selectedNodes);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    onNodesChange(newSelected);
  };

  const toggleEdge = (id: string) => {
    const newSelected = new Set(selectedEdges);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    onEdgesChange(newSelected);
  };

  const toggleLayer = (id: string) => {
    const newSelectedLayers = new Set(selectedLayers);
    const layer = layers.find(l => l.id === id);
    
    if (newSelectedLayers.has(id)) {
      // Deselecting layer - also deselect its nodes
      newSelectedLayers.delete(id);
      if (layer) {
        const newSelectedNodes = new Set(selectedNodes);
        layer.node_ids.forEach(nodeId => newSelectedNodes.delete(nodeId));
        onNodesChange(newSelectedNodes);
      }
    } else {
      // Selecting layer - also select its nodes
      newSelectedLayers.add(id);
      if (layer) {
        const newSelectedNodes = new Set(selectedNodes);
        layer.node_ids.forEach(nodeId => newSelectedNodes.add(nodeId));
        onNodesChange(newSelectedNodes);
      }
    }
    onLayersChange(newSelectedLayers);
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading canvas items...</div>;
  }

  return (
    <Tabs defaultValue="nodes" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="nodes">Nodes ({nodes.length})</TabsTrigger>
        <TabsTrigger value="edges">Edges ({edges.length})</TabsTrigger>
        <TabsTrigger value="layers">Layers ({layers.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="nodes" className="space-y-4 mt-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNodesChange(new Set(nodes.map(n => n.id)))}
          >
            Select All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNodesChange(new Set())}
          >
            Select None
          </Button>
        </div>
        {nodes.length === 0 ? (
          <div className="text-sm text-muted-foreground">No nodes in canvas.</div>
        ) : (
          <div className="space-y-2">
            {nodes.map((node) => (
              <div
                key={node.id}
                className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded"
              >
                <Checkbox
                  id={`node-${node.id}`}
                  checked={selectedNodes.has(node.id)}
                  onCheckedChange={() => toggleNode(node.id)}
                />
                <Label
                  htmlFor={`node-${node.id}`}
                  className="text-sm cursor-pointer flex-1"
                >
                  <span className="font-medium">{node.type}</span>
                  {node.data?.label && ` - ${node.data.label}`}
                </Label>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="edges" className="space-y-4 mt-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdgesChange(new Set(edges.map(e => e.id)))}
          >
            Select All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdgesChange(new Set())}
          >
            Select None
          </Button>
        </div>
        {edges.length === 0 ? (
          <div className="text-sm text-muted-foreground">No edges in canvas.</div>
        ) : (
          <div className="space-y-2">
            {edges.map((edge) => (
              <div
                key={edge.id}
                className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded"
              >
                <Checkbox
                  id={`edge-${edge.id}`}
                  checked={selectedEdges.has(edge.id)}
                  onCheckedChange={() => toggleEdge(edge.id)}
                />
                <Label
                  htmlFor={`edge-${edge.id}`}
                  className="text-sm cursor-pointer flex-1"
                >
                  {edge.label || "Unlabeled edge"}
                </Label>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="layers" className="space-y-4 mt-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onLayersChange(new Set(layers.map(l => l.id)))}
          >
            Select All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onLayersChange(new Set())}
          >
            Select None
          </Button>
        </div>
        {layers.length === 0 ? (
          <div className="text-sm text-muted-foreground">No layers in canvas.</div>
        ) : (
          <div className="space-y-2">
            {layers.map((layer) => (
              <div
                key={layer.id}
                className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded"
              >
                <Checkbox
                  id={`layer-${layer.id}`}
                  checked={selectedLayers.has(layer.id)}
                  onCheckedChange={() => toggleLayer(layer.id)}
                />
                <Label
                  htmlFor={`layer-${layer.id}`}
                  className="text-sm cursor-pointer flex-1"
                >
                  <div className="font-medium">{layer.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {layer.node_ids.length} node{layer.node_ids.length !== 1 ? 's' : ''}
                  </div>
                </Label>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
