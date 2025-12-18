import React, { useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MarkerType,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { TableProperties } from 'lucide-react';

interface TableInfo {
  name: string;
  columns: string[];
  parentTable?: string;
  foreignKey?: string;
}

interface JsonRelationshipFlowProps {
  tables: TableInfo[];
  onTableClick?: (tableName: string) => void;
}

const TableNode = ({ data }: { data: { label: string; columns: string[]; isRoot: boolean } }) => {
  return (
    <div className={`px-4 py-3 rounded-lg border-2 shadow-md min-w-[180px] ${
      data.isRoot 
        ? 'bg-primary/10 border-primary' 
        : 'bg-card border-border'
    }`}>
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
        <TableProperties className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">{data.label}</span>
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
    </div>
  );
};

const nodeTypes = {
  tableNode: TableNode,
};

export const JsonRelationshipFlow: React.FC<JsonRelationshipFlowProps> = ({
  tables,
  onTableClick,
}) => {
  const { nodes, edges } = useMemo(() => {
    const nodeList: Node[] = [];
    const edgeList: Edge[] = [];
    
    // Find root tables (no parent)
    const rootTables = tables.filter(t => !t.parentTable);
    const childTables = tables.filter(t => t.parentTable);
    
    // Position nodes in a hierarchical layout
    const levelWidth = 280;
    const levelHeight = 150;
    
    // Position root tables
    rootTables.forEach((table, index) => {
      nodeList.push({
        id: table.name,
        type: 'tableNode',
        position: { x: index * levelWidth, y: 0 },
        data: {
          label: table.name,
          columns: table.columns,
          isRoot: true,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      });
    });
    
    // Group children by parent
    const childrenByParent: Record<string, TableInfo[]> = {};
    childTables.forEach(table => {
      if (table.parentTable) {
        if (!childrenByParent[table.parentTable]) {
          childrenByParent[table.parentTable] = [];
        }
        childrenByParent[table.parentTable].push(table);
      }
    });
    
    // Position child tables and create edges
    let currentY = levelHeight;
    Object.entries(childrenByParent).forEach(([parentName, children]) => {
      const parentNode = nodeList.find(n => n.id === parentName);
      const parentX = parentNode?.position.x || 0;
      
      children.forEach((table, index) => {
        const offsetX = (index - (children.length - 1) / 2) * levelWidth;
        
        nodeList.push({
          id: table.name,
          type: 'tableNode',
          position: { x: parentX + offsetX, y: currentY },
          data: {
            label: table.name,
            columns: table.columns,
            isRoot: false,
          },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
        });
        
        // Create edge from parent to child
        edgeList.push({
          id: `${parentName}-${table.name}`,
          source: parentName,
          target: table.name,
          type: 'smoothstep',
          animated: true,
          label: table.foreignKey ? `FK: ${table.foreignKey}` : '1:N',
          labelStyle: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' },
          labelBgStyle: { fill: 'hsl(var(--background))' },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'hsl(var(--primary))',
          },
          style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
        });
      });
      
      currentY += levelHeight;
    });
    
    return { nodes: nodeList, edges: edgeList };
  }, [tables]);

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
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onTableClick?.(node.id)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={1.5}
        attributionPosition="bottom-left"
      >
        <Background color="hsl(var(--muted))" gap={16} />
        <Controls className="bg-background border rounded" />
      </ReactFlow>
    </div>
  );
};
