import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Table2,
  Eye,
  Copy,
  Code,
  Columns,
  Play,
  Trash2,
  Edit,
  FileCode,
  Download,
} from "lucide-react";

export type TreeItemContextType = 
  | 'table' 
  | 'view' 
  | 'function' 
  | 'trigger' 
  | 'index' 
  | 'sequence' 
  | 'type' 
  | 'constraint'
  | 'saved_query'
  | 'migration';

interface DatabaseTreeContextMenuProps {
  type: TreeItemContextType;
  schema: string;
  name: string;
  extra?: any;
  children: React.ReactNode;
  onShowFirst100?: (schema: string, name: string) => void;
  onViewStructure?: (schema: string, name: string) => void;
  onCopyName?: (name: string) => void;
  onGetDefinition?: (type: TreeItemContextType, schema: string, name: string, extra?: any) => void;
  onDropTable?: (schema: string, name: string) => void;
  onLoadQuery?: (query: any) => void;
  onEditQuery?: (query: any) => void;
  onDeleteQuery?: (query: any) => void;
  onLoadMigration?: (migration: any) => void;
  onDeleteMigration?: (migration: any) => void;
  onDownloadMigration?: (migration: any) => void;
}

export function DatabaseTreeContextMenu({
  type,
  schema,
  name,
  extra,
  children,
  onShowFirst100,
  onViewStructure,
  onCopyName,
  onGetDefinition,
  onDropTable,
  onLoadQuery,
  onEditQuery,
  onDeleteQuery,
  onLoadMigration,
  onDeleteMigration,
  onDownloadMigration,
}: DatabaseTreeContextMenuProps) {
  const handleCopyName = () => {
    const fullName = schema ? `"${schema}"."${name}"` : name;
    navigator.clipboard.writeText(fullName);
  };

  const handleCopySql = () => {
    if (extra?.sql_content) {
      navigator.clipboard.writeText(extra.sql_content);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {/* Table context menu */}
        {type === 'table' && (
          <>
            <ContextMenuItem onClick={() => onShowFirst100?.(schema, name)}>
              <Table2 className="h-4 w-4 mr-2" />
              Show First 100 Rows
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onViewStructure?.(schema, name)}>
              <Columns className="h-4 w-4 mr-2" />
              View Structure
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onGetDefinition?.(type, schema, name)}>
              <Code className="h-4 w-4 mr-2" />
              Get CREATE TABLE
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCopyName}>
              <Copy className="h-4 w-4 mr-2" />
              Copy Table Name
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem 
              onClick={() => onDropTable?.(schema, name)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Drop Table
            </ContextMenuItem>
          </>
        )}

        {/* View context menu */}
        {type === 'view' && (
          <>
            <ContextMenuItem onClick={() => onShowFirst100?.(schema, name)}>
              <Eye className="h-4 w-4 mr-2" />
              SELECT * FROM View
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onGetDefinition?.(type, schema, name)}>
              <Code className="h-4 w-4 mr-2" />
              Get View Definition
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCopyName}>
              <Copy className="h-4 w-4 mr-2" />
              Copy View Name
            </ContextMenuItem>
          </>
        )}

        {/* Function context menu */}
        {type === 'function' && (
          <>
            <ContextMenuItem onClick={() => onGetDefinition?.(type, schema, name)}>
              <Code className="h-4 w-4 mr-2" />
              Get Function Definition
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCopyName}>
              <Copy className="h-4 w-4 mr-2" />
              Copy Function Name
            </ContextMenuItem>
          </>
        )}

        {/* Trigger context menu */}
        {type === 'trigger' && (
          <>
            <ContextMenuItem onClick={() => onGetDefinition?.(type, schema, name, extra)}>
              <Code className="h-4 w-4 mr-2" />
              Get Trigger Definition
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCopyName}>
              <Copy className="h-4 w-4 mr-2" />
              Copy Trigger Name
            </ContextMenuItem>
          </>
        )}

        {/* Index context menu */}
        {type === 'index' && (
          <>
            <ContextMenuItem onClick={() => onGetDefinition?.(type, schema, name, extra)}>
              <Code className="h-4 w-4 mr-2" />
              Copy Index Definition
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCopyName}>
              <Copy className="h-4 w-4 mr-2" />
              Copy Index Name
            </ContextMenuItem>
          </>
        )}

        {/* Sequence context menu */}
        {type === 'sequence' && (
          <>
            <ContextMenuItem onClick={() => onGetDefinition?.(type, schema, name)}>
              <Code className="h-4 w-4 mr-2" />
              Get Sequence Info
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCopyName}>
              <Copy className="h-4 w-4 mr-2" />
              Copy Sequence Name
            </ContextMenuItem>
          </>
        )}

        {/* Type context menu */}
        {type === 'type' && (
          <>
            <ContextMenuItem onClick={() => onGetDefinition?.(type, schema, name, extra)}>
              <Code className="h-4 w-4 mr-2" />
              Get Type Definition
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCopyName}>
              <Copy className="h-4 w-4 mr-2" />
              Copy Type Name
            </ContextMenuItem>
          </>
        )}

        {/* Constraint context menu */}
        {type === 'constraint' && (
          <>
            <ContextMenuItem onClick={() => onGetDefinition?.(type, schema, name, extra)}>
              <Code className="h-4 w-4 mr-2" />
              Get Constraint Definition
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCopyName}>
              <Copy className="h-4 w-4 mr-2" />
              Copy Constraint Name
            </ContextMenuItem>
          </>
        )}

        {/* Saved query context menu */}
        {type === 'saved_query' && (
          <>
            <ContextMenuItem onClick={() => onLoadQuery?.(extra)}>
              <Play className="h-4 w-4 mr-2" />
              Load Query
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onEditQuery?.(extra)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Query
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem 
              onClick={() => onDeleteQuery?.(extra)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Query
            </ContextMenuItem>
          </>
        )}

        {/* Migration context menu */}
        {type === 'migration' && (
          <>
            <ContextMenuItem onClick={() => onLoadMigration?.(extra)}>
              <Play className="h-4 w-4 mr-2" />
              Load into Editor
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCopySql}>
              <Copy className="h-4 w-4 mr-2" />
              Copy SQL
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onDownloadMigration?.(extra)}>
              <Download className="h-4 w-4 mr-2" />
              Download as .sql
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem 
              onClick={() => onDeleteMigration?.(extra)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Migration
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
