import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import * as d3 from "d3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Network, ZoomIn, ZoomOut, Maximize2, RefreshCw, Download, Trash2 } from "lucide-react";

interface GraphNode {
  id: string;
  label: string;
  description?: string | null;
  node_type: string;
  source_dataset?: string | null;
  created_by_agent: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  color?: string | null;
  size?: number;
}

interface GraphEdge {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  label?: string | null;
  edge_type: string;
  weight: number;
  created_by_agent: string;
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
};

// Node shapes/sizes by type
const nodeTypeSizes: Record<string, number> = {
  concept: 25, // Larger for synthesized concepts
  requirement: 15, // Smaller for source elements
  canvas_node: 15,
  theme: 20,
  gap: 18,
  risk: 18,
  opportunity: 18,
  anchor: 35, // Large for anchor node
};

// Edge type styling
const edgeTypeStyles: Record<string, { color: string; dashArray?: string }> = {
  derived_from: { color: "#94a3b8", dashArray: "4,2" }, // Dashed gray for provenance
  relates_to: { color: "#6b7280" },
  implements: { color: "#22c55e" },
  depends_on: { color: "#f97316" },
  conflicts_with: { color: "#ef4444" },
  supports: { color: "#3b82f6" },
  covers: { color: "#8b5cf6" },
  anchors: { color: "#8b5cf620", dashArray: "2,4" }, // Very faint for anchor lines
};

// Color scheme for agent roles
const agentColors: Record<string, string> = {
  security_analyst: "#ef4444",
  business_analyst: "#3b82f6",
  developer: "#22c55e",
  end_user: "#a855f7",
  architect: "#f97316",
  orchestrator: "#6366f1",
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
  const svgRef = useRef<SVGSVGElement>(null);
  
  // Calculate orphan count (nodes with no edges)
  const orphanCount = useMemo(() => {
    const connectedNodeIds = new Set<string>();
    edges.forEach(e => {
      connectedNodeIds.add(e.source_node_id);
      connectedNodeIds.add(e.target_node_id);
    });
    return nodes.filter(n => !connectedNodeIds.has(n.id)).length;
  }, [nodes, edges]);
  
  // Download graph as JSON
  const handleDownload = useCallback(() => {
    const graphData = {
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
    
    const blob = new Blob([JSON.stringify(graphData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-graph-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [nodes, edges, currentPhase, orphanCount]);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const initializedRef = useRef(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // Transform data for D3, preserving existing positions and adding anchor node
  const graphData = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    
    // Add a central "Project" anchor node
    const anchorNode: GraphNode = {
      id: "__project_anchor__",
      label: "Project",
      description: "Central anchor",
      node_type: "anchor",
      source_dataset: "both",
      created_by_agent: "system",
      x: nodePositionsRef.current.get("__project_anchor__")?.x ?? undefined,
      y: nodePositionsRef.current.get("__project_anchor__")?.y ?? undefined,
      color: "#8b5cf6", // violet
      size: 40,
    };
    nodeMap.set(anchorNode.id, anchorNode);
    
    const graphNodes: GraphNode[] = [anchorNode, ...nodes.map((n) => {
      // Preserve existing position if we have it
      const existingPos = nodePositionsRef.current.get(n.id);
      const node: GraphNode = {
        id: n.id,
        label: n.label,
        description: n.description,
        node_type: n.node_type,
        source_dataset: n.source_dataset,
        created_by_agent: n.created_by_agent,
        x: existingPos?.x ?? n.x_position ?? undefined,
        y: existingPos?.y ?? n.y_position ?? undefined,
        color: n.color || nodeTypeColors[n.node_type] || "#6b7280",
        size: n.size || 10,
      };
      nodeMap.set(n.id, node);
      return node;
    })];

    // Create edges from anchor to ALL nodes (not just concepts) to keep graph together
    const anchorEdges: GraphEdge[] = nodes.map(n => ({
      id: `anchor-to-${n.id}`,
      source: "__project_anchor__",
      target: n.id,
      label: null,
      edge_type: "anchors",
      weight: 0.1, // Very weak to allow natural clustering
      created_by_agent: "system",
    }));

    const graphEdges: GraphEdge[] = [
      ...anchorEdges,
      ...edges
        .filter((e) => nodeMap.has(e.source_node_id) && nodeMap.has(e.target_node_id))
        .map((e) => ({
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          label: e.label,
          edge_type: e.edge_type,
          weight: e.weight,
          created_by_agent: e.created_by_agent,
        })),
    ];

    return { nodes: graphNodes, edges: graphEdges };
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

  // D3 force simulation - incremental updates to prevent jitter
  useEffect(() => {
    if (!svgRef.current || graphData.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const { width, height } = dimensions;
    
    // Check if this is the first render or if we need full setup
    const needsFullSetup = !initializedRef.current;
    
    if (needsFullSetup) {
      svg.selectAll("*").remove();
      initializedRef.current = true;
    }
    
    // Create or get zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        svg.select<SVGGElement>("g.main-group").attr("transform", event.transform);
      });

    svg.call(zoom);

    let g = svg.select<SVGGElement>("g.main-group");
    if (g.empty()) {
      g = svg.append("g").attr("class", "main-group");
      
      // Create arrow marker for directed edges
      svg
        .append("defs")
        .selectAll("marker")
        .data(["arrow"])
        .join("marker")
        .attr("id", "arrow")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 25)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("fill", "#6b7280")
        .attr("d", "M0,-5L10,0L0,5");
      
      // Create layer groups
      g.append("g").attr("class", "links");
      g.append("g").attr("class", "link-labels");
      g.append("g").attr("class", "nodes");
    }

    // Stop existing simulation before updating
    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    // Create simulation with preserved positions
    const simulation = d3
      .forceSimulation<GraphNode>(graphData.nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphEdge>(graphData.edges)
          .id((d) => d.id)
          .distance(100)
          .strength((d) => d.weight * 0.5)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(40));

    simulationRef.current = simulation;

    // Update edges using D3 data join
    const linkGroup = g.select<SVGGElement>("g.links");
    const link = linkGroup
      .selectAll<SVGLineElement, GraphEdge>("line")
      .data(graphData.edges, (d) => d.id)
      .join(
        enter => enter.append("line")
          .attr("stroke", (d) => edgeTypeStyles[d.edge_type]?.color || "#6b728080")
          .attr("stroke-width", (d) => d.edge_type === "derived_from" ? 1.5 : Math.max(1, d.weight * 2))
          .attr("stroke-dasharray", (d) => edgeTypeStyles[d.edge_type]?.dashArray || "")
          .attr("marker-end", "url(#arrow)"),
        update => update,
        exit => exit.remove()
      );

    // Update edge labels
    const linkLabelGroup = g.select<SVGGElement>("g.link-labels");
    const linkLabel = linkLabelGroup
      .selectAll<SVGTextElement, GraphEdge>("text")
      .data(graphData.edges.filter((e) => e.label), (d) => d.id)
      .join(
        enter => enter.append("text")
          .attr("font-size", "10px")
          .attr("fill", "#9ca3af")
          .attr("text-anchor", "middle")
          .text((d) => d.label || ""),
        update => update.text((d) => d.label || ""),
        exit => exit.remove()
      );

    // Update nodes using D3 data join
    const nodeGroup = g.select<SVGGElement>("g.nodes");
    const node = nodeGroup
      .selectAll<SVGGElement, GraphNode>("g.node")
      .data(graphData.nodes, (d) => d.id)
      .join(
        enter => {
          const nodeEnter = enter.append("g")
            .attr("class", "node")
            .attr("cursor", "pointer")
            .on("click", (event, d) => {
              event.stopPropagation();
              onNodeClick?.(d.id);
            });
          
          // Add circle
          nodeEnter.append("circle")
            .attr("r", (d) => nodeTypeSizes[d.node_type] || 15)
            .attr("fill", (d) => d.color || nodeTypeColors[d.node_type] || "#6b7280")
            .attr("stroke", (d) => d.node_type === "anchor" ? "#ffffff" : d.node_type === "concept" ? "#ffffff" : "#ffffff80")
            .attr("stroke-width", (d) => d.node_type === "anchor" ? 4 : d.node_type === "concept" ? 3 : 2)
            .attr("opacity", (d) => d.node_type === "anchor" || d.node_type === "concept" ? 1 : 0.85);
          
          // Add label
          nodeEnter.append("text")
            .attr("class", "node-label")
            .attr("dy", (d) => (d.size || 10) + 20)
            .attr("text-anchor", "middle")
            .attr("font-size", "11px")
            .attr("fill", "currentColor")
            .text((d) => d.label.slice(0, 20) + (d.label.length > 20 ? "..." : ""));
          
          // Add type icon
          nodeEnter.append("text")
            .attr("class", "node-icon")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .attr("font-size", (d) => d.node_type === "anchor" ? "16px" : d.node_type === "concept" ? "12px" : "10px")
            .attr("font-weight", "bold")
            .attr("fill", "#ffffff")
            .text((d) => {
              switch (d.node_type) {
                case "anchor": return "⚓";
                case "concept": return "C";
                case "requirement": return "R";
                case "canvas_node": return "N";
                case "gap": return "!";
                case "risk": return "⚠";
                default: return d.node_type[0].toUpperCase();
              }
            });
          
          return nodeEnter;
        },
        update => update,
        exit => exit.remove()
      );

    // Apply drag behavior
    node.call(
      d3
        .drag<SVGGElement, GraphNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

    // Simulation tick - save positions to ref
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x || 0)
        .attr("y1", (d) => (d.source as GraphNode).y || 0)
        .attr("x2", (d) => (d.target as GraphNode).x || 0)
        .attr("y2", (d) => (d.target as GraphNode).y || 0);

      linkLabel
        .attr("x", (d) => {
          const s = d.source as GraphNode;
          const t = d.target as GraphNode;
          return ((s.x || 0) + (t.x || 0)) / 2;
        })
        .attr("y", (d) => {
          const s = d.source as GraphNode;
          const t = d.target as GraphNode;
          return ((s.y || 0) + (t.y || 0)) / 2;
        });

      node.attr("transform", (d) => `translate(${d.x || 0},${d.y || 0})`);
      
      // Save positions for future updates
      graphData.nodes.forEach(n => {
        if (n.x !== undefined && n.y !== undefined) {
          nodePositionsRef.current.set(n.id, { x: n.x, y: n.y });
        }
      });
    });

    // Only apply initial zoom on first render
    if (needsFullSetup) {
      const initialScale = 0.8;
      svg.call(
        zoom.transform,
        d3.zoomIdentity
          .translate(width * (1 - initialScale) / 2, height * (1 - initialScale) / 2)
          .scale(initialScale)
      );
    } else {
      // For updates, just gently reheat the simulation
      simulation.alpha(0.3).restart();
    }

    return () => {
      simulation.stop();
    };
  }, [graphData, dimensions, onNodeClick]);

  const handleZoom = useCallback((direction: "in" | "out" | "reset") => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4]);
    
    if (direction === "reset") {
      svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
    } else {
      svg.transition().duration(200).call(
        zoom.scaleBy,
        direction === "in" ? 1.3 : 0.7
      );
    }
  }, []);

  const handleReheat = useCallback(() => {
    simulationRef.current?.alpha(0.5).restart();
  }, []);

  const getPhaseLabel = (phase: string) => {
    switch (phase) {
      case "conference":
        return "Conference - Building Knowledge Graph";
      case "assignment":
        return "Assignment - Agents Claiming Elements";
      case "analysis":
        return "Analysis - Parallel Deep Dive";
      case "synthesis":
        return "Synthesis - Compiling Results";
      default:
        return phase;
    }
  };

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
          </CardTitle>
          
          {/* Badges row - wraps on mobile */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">{getPhaseLabel(currentPhase)}</Badge>
            <Badge variant="secondary" className="text-xs">
              {nodes.length} nodes · {edges.length} edges
            </Badge>
            {orphanCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {orphanCount} orphans
              </Badge>
            )}
          </div>
          
          {/* Actions row - wraps on mobile */}
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
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleDownload}>
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download Graph (JSON)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="w-full h-full min-h-[400px]"
          style={{ cursor: "grab" }}
        />
      </CardContent>

      {/* Legend - Responsive */}
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
