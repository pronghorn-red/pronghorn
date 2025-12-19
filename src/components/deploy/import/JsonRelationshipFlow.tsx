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
  relationships = [],
  onTableClick,
}) => {
  const { nodes, edges } = useMemo(() => {
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
    const childTables = tables.filter(t => parentChildMap.has(t.name));
    
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
          },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
        });
      });
    });
    
    // Create edges
    parentChildMap.forEach((parentName, childName) => {
      const rel = relationships.find(r => r.childTable === childName && r.parentTable === parentName);
      const fkLabel = rel ? `FK: ${rel.childColumn}` : '1:N';
      
      edgeList.push({
        id: `${parentName}-${childName}`,
        source: parentName,
        target: childName,
        type: 'smoothstep',
        animated: true,
        label: fkLabel,
        labelStyle: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' },
        labelBgStyle: { fill: 'hsl(var(--background))' },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: 'hsl(var(--primary))',
        },
        style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
      });
    });
    
    return { nodes: nodeList, edges: edgeList };
  }, [tables, relationships]);

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
