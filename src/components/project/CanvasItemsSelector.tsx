import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface CanvasInfo {
  id: string;
  name: string;
  is_default: boolean;
}

interface CanvasNode {
  id: string;
  type: string;
  data: any;
  canvas_id: string | null;
}

interface CanvasEdge {
  id: string;
  label: string | null;
  source_id: string;
  target_id: string;
  canvas_id: string | null;
}

interface CanvasLayer {
  id: string;
  name: string;
  node_ids: string[];
  canvas_id: string | null;
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
  const [canvases, setCanvases] = useState<CanvasInfo[]>([]);
  const [selectedCanvasId, setSelectedCanvasId] = useState<string>("__all__");
  const [allNodes, setAllNodes] = useState<CanvasNode[]>([]);
  const [allEdges, setAllEdges] = useState<CanvasEdge[]>([]);
  const [allLayers, setAllLayers] = useState<CanvasLayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCanvasItems();
  }, [projectId]);

  const loadCanvasItems = async () => {
    try {
      const [canvasesData, nodesData, edgesData, layersData] = await Promise.all([
        supabase.rpc("get_project_canvases_with_token", {
          p_project_id: projectId,
          p_token: shareToken
        }),
        supabase.rpc("get_canvas_nodes_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
          p_canvas_id: null // Get all nodes across canvases
        }),
        supabase.rpc("get_canvas_edges_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
          p_canvas_id: null // Get all edges across canvases
        }),
        supabase.rpc("get_canvas_layers_with_token", {
          p_project_id: projectId,
          p_token: shareToken,
          p_canvas_id: null // Get all layers across canvases
        })
      ]);

      if (canvasesData.data) setCanvases(canvasesData.data);
      if (nodesData.data) setAllNodes(nodesData.data);
      if (edgesData.data) setAllEdges(edgesData.data);
      if (layersData.data) setAllLayers(layersData.data);
    } catch (error) {
      console.error("Error loading canvas items:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter items based on selected canvas
  const filteredNodes = selectedCanvasId === "__all__" 
    ? allNodes 
    : allNodes.filter(n => n.canvas_id === selectedCanvasId || (!n.canvas_id && selectedCanvasId === "__legacy__"));
  
  const filteredEdges = selectedCanvasId === "__all__" 
    ? allEdges 
    : allEdges.filter(e => e.canvas_id === selectedCanvasId || (!e.canvas_id && selectedCanvasId === "__legacy__"));
  
  const filteredLayers = selectedCanvasId === "__all__" 
    ? allLayers 
    : allLayers.filter(l => l.canvas_id === selectedCanvasId || (!l.canvas_id && selectedCanvasId === "__legacy__"));

  // Check if there are legacy (null canvas_id) items
  const hasLegacyItems = allNodes.some(n => !n.canvas_id) || 
                         allEdges.some(e => !e.canvas_id) || 
                         allLayers.some(l => !l.canvas_id);

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
    const layer = allLayers.find(l => l.id === id);
    
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

  const getCanvasName = (canvasId: string | null) => {
    if (!canvasId) return "Legacy (Unassigned)";
    const canvas = canvases.find(c => c.id === canvasId);
    return canvas?.name || "Unknown Canvas";
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading canvas items...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Canvas Filter */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Filter by Canvas</Label>
        <Select value={selectedCanvasId} onValueChange={setSelectedCanvasId}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="All Canvases" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">
              All Canvases ({allNodes.length} nodes)
            </SelectItem>
            {canvases.map((canvas) => {
              const nodeCount = allNodes.filter(n => n.canvas_id === canvas.id).length;
              return (
                <SelectItem key={canvas.id} value={canvas.id}>
                  {canvas.name} ({nodeCount} nodes)
                  {canvas.is_default && <Badge variant="secondary" className="ml-2 text-xs">Default</Badge>}
                </SelectItem>
              );
            })}
            {hasLegacyItems && (
              <SelectItem value="__legacy__">
                Legacy (Unassigned)
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="nodes" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="nodes">Nodes ({filteredNodes.length})</TabsTrigger>
          <TabsTrigger value="edges">Edges ({filteredEdges.length})</TabsTrigger>
          <TabsTrigger value="layers">Layers ({filteredLayers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="nodes" className="space-y-4 mt-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNodesChange(new Set(filteredNodes.map(n => n.id)))}
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
          {filteredNodes.length === 0 ? (
            <div className="text-sm text-muted-foreground">No nodes in {selectedCanvasId === "__all__" ? "any canvas" : "this canvas"}.</div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {filteredNodes.map((node) => (
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
                    {selectedCanvasId === "__all__" && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ({getCanvasName(node.canvas_id)})
                      </span>
                    )}
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
              onClick={() => onEdgesChange(new Set(filteredEdges.map(e => e.id)))}
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
          {filteredEdges.length === 0 ? (
            <div className="text-sm text-muted-foreground">No edges in {selectedCanvasId === "__all__" ? "any canvas" : "this canvas"}.</div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {filteredEdges.map((edge) => (
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
                    {selectedCanvasId === "__all__" && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ({getCanvasName(edge.canvas_id)})
                      </span>
                    )}
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
              onClick={() => onLayersChange(new Set(filteredLayers.map(l => l.id)))}
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
          {filteredLayers.length === 0 ? (
            <div className="text-sm text-muted-foreground">No layers in {selectedCanvasId === "__all__" ? "any canvas" : "this canvas"}.</div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {filteredLayers.map((layer) => (
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
                      {selectedCanvasId === "__all__" && ` • ${getCanvasName(layer.canvas_id)}`}
                    </div>
                  </Label>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
