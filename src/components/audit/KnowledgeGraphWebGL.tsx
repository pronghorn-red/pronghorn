import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import ForceGraph2D, { ForceGraphMethods } from "react-force-graph-2d";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Network, ZoomIn, ZoomOut, Maximize2, RefreshCw, Download, Trash2, Layers, Eye, EyeOff } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GraphNode {
  id: string;
  label: string;
  description?: string | null;
  nodeType: string;
  sourceDataset?: string | null;
  createdByAgent: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  color: string;
  size: number;
}

interface GraphLink {
  source: string;
  target: string;
  label?: string | null;
  edgeType: string;
  weight: number;
  createdByAgent: string;
  color: string;
}

interface KnowledgeGraphProps {
  nodes: Array<{
    id: string;
    label: string;
    description?: string | null;
    node_type: string;
    source_dataset?: string | null;
    created_by_agent: string;
    x_position?: number;
    y_position?: number;
    color?: string | null;
    size?: number;
  }>;
  edges: Array<{
    id: string;
    source_node_id: string;
    target_node_id: string;
    label?: string | null;
    edge_type: string;
    weight: number;
    created_by_agent: string;
  }>;
  currentPhase?: string;
  onNodeClick?: (nodeId: string) => void;
  onPruneOrphans?: () => void;
  dataset1Label?: string;
  dataset2Label?: string;
}

// Color scheme for node types
const nodeTypeColors: Record<string, string> = {
  concept: "#6366f1", // indigo - synthesized concepts
  theme: "#8b5cf6", // violet
  gap: "#ef4444", // red
  risk: "#f97316", // orange
  opportunity: "#22c55e", // green
  requirement: "#3b82f6", // blue - D1 source elements
  canvas_node: "#22c55e", // green - D2 source elements
  anchor: "#8b5cf6", // violet - project anchor
  d1_element: "#3b82f6", // blue - D1 source elements
  d2_element: "#22c55e", // green - D2 source elements
};

// Node shapes/sizes by type
const nodeTypeSizes: Record<string, number> = {
  concept: 25,
  requirement: 15,
  canvas_node: 15,
  theme: 20,
  gap: 18,
  risk: 18,
  opportunity: 18,
  anchor: 35,
  d1_element: 15,
  d2_element: 15,
};

// Edge type styling
const edgeTypeStyles: Record<string, { color: string; dashed?: boolean }> = {
  derived_from: { color: "#94a3b8", dashed: true },
  relates_to: { color: "#6b7280" },
  implements: { color: "#22c55e" },
  depends_on: { color: "#f97316" },
  conflicts_with: { color: "#ef4444" },
  supports: { color: "#3b82f6" },
  covers: { color: "#8b5cf6" },
  anchors: { color: "#8b5cf6" },
};

// Graph density presets
type GraphDensity = "tight" | "medium" | "relaxed";
const densityPresets: Record<GraphDensity, { linkDistance: number; chargeStrength: number; collisionRadius: number }> = {
  tight: { linkDistance: 80, chargeStrength: -150, collisionRadius: 35 },
  medium: { linkDistance: 150, chargeStrength: -300, collisionRadius: 50 },
  relaxed: { linkDistance: 250, chargeStrength: -500, collisionRadius: 70 },
};

export function KnowledgeGraph({
  nodes,
  edges,
  currentPhase = "conference",
  onNodeClick,
  onPruneOrphans,
  dataset1Label = "Dataset 1",
  dataset2Label = "Dataset 2",
}: KnowledgeGraphProps) {
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphDensity, setGraphDensity] = useState<GraphDensity>("medium");
  const [highlightOrphans, setHighlightOrphans] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // Calculate orphan nodes (nodes with no edges)
  const { orphanNodes, orphanCount, orphanNodeIds } = useMemo(() => {
    const connectedNodeIds = new Set<string>();
    edges.forEach(e => {
      connectedNodeIds.add(e.source_node_id);
      connectedNodeIds.add(e.target_node_id);
    });
    const orphans = nodes.filter(n => !connectedNodeIds.has(n.id));
    return { 
      orphanNodes: orphans, 
      orphanCount: orphans.length,
      orphanNodeIds: new Set(orphans.map(n => n.id))
    };
  }, [nodes, edges]);

  // Transform data for react-force-graph-2d
  const graphData = useMemo(() => {
    const nodeMap = new Set<string>();
    
    // Add anchor node
    const anchorNode: GraphNode = {
      id: "__project_anchor__",
      label: "Project",
      description: "Central anchor",
      nodeType: "anchor",
      sourceDataset: "both",
      createdByAgent: "system",
      color: "#8b5cf6",
      size: 40,
    };
    nodeMap.add(anchorNode.id);

    const graphNodes: GraphNode[] = [
      anchorNode,
      ...nodes.map((n) => {
        nodeMap.add(n.id);
        return {
          id: n.id,
          label: n.label,
          description: n.description,
          nodeType: n.node_type,
          sourceDataset: n.source_dataset,
          createdByAgent: n.created_by_agent,
          color: n.color || nodeTypeColors[n.node_type] || "#6b7280",
          size: nodeTypeSizes[n.node_type] || 15,
        };
      }),
    ];

    // Create anchor edges for concept nodes
    const conceptNodes = nodes.filter(n => n.node_type === "concept");
    const anchorLinks: GraphLink[] = conceptNodes.map(n => ({
      source: "__project_anchor__",
      target: n.id,
      label: null,
      edgeType: "anchors",
      weight: 0.1,
      createdByAgent: "system",
      color: edgeTypeStyles.anchors.color,
    }));

    const graphLinks: GraphLink[] = [
      ...anchorLinks,
      ...edges
        .filter((e) => nodeMap.has(e.source_node_id) && nodeMap.has(e.target_node_id))
        .map((e) => ({
          source: e.source_node_id,
          target: e.target_node_id,
          label: e.label,
          edgeType: e.edge_type,
          weight: e.weight,
          createdByAgent: e.created_by_agent,
          color: edgeTypeStyles[e.edge_type]?.color || "#6b7280",
        })),
    ];

    return { nodes: graphNodes, links: graphLinks };
  }, [nodes, edges]);

  // Handle resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width: Math.max(400, width), height: Math.max(300, height) });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Update forces when density changes
  useEffect(() => {
    if (!graphRef.current) return;
    const density = densityPresets[graphDensity];
    
    graphRef.current.d3Force('charge')?.strength(density.chargeStrength);
    graphRef.current.d3Force('link')?.distance(density.linkDistance);
    graphRef.current.d3Force('collision')?.radius(density.collisionRadius);
    graphRef.current.d3ReheatSimulation();
  }, [graphDensity]);

  // Download graph as JSON
  const handleDownload = useCallback(() => {
    const graphExport = {
      exportedAt: new Date().toISOString(),
      phase: currentPhase,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        orphanNodes: orphanCount,
      },
      nodes: nodes.map(n => ({
        id: n.id,
        label: n.label,
        description: n.description,
        type: n.node_type,
        sourceDataset: n.source_dataset,
        createdBy: n.created_by_agent,
      })),
      edges: edges.map(e => ({
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        type: e.edge_type,
        label: e.label,
        weight: e.weight,
        createdBy: e.created_by_agent,
      })),
    };

    const blob = new Blob([JSON.stringify(graphExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-graph-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [nodes, edges, currentPhase, orphanCount]);

  const handleZoom = useCallback((direction: "in" | "out" | "reset") => {
    if (!graphRef.current) return;
    
    if (direction === "reset") {
      graphRef.current.zoomToFit(300);
    } else {
      const currentZoom = graphRef.current.zoom();
      graphRef.current.zoom(direction === "in" ? currentZoom * 1.3 : currentZoom * 0.7, 200);
    }
  }, []);

  const handleReheat = useCallback(() => {
    graphRef.current?.d3ReheatSimulation();
  }, []);

  const getPhaseLabel = (phase: string) => {
    switch (phase) {
      case "conference": return "Conference - Building Knowledge Graph";
      case "assignment": return "Assignment - Agents Claiming Elements";
      case "analysis": return "Analysis - Parallel Deep Dive";
      case "synthesis": return "Synthesis - Compiling Results";
      default: return phase;
    }
  };

  // Custom node rendering on canvas
  const nodeCanvasObject = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const size = node.size || 15;
    const label = node.label?.slice(0, 20) + (node.label?.length > 20 ? "..." : "");
    const isOrphan = highlightOrphans && orphanNodeIds.has(node.id);
    const x = node.x || 0;
    const y = node.y || 0;

    // Draw node circle
    ctx.beginPath();
    ctx.arc(x, y, size, 0, 2 * Math.PI);
    ctx.fillStyle = node.color;
    ctx.fill();

    // Draw stroke (highlighted for orphans)
    ctx.strokeStyle = isOrphan ? "#ef4444" : "#ffffff";
    ctx.lineWidth = isOrphan ? 5 / globalScale : (node.nodeType === "anchor" ? 4 : node.nodeType === "concept" ? 3 : 2) / globalScale;
    ctx.stroke();

    // Draw orphan glow effect
    if (isOrphan) {
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw icon inside node
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${(node.nodeType === "anchor" ? 16 : node.nodeType === "concept" ? 12 : 10) / globalScale}px Sans-Serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    let icon = node.nodeType[0].toUpperCase();
    switch (node.nodeType) {
      case "anchor": icon = "⚓"; break;
      case "concept": icon = "C"; break;
      case "requirement": icon = "R"; break;
      case "canvas_node": icon = "N"; break;
      case "gap": icon = "!"; break;
      case "risk": icon = "⚠"; break;
    }
    ctx.fillText(icon, x, y);

    // Draw label below node (only when zoomed in enough)
    if (globalScale > 0.4) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.font = `${11 / globalScale}px Sans-Serif`;
      ctx.fillText(label, x, y + size + 12 / globalScale);
    }
  }, [highlightOrphans, orphanNodeIds]);

  // Custom link rendering
  const linkCanvasObject = useCallback((link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const source = link.source as unknown as GraphNode;
    const target = link.target as unknown as GraphNode;
    if (!source.x || !source.y || !target.x || !target.y) return;

    const style = edgeTypeStyles[link.edgeType] || { color: "#6b7280" };
    ctx.strokeStyle = style.color;
    ctx.lineWidth = link.edgeType === "anchors" ? 3 / globalScale : Math.max(1, link.weight * 2) / globalScale;

    if (style.dashed) {
      ctx.setLineDash([4 / globalScale, 2 / globalScale]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw arrow
    const angle = Math.atan2(target.y - source.y, target.x - source.x);
    const targetSize = (target as GraphNode).size || 15;
    const arrowX = target.x - Math.cos(angle) * (targetSize + 5);
    const arrowY = target.y - Math.sin(angle) * (targetSize + 5);
    const arrowSize = 6 / globalScale;

    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(
      arrowX - arrowSize * Math.cos(angle - Math.PI / 6),
      arrowY - arrowSize * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      arrowX - arrowSize * Math.cos(angle + Math.PI / 6),
      arrowY - arrowSize * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();

    // Draw edge label
    if (link.label && globalScale > 0.6) {
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      ctx.fillStyle = "#9ca3af";
      ctx.font = `${10 / globalScale}px Sans-Serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(link.label, midX, midY);
    }
  }, []);

  if (nodes.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Knowledge Graph
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
            <Network className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-center">
              No concepts yet. During the conference phase, agents will collaboratively
              <br />
              build a knowledge graph of themes and concepts.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2">
          {/* Title row */}
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Knowledge Graph
            <Badge variant="outline" className="text-xs ml-2 bg-primary/10 text-primary">WebGL</Badge>
          </CardTitle>

          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">{getPhaseLabel(currentPhase)}</Badge>
            <Badge variant="secondary" className="text-xs">
              {nodes.length} nodes · {edges.length} edges
            </Badge>
            {orphanCount > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Badge
                    variant="destructive"
                    className="text-xs cursor-pointer hover:bg-destructive/80"
                  >
                    {orphanCount} orphans
                  </Badge>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Orphan Nodes (no edges)</h4>
                    <p className="text-xs text-muted-foreground">
                      These nodes have no connections in the graph.
                    </p>
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-1">
                        {orphanNodes.map(node => (
                          <div
                            key={node.id}
                            className="text-xs p-2 bg-muted/50 rounded cursor-pointer hover:bg-muted"
                            onClick={() => onNodeClick?.(node.id)}
                          >
                            <div className="font-medium truncate">{node.label}</div>
                            <div className="text-muted-foreground">
                              {node.node_type} · {node.source_dataset || "unknown"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-1 flex-wrap">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleZoom("out")}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom Out</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleZoom("in")}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom In</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleZoom("reset")}>
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset View</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleReheat}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Re-layout</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="w-px h-6 bg-border mx-1" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center">
                    <Select value={graphDensity} onValueChange={(v) => setGraphDensity(v as GraphDensity)}>
                      <SelectTrigger className="h-8 w-[110px] text-xs">
                        <Layers className="h-3 w-3 mr-1" />
                        <SelectValue placeholder="Density" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tight">Tight</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="relaxed">Relaxed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Graph node spacing</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleDownload}>
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download Graph (JSON)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {orphanCount > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={highlightOrphans ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setHighlightOrphans(!highlightOrphans)}
                    >
                      {highlightOrphans ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{highlightOrphans ? "Hide orphan highlighting" : "Highlight orphan nodes"}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {orphanCount > 0 && onPruneOrphans && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onPruneOrphans}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Prune {orphanCount} orphan nodes</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 p-0 overflow-hidden" ref={containerRef}>
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={(node, color, ctx) => {
            const size = (node as GraphNode).size || 15;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x || 0, node.y || 0, size + 5, 0, 2 * Math.PI);
            ctx.fill();
          }}
          linkCanvasObject={linkCanvasObject}
          linkPointerAreaPaint={(link, color, ctx) => {
            const source = link.source as unknown as GraphNode;
            const target = link.target as unknown as GraphNode;
            if (!source.x || !source.y || !target.x || !target.y) return;
            ctx.strokeStyle = color;
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.moveTo(source.x, source.y);
            ctx.lineTo(target.x, target.y);
            ctx.stroke();
          }}
          onNodeClick={(node) => onNodeClick?.((node as GraphNode).id)}
          onNodeDragEnd={(node) => {
            // Pin node after drag
            (node as GraphNode).fx = node.x;
            (node as GraphNode).fy = node.y;
          }}
          cooldownTicks={100}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          enablePanInteraction={true}
          backgroundColor="transparent"
        />
      </CardContent>

      {/* Legend */}
      <div className="px-4 pb-4 border-t pt-3">
        <div className="flex flex-wrap gap-2 sm:gap-4 text-xs mb-2">
          <div className="font-medium text-muted-foreground w-full sm:w-auto">Nodes:</div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded-full border-2 border-white" style={{ backgroundColor: nodeTypeColors.concept }} />
            <span>Concept</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full border border-white/50" style={{ backgroundColor: nodeTypeColors.requirement }} />
            <span>{dataset1Label}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full border border-white/50" style={{ backgroundColor: nodeTypeColors.canvas_node }} />
            <span>{dataset2Label}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-4 text-xs">
          <div className="font-medium text-muted-foreground w-full sm:w-auto">Edges:</div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-0 border-t-2 border-dashed" style={{ borderColor: edgeTypeStyles.derived_from.color }} />
            <span>Derived From</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-0 border-t-2" style={{ borderColor: edgeTypeStyles.relates_to.color }} />
            <span>Relates To</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-0 border-t-2" style={{ borderColor: edgeTypeStyles.implements.color }} />
            <span>Implements</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
