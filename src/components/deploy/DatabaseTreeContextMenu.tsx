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
  | 'migration'
  | 'category_tables'
  | 'category_views'
  | 'category_functions'
  | 'category_triggers'
  | 'category_indexes'
  | 'category_sequences'
  | 'category_types'
  | 'category_constraints';

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
  // Delete all handlers
  onDropAllTables?: (schema: string, tables: string[]) => void;
  onDropAllViews?: (schema: string, views: string[]) => void;
  onDropAllFunctions?: (schema: string, functions: string[]) => void;
  onDropAllTriggers?: (schema: string, triggers: { name: string; table: string }[]) => void;
  onDropAllIndexes?: (schema: string, indexes: { name: string; table: string }[]) => void;
  onDropAllSequences?: (schema: string, sequences: string[]) => void;
  onDropAllTypes?: (schema: string, types: { name: string }[]) => void;
  onDropAllConstraints?: (schema: string, constraints: { name: string; table: string }[]) => void;
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
  onDropAllTables,
  onDropAllViews,
  onDropAllFunctions,
  onDropAllTriggers,
  onDropAllIndexes,
  onDropAllSequences,
  onDropAllTypes,
  onDropAllConstraints,
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

        {/* Category: Tables - Delete All */}
        {type === 'category_tables' && extra?.items?.length > 0 && (
          <ContextMenuItem 
            onClick={() => onDropAllTables?.(schema, extra.items)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Drop All Tables ({extra.items.length})
          </ContextMenuItem>
        )}

        {/* Category: Views - Delete All */}
        {type === 'category_views' && extra?.items?.length > 0 && (
          <ContextMenuItem 
            onClick={() => onDropAllViews?.(schema, extra.items)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Drop All Views ({extra.items.length})
          </ContextMenuItem>
        )}

        {/* Category: Functions - Delete All */}
        {type === 'category_functions' && extra?.items?.length > 0 && (
          <ContextMenuItem 
            onClick={() => onDropAllFunctions?.(schema, extra.items)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Drop All Functions ({extra.items.length})
          </ContextMenuItem>
        )}

        {/* Category: Triggers - Delete All */}
        {type === 'category_triggers' && extra?.items?.length > 0 && (
          <ContextMenuItem 
            onClick={() => onDropAllTriggers?.(schema, extra.items)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Drop All Triggers ({extra.items.length})
          </ContextMenuItem>
        )}

        {/* Category: Indexes - Delete All */}
        {type === 'category_indexes' && extra?.items?.length > 0 && (
          <ContextMenuItem 
            onClick={() => onDropAllIndexes?.(schema, extra.items)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Drop All Indexes ({extra.items.length})
          </ContextMenuItem>
        )}

        {/* Category: Sequences - Delete All */}
        {type === 'category_sequences' && extra?.items?.length > 0 && (
          <ContextMenuItem 
            onClick={() => onDropAllSequences?.(schema, extra.items)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Drop All Sequences ({extra.items.length})
          </ContextMenuItem>
        )}

        {/* Category: Types - Delete All */}
        {type === 'category_types' && extra?.items?.length > 0 && (
          <ContextMenuItem 
            onClick={() => onDropAllTypes?.(schema, extra.items)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Drop All Types ({extra.items.length})
          </ContextMenuItem>
        )}

        {/* Category: Constraints - Delete All */}
        {type === 'category_constraints' && extra?.items?.length > 0 && (
          <ContextMenuItem 
            onClick={() => onDropAllConstraints?.(schema, extra.items)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Drop All Constraints ({extra.items.length})
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
