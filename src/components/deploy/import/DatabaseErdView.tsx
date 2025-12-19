import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MarkerType,
  Position,
  useNodesState,
  useEdgesState,
  Handle,
  useReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  getViewportForBounds,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toPng, toSvg } from 'html-to-image';
import { TableProperties, Key, Plus, ArrowDownToLine, AlertTriangle, Minus, LayoutGrid, Download, Camera, Image } from 'lucide-react';
import { ForeignKeyRelationship, JsonTable, getJsonHeaders } from '@/utils/parseJson';
import { TableMatchResult, ExistingTableSchema } from '@/utils/tableMatching';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface DatabaseErdViewProps {
  existingTables: ExistingTableSchema[];
  importTables: JsonTable[];
  relationships: ForeignKeyRelationship[];
  tableMatches: TableMatchResult[];
  onTableClick?: (tableName: string, isImport: boolean) => void;
  showLegend?: boolean;
  className?: string;
}

type NodeStatus = 'new' | 'insert' | 'conflict' | 'unaffected';

// Node styling based on status
const getNodeStyles = (status: NodeStatus) => {
  switch (status) {
    case 'new':
      return 'border-green-500 bg-green-500/10 dark:bg-green-500/20';
    case 'insert':
      return 'border-blue-500 bg-blue-500/10 dark:bg-blue-500/20';
    case 'conflict':
      return 'border-amber-500 bg-amber-500/10 dark:bg-amber-500/20';
    case 'unaffected':
      return 'border-muted-foreground/30 bg-muted/30';
  }
};

const getStatusIcon = (status: NodeStatus) => {
  switch (status) {
    case 'new':
      return <Plus className="h-3 w-3 text-green-500" />;
    case 'insert':
      return <ArrowDownToLine className="h-3 w-3 text-blue-500" />;
    case 'conflict':
      return <AlertTriangle className="h-3 w-3 text-amber-500" />;
    case 'unaffected':
      return <Minus className="h-3 w-3 text-muted-foreground" />;
  }
};

const getStatusLabel = (status: NodeStatus) => {
  switch (status) {
    case 'new': return 'Creating';
    case 'insert': return 'Inserting';
    case 'conflict': return 'Conflict';
    case 'unaffected': return 'Existing';
  }
};

interface TableNodeData {
  label: string;
  columns: string[];
  status: NodeStatus;
  isImport: boolean;
  matchInfo?: {
    matchType: string;
    score: number;
    conflicts: number;
    missingCols: number;
  };
  hasChildren: boolean;
  hasParent: boolean;
}

const TableNode = ({ data }: { data: TableNodeData }) => {
  return (
    <div className={cn(
      "relative px-3 py-2 rounded-lg border-2 shadow-md min-w-[160px] max-w-[220px]",
      getNodeStyles(data.status)
    )}>
      {/* Target handle on left for incoming edges */}
      {data.hasParent && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-primary !border-2 !border-background"
        />
      )}
      
      <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-border">
        {getStatusIcon(data.status)}
        <span className="font-semibold text-xs truncate flex-1">{data.label}</span>
        {data.isImport && <Key className="h-3 w-3 text-amber-500" />}
      </div>
      
      {/* Status badge */}
      <div className="mb-1.5">
        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
          {getStatusLabel(data.status)}
          {data.matchInfo && data.matchInfo.matchType !== 'new' && (
            <span className="ml-1 opacity-70">({data.matchInfo.score}%)</span>
          )}
        </Badge>
      </div>
      
      {/* Column list */}
      <div className="space-y-0.5">
        {data.columns.slice(0, 4).map((col, i) => (
          <div key={i} className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0" />
            <span className="truncate">{col}</span>
          </div>
        ))}
        {data.columns.length > 4 && (
          <div className="text-[10px] text-muted-foreground italic">
            +{data.columns.length - 4} more
          </div>
        )}
      </div>
      
      {/* Conflict indicator */}
      {data.matchInfo && data.matchInfo.conflicts > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-amber-500/30">
          <span className="text-[10px] text-amber-600 dark:text-amber-400">
            {data.matchInfo.conflicts} type conflict{data.matchInfo.conflicts > 1 ? 's' : ''}
          </span>
        </div>
      )}
      
      {/* Missing columns indicator */}
      {data.matchInfo && data.matchInfo.missingCols > 0 && (
        <div className="text-[10px] text-blue-600 dark:text-blue-400">
          +{data.matchInfo.missingCols} new column{data.matchInfo.missingCols > 1 ? 's' : ''}
        </div>
      )}
      
      {/* Source handle on right for outgoing edges */}
      {data.hasChildren && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-primary !border-2 !border-background"
        />
      )}
    </div>
  );
};

const nodeTypes = {
  tableNode: TableNode,
};

/**
 * Calculate hierarchical tree layout for import tables
 * Places parent tables on left, children branching to the right
 */
function calculateTreeLayout(
  importTables: JsonTable[],
  relationships: ForeignKeyRelationship[]
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  
  // Build parent-child map
  const parentMap = new Map<string, string>();
  const childrenMap = new Map<string, string[]>();
  
  relationships.forEach(rel => {
    parentMap.set(rel.childTable, rel.parentTable);
    const children = childrenMap.get(rel.parentTable) || [];
    children.push(rel.childTable);
    childrenMap.set(rel.parentTable, children);
  });
  
  // Find root tables (no parent)
  const roots = importTables.filter(t => !parentMap.has(t.name));
  
  const NODE_WIDTH = 200;
  const NODE_HEIGHT = 150;
  const HORIZONTAL_GAP = 80;
  const VERTICAL_GAP = 30;
  
  let currentY = 0;
  
  // Recursive function to layout a subtree
  const layoutSubtree = (tableName: string, depth: number, startY: number): number => {
    const children = childrenMap.get(tableName) || [];
    const x = depth * (NODE_WIDTH + HORIZONTAL_GAP);
    
    if (children.length === 0) {
      // Leaf node
      positions.set(tableName, { x, y: startY });
      return startY + NODE_HEIGHT + VERTICAL_GAP;
    }
    
    // Layout children first to calculate total height
    let childY = startY;
    const childPositions: number[] = [];
    
    for (const child of children) {
      childPositions.push(childY);
      childY = layoutSubtree(child, depth + 1, childY);
    }
    
    // Position this node at the center of its children
    const firstChildY = childPositions[0];
    const lastChildY = childPositions[childPositions.length - 1];
    const centerY = (firstChildY + lastChildY) / 2;
    
    positions.set(tableName, { x, y: centerY });
    
    return childY;
  };
  
  // Layout each root tree
  for (const root of roots) {
    currentY = layoutSubtree(root.name, 0, currentY);
  }
  
  // Handle orphan tables (in import but not in relationships)
  const positionedTables = new Set(positions.keys());
  const orphans = importTables.filter(t => !positionedTables.has(t.name));
  
  for (const orphan of orphans) {
    positions.set(orphan.name, { x: 0, y: currentY });
    currentY += NODE_HEIGHT + VERTICAL_GAP;
  }
  
  return positions;
}

export const DatabaseErdView: React.FC<DatabaseErdViewProps> = ({
  existingTables,
  importTables,
  relationships,
  tableMatches,
  onTableClick,
  showLegend = true,
  className,
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  // Track user-modified positions
  const userPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const isInitializedRef = useRef(false);
  
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodeList: Node[] = [];
    const edgeList: Edge[] = [];
    
    // Create a map of import table names for quick lookup
    const importTableNames = new Set(importTables.map(t => t.name.toLowerCase()));
    
    // Create a map of matches by import table name
    const matchesByImport = new Map<string, TableMatchResult>();
    tableMatches.forEach(m => matchesByImport.set(m.importTable.toLowerCase(), m));
    
    // Create a map of matches by existing table name
    const matchesByExisting = new Map<string, TableMatchResult>();
    tableMatches.forEach(m => {
      if (m.existingTable) {
        matchesByExisting.set(m.existingTable.toLowerCase(), m);
      }
    });
    
    // Build parent-child relationships
    const parentMap = new Map<string, string>();
    relationships.forEach(rel => {
      parentMap.set(rel.childTable, rel.parentTable);
    });
    
    // Track which existing tables are affected
    const affectedExisting = new Set<string>();
    tableMatches.forEach(m => {
      if (m.existingTable && m.status !== 'new') {
        affectedExisting.add(m.existingTable.toLowerCase());
      }
    });
    
    // Build sets for parent/child relationships
    const hasChildrenSet = new Set<string>();
    const hasParentSet = new Set<string>();
    parentMap.forEach((parentName, childName) => {
      hasChildrenSet.add(parentName.toLowerCase());
      hasParentSet.add(childName.toLowerCase());
    });
    
    // Calculate tree layout for import tables
    const treePositions = calculateTreeLayout(importTables, relationships);
    
    // Add import table nodes using tree layout
    importTables.forEach((table) => {
      const match = matchesByImport.get(table.name.toLowerCase());
      const status: NodeStatus = match?.status === 'new' ? 'new' 
        : match?.status === 'conflict' ? 'conflict' 
        : match?.status === 'insert' ? 'insert' 
        : 'new';
      
      // Use user position if available, otherwise use calculated tree position
      const nodeId = `import-${table.name}`;
      const userPos = userPositionsRef.current.get(nodeId);
      const treePos = treePositions.get(table.name) || { x: 0, y: 0 };
      const position = userPos || treePos;
      
      nodeList.push({
        id: nodeId,
        type: 'tableNode',
        position,
        data: {
          label: table.name,
          columns: getJsonHeaders(table).filter(c => c !== '_row_id'),
          status,
          isImport: true,
          matchInfo: match ? {
            matchType: match.matchType,
            score: match.matchScore,
            conflicts: match.conflicts.length,
            missingCols: match.missingColumns.length
          } : undefined,
          hasChildren: hasChildrenSet.has(table.name.toLowerCase()),
          hasParent: hasParentSet.has(table.name.toLowerCase()),
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
      });
    });
    
    // Find the rightmost position of import tables
    let maxImportX = 0;
    treePositions.forEach(pos => {
      maxImportX = Math.max(maxImportX, pos.x);
    });
    const EXISTING_COL_X = maxImportX + 350;
    const ROW_HEIGHT = 140;
    
    // Add existing table nodes (unaffected ones)
    let existingY = 0;
    existingTables.forEach((table) => {
      const isAffected = affectedExisting.has(table.name.toLowerCase());
      const match = matchesByExisting.get(table.name.toLowerCase());
      
      // Skip if this existing table is matched to an import table (we'll show import node instead)
      if (isAffected && match) {
        return;
      }
      
      const nodeId = `existing-${table.name}`;
      const userPos = userPositionsRef.current.get(nodeId);
      const position = userPos || { x: EXISTING_COL_X, y: existingY };
      
      nodeList.push({
        id: nodeId,
        type: 'tableNode',
        position,
        data: {
          label: table.name,
          columns: table.columns.map(c => c.name),
          status: 'unaffected' as NodeStatus,
          isImport: false,
          hasChildren: false,
          hasParent: false,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
      });
      
      existingY += ROW_HEIGHT;
    });
    
    // Add edges for relationships
    relationships.forEach((rel) => {
      edgeList.push({
        id: `${rel.parentTable}-${rel.childTable}`,
        source: `import-${rel.parentTable}`,
        target: `import-${rel.childTable}`,
        type: 'smoothstep',
        animated: true,
        label: `FK: ${rel.childColumn}`,
        labelStyle: { fontSize: 9, fill: 'hsl(var(--muted-foreground))' },
        labelBgStyle: { fill: 'hsl(var(--background))' },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: 'hsl(var(--primary))',
        },
        style: { stroke: 'hsl(var(--primary))', strokeWidth: 1.5 },
      });
    });
    
    // Add edges for matched tables (import -> existing)
    tableMatches.forEach((match) => {
      if (match.existingTable && match.status !== 'new') {
        edgeList.push({
          id: `match-${match.importTable}-${match.existingTable}`,
          source: `import-${match.importTable}`,
          target: `existing-${match.existingTable}`,
          type: 'straight',
          animated: false,
          label: match.status === 'conflict' ? '⚠️ Conflict' : '→ Insert',
          labelStyle: { fontSize: 9, fill: match.status === 'conflict' ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))' },
          labelBgStyle: { fill: 'hsl(var(--background))' },
          style: { 
            stroke: match.status === 'conflict' ? 'hsl(var(--destructive))' : 'hsl(var(--primary))', 
            strokeWidth: 1.5,
            strokeDasharray: '5,5'
          },
        });
      }
    });
    
    return { initialNodes: nodeList, initialEdges: edgeList };
  }, [existingTables, importTables, relationships, tableMatches]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when props change, but preserve user positions
  useEffect(() => {
    if (!isInitializedRef.current) {
      // First render - use initial nodes directly
      setNodes(initialNodes);
      setEdges(initialEdges);
      isInitializedRef.current = true;
    } else {
      // Subsequent renders - merge with user positions
      setNodes(prevNodes => {
        // Save current user positions
        prevNodes.forEach(n => {
          userPositionsRef.current.set(n.id, n.position);
        });
        
        // Apply user positions to new nodes
        return initialNodes.map(newNode => {
          const userPos = userPositionsRef.current.get(newNode.id);
          if (userPos) {
            return { ...newNode, position: userPos };
          }
          return newNode;
        });
      });
      setEdges(initialEdges);
    }
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Track node position changes
  const handleNodesChange = useCallback((changes: any) => {
    onNodesChange(changes);
    
    // Update user positions for dragged nodes
    changes.forEach((change: any) => {
      if (change.type === 'position' && change.position) {
        userPositionsRef.current.set(change.id, change.position);
      }
    });
  }, [onNodesChange]);

  // Reset layout button handler
  const handleResetLayout = useCallback(() => {
    userPositionsRef.current.clear();
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const isImport = node.id.startsWith('import-');
    const tableName = node.id.replace(/^(import-|existing-)/, '');
    onTableClick?.(tableName, isImport);
  }, [onTableClick]);

  if (importTables.length === 0 && existingTables.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-muted-foreground h-full", className)}>
        No tables to display
      </div>
    );
  }

  return (
    <div ref={reactFlowWrapper} className={cn("w-full h-full border rounded-lg bg-background relative", className)}>
      {showLegend && (
        <div className="absolute top-2 left-2 z-10 flex gap-2 flex-wrap p-2 bg-background/90 rounded-lg border shadow-sm">
          <div className="flex items-center gap-1 text-xs">
            <div className="w-3 h-3 rounded border-2 border-green-500 bg-green-500/20" />
            <span>New</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <div className="w-3 h-3 rounded border-2 border-blue-500 bg-blue-500/20" />
            <span>Insert</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <div className="w-3 h-3 rounded border-2 border-amber-500 bg-amber-500/20" />
            <span>Conflict</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <div className="w-3 h-3 rounded border-2 border-muted-foreground/30 bg-muted/30" />
            <span>Existing</span>
          </div>
        </div>
      )}
      
      {/* Reset Layout Button */}
      <div className="absolute top-2 right-2 z-10">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetLayout}
                className="h-8 px-2 bg-background/90"
              >
                <LayoutGrid className="h-4 w-4 mr-1" />
                Reset Layout
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reset to automatic tree layout</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={1.5}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        attributionPosition="bottom-left"
      >
        <Background color="hsl(var(--muted))" gap={16} />
        <Controls className="bg-background border rounded" />
      </ReactFlow>
    </div>
  );
};

export default DatabaseErdView;
