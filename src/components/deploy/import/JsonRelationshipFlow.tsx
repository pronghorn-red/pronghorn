import React, { useMemo, useCallback } from 'react';
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
} from 'reactflow';
import 'reactflow/dist/style.css';
import { TableProperties, Key } from 'lucide-react';
import { ForeignKeyRelationship } from '@/utils/parseJson';

interface TableInfo {
  name: string;
  columns: string[];
  parentTable?: string;
  foreignKey?: string;
}

interface JsonRelationshipFlowProps {
  tables: TableInfo[];
  relationships?: ForeignKeyRelationship[];
  onTableClick?: (tableName: string) => void;
}

const TableNode = ({ data }: { data: { label: string; columns: string[]; isRoot: boolean; hasChildren: boolean; hasParent: boolean } }) => {
  return (
    <div className={`relative px-4 py-3 rounded-lg border-2 shadow-md min-w-[180px] ${
      data.isRoot 
        ? 'bg-primary/10 border-primary' 
        : 'bg-card border-border'
    }`}>
      {/* Target handle at top for incoming edges */}
      {data.hasParent && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-primary !border-2 !border-background"
        />
      )}
      
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
        <TableProperties className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">{data.label}</span>
        {data.isRoot && <Key className="h-3 w-3 text-amber-500" />}
      </div>
      <div className="space-y-1">
        {data.columns.slice(0, 6).map((col, i) => (
          <div key={i} className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            {col}
          </div>
        ))}
        {data.columns.length > 6 && (
          <div className="text-xs text-muted-foreground italic">
            +{data.columns.length - 6} more columns
          </div>
        )}
      </div>
      
      {/* Source handle at bottom for outgoing edges */}
      {data.hasChildren && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-primary !border-2 !border-background"
        />
      )}
    </div>
  );
};

const nodeTypes = {
  tableNode: TableNode,
};

export const JsonRelationshipFlow: React.FC<JsonRelationshipFlowProps> = ({
  tables,
  relationships = [],
  onTableClick,
}) => {
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodeList: Node[] = [];
    const edgeList: Edge[] = [];
    
    // Build parent-child relationships from both sources
    const parentChildMap = new Map<string, string>();
    
    // From table.parentTable property
    tables.forEach(table => {
      if (table.parentTable) {
        parentChildMap.set(table.name, table.parentTable);
      }
    });
    
    // From relationships array
    relationships.forEach(rel => {
      parentChildMap.set(rel.childTable, rel.parentTable);
    });
    
    // Find root tables (no parent)
    const rootTables = tables.filter(t => !parentChildMap.has(t.name));
    
    // Position nodes in a hierarchical layout
    const levelWidth = 280;
    const levelHeight = 180;
    
    // Track node positions by level
    const nodesByLevel: Map<number, string[]> = new Map();
    const nodeLevels: Map<string, number> = new Map();
    
    // Assign levels using BFS
    const assignLevel = (tableName: string, level: number) => {
      if (nodeLevels.has(tableName)) return;
      nodeLevels.set(tableName, level);
      
      if (!nodesByLevel.has(level)) {
        nodesByLevel.set(level, []);
      }
      nodesByLevel.get(level)!.push(tableName);
      
      // Find children
      tables.forEach(t => {
        if (parentChildMap.get(t.name) === tableName) {
          assignLevel(t.name, level + 1);
        }
      });
    };
    
    rootTables.forEach(t => assignLevel(t.name, 0));
    
    // Handle orphan tables (tables not in the hierarchy)
    tables.forEach(t => {
      if (!nodeLevels.has(t.name)) {
        assignLevel(t.name, 0);
      }
    });
    
    // Build sets for parent/child relationships
    const hasChildrenSet = new Set<string>();
    const hasParentSet = new Set<string>();
    
    parentChildMap.forEach((parentName, childName) => {
      hasChildrenSet.add(parentName);
      hasParentSet.add(childName);
    });
    
    // Position nodes based on their level
    nodesByLevel.forEach((tableNames, level) => {
      const totalWidth = (tableNames.length - 1) * levelWidth;
      const startX = -totalWidth / 2;
      
      tableNames.forEach((tableName, index) => {
        const table = tables.find(t => t.name === tableName);
        if (!table) return;
        
        nodeList.push({
          id: tableName,
          type: 'tableNode',
          position: { x: startX + index * levelWidth, y: level * levelHeight },
          data: {
            label: tableName,
            columns: table.columns,
            isRoot: level === 0,
            hasChildren: hasChildrenSet.has(tableName),
            hasParent: hasParentSet.has(tableName),
          },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          draggable: true,
        });
      });
    });
    
    // Create edges from relationships
    relationships.forEach((rel) => {
      edgeList.push({
        id: `${rel.parentTable}-${rel.childTable}`,
        source: rel.parentTable,
        target: rel.childTable,
        type: 'smoothstep',
        animated: true,
        label: `FK: ${rel.childColumn}`,
        labelStyle: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' },
        labelBgStyle: { fill: 'hsl(var(--background))' },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: 'hsl(var(--primary))',
        },
        style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
      });
    });
    
    // Also create edges from parentChildMap for tables without explicit relationships
    parentChildMap.forEach((parentName, childName) => {
      const existingEdge = edgeList.find(e => e.source === parentName && e.target === childName);
      if (!existingEdge) {
        edgeList.push({
          id: `${parentName}-${childName}`,
          source: parentName,
          target: childName,
          type: 'smoothstep',
          animated: true,
          label: '1:N',
          labelStyle: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' },
          labelBgStyle: { fill: 'hsl(var(--background))' },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'hsl(var(--primary))',
          },
          style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
        });
      }
    });
    
    return { initialNodes: nodeList, initialEdges: edgeList };
  }, [tables, relationships]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onTableClick?.(node.id);
  }, [onTableClick]);

  if (tables.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No table relationships to display
      </div>
    );
  }

  return (
    <div className="h-[400px] w-full border rounded-lg bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
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
