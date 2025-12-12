import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  ChevronRight, 
  ChevronDown, 
  Database,
  Table2,
  Eye,
  Columns3,
  Key,
  Hash,
  Loader2,
  FunctionSquare,
  Zap,
  List,
  FileText,
  History
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DatabaseSchemaSelectorProps {
  projectId: string;
  shareToken: string | null;
  selectedDatabaseItems: Set<string>;
  onSelectionChange: (selectedItems: Set<string>) => void;
  includeSampleData: boolean;
  onIncludeSampleDataChange: (include: boolean) => void;
  sampleDataRows: number;
  onSampleDataRowsChange: (rows: number) => void;
}

interface DatabaseInfo {
  id: string;
  name: string;
  render_postgres_id: string | null;
  status: string;
}

interface SchemaObject {
  name: string;
  type: 'table' | 'view' | 'function' | 'trigger' | 'index' | 'sequence' | 'type';
  table?: string; // For triggers/indexes
  columns?: Array<{ name: string; type: string; nullable: boolean }>;
}

interface SchemaInfo {
  name: string;
  tables: SchemaObject[];
  views: SchemaObject[];
  functions: SchemaObject[];
  triggers: SchemaObject[];
  indexes: SchemaObject[];
  sequences: SchemaObject[];
  types: SchemaObject[];
}

interface SavedQueryInfo {
  id: string;
  name: string;
  description?: string;
  sql_content: string;
}

interface MigrationInfo {
  id: string;
  sequence_number: number;
  name: string;
  sql_content: string;
  statement_type: string;
  object_type: string;
}

interface DatabaseSchema {
  database: DatabaseInfo;
  schemas: SchemaInfo[];
  savedQueries: SavedQueryInfo[];
  migrations: MigrationInfo[];
  loading: boolean;
  error: string | null;
}

// Generate unique key for each item: databaseId:schema:type:name or databaseId:savedQuery:id or databaseId:migration:id
export const getItemKey = (databaseId: string, schemaName: string, type: string, name: string) => 
  `${databaseId}:${schemaName}:${type}:${name}`;

export const parseItemKey = (key: string) => {
  const parts = key.split(':');
  return {
    databaseId: parts[0],
    schemaName: parts[1],
    type: parts[2],
    name: parts.slice(3).join(':') // Handle names with colons
  };
};

export function DatabaseSchemaSelector({
  projectId,
  shareToken,
  selectedDatabaseItems,
  onSelectionChange,
  includeSampleData,
  onIncludeSampleDataChange,
  sampleDataRows,
  onSampleDataRowsChange
}: DatabaseSchemaSelectorProps) {
  const [loading, setLoading] = useState(true);
  const [databases, setDatabases] = useState<DatabaseSchema[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [allItemKeys, setAllItemKeys] = useState<string[]>([]);

  useEffect(() => {
    loadDatabases();
  }, [projectId, shareToken]);

  const loadDatabases = async () => {
    if (!projectId) return;
    setLoading(true);

    try {
      // Get project databases
      const { data: dbData, error } = await supabase.rpc("get_databases_with_token", {
        p_project_id: projectId,
        p_token: shareToken
      });

      if (error) throw error;

      // Filter to only available databases
      const availableDbs = (dbData || []).filter(
        (db: any) => db.status === 'available' && db.render_postgres_id
      );

      if (availableDbs.length === 0) {
        setDatabases([]);
        setLoading(false);
        return;
      }

      // Initialize databases with loading state
      const initialDbs: DatabaseSchema[] = availableDbs.map((db: any) => ({
        database: db,
        schemas: [],
        savedQueries: [],
        migrations: [],
        loading: true,
        error: null
      }));
      setDatabases(initialDbs);

      // Fetch schemas, saved queries, and migrations for each database
      const updatedDbs = await Promise.all(
        availableDbs.map(async (db: any) => {
          try {
            // Fetch schema, saved queries, and migrations in parallel
            const [schemaResponse, savedQueriesResult, migrationsResult] = await Promise.all([
              supabase.functions.invoke("manage-database", {
                body: {
                  databaseId: db.id,
                  shareToken,
                  action: "get_schema",
                },
              }),
              supabase.rpc("get_saved_queries_with_token", {
                p_database_id: db.id,
                p_token: shareToken,
              }),
              supabase.rpc("get_migrations_with_token", {
                p_database_id: db.id,
                p_token: shareToken,
              }),
            ]);

            if (schemaResponse.error) throw schemaResponse.error;

            // Edge function wraps result as { success, data }
            const schemaEnvelope = schemaResponse.data as { success?: boolean; data?: any } | null;
            const schemaData = schemaEnvelope && "data" in schemaEnvelope
              ? (schemaEnvelope.data ?? {})
              : (schemaEnvelope ?? {});

            const schemas: SchemaInfo[] = [];

            // Process the schemas array from the response
            // The response format is: { schemas: [{ name, tables: string[], views: string[], ... }] }
            (schemaData.schemas || []).forEach((s: any) => {
              const schemaInfo: SchemaInfo = {
                name: s.name,
                tables: (s.tables || []).map((name: string) => ({ name, type: 'table' as const })),
                views: (s.views || []).map((name: string) => ({ name, type: 'view' as const })),
                functions: (s.functions || []).map((name: string) => ({ name, type: 'function' as const })),
                triggers: (s.triggers || []).map((t: any) => ({ 
                  name: typeof t === 'string' ? t : t.name, 
                  type: 'trigger' as const,
                  table: typeof t === 'object' ? t.table : undefined 
                })),
                indexes: (s.indexes || []).map((i: any) => ({ 
                  name: typeof i === 'string' ? i : i.name, 
                  type: 'index' as const,
                  table: typeof i === 'object' ? i.table : undefined 
                })),
                sequences: (s.sequences || []).map((name: string) => ({ name, type: 'sequence' as const })),
                types: (s.types || []).map((t: any) => ({ 
                  name: typeof t === 'string' ? t : t.name, 
                  type: 'type' as const 
                }))
              };
              schemas.push(schemaInfo);
            });

            // Sort schemas with 'public' first
            schemas.sort((a, b) => 
              a.name === 'public' ? -1 : b.name === 'public' ? 1 : a.name.localeCompare(b.name)
            );

            // Process saved queries
            const savedQueries: SavedQueryInfo[] = (savedQueriesResult.data || []).map((q: any) => ({
              id: q.id,
              name: q.name,
              description: q.description,
              sql_content: q.sql_content
            }));

            // Process migrations
            const migrations: MigrationInfo[] = (migrationsResult.data || []).map((m: any) => ({
              id: m.id,
              sequence_number: m.sequence_number,
              name: m.name,
              sql_content: m.sql_content,
              statement_type: m.statement_type,
              object_type: m.object_type
            }));

            return {
              database: db,
              schemas,
              savedQueries,
              migrations,
              loading: false,
              error: null
            };
          } catch (err: any) {
            console.error(`Error loading schema for ${db.name}:`, err);
            return {
              database: db,
              schemas: [],
              savedQueries: [],
              migrations: [],
              loading: false,
              error: err.message || 'Failed to load schema'
            };
          }
        })
      );

      setDatabases(updatedDbs);

      // Collect all selectable item keys
      const allKeys: string[] = [];
      updatedDbs.forEach(db => {
        // Add saved queries
        db.savedQueries.forEach(q => allKeys.push(getItemKey(db.database.id, 'savedQuery', 'savedQuery', q.id)));
        // Add migrations
        db.migrations.forEach(m => allKeys.push(getItemKey(db.database.id, 'migration', 'migration', m.id)));
        // Add schema objects
        db.schemas.forEach(schema => {
          schema.tables.forEach(t => allKeys.push(getItemKey(db.database.id, schema.name, 'table', t.name)));
          schema.views.forEach(v => allKeys.push(getItemKey(db.database.id, schema.name, 'view', v.name)));
          schema.functions.forEach(f => allKeys.push(getItemKey(db.database.id, schema.name, 'function', f.name)));
          schema.triggers.forEach(t => allKeys.push(getItemKey(db.database.id, schema.name, 'trigger', t.name)));
          schema.indexes.forEach(i => allKeys.push(getItemKey(db.database.id, schema.name, 'index', i.name)));
          schema.sequences.forEach(s => allKeys.push(getItemKey(db.database.id, schema.name, 'sequence', s.name)));
          schema.types.forEach(t => allKeys.push(getItemKey(db.database.id, schema.name, 'type', t.name)));
        });
      });
      setAllItemKeys(allKeys);

      // Auto-expand first database
      if (updatedDbs.length > 0) {
        setExpandedNodes(new Set([updatedDbs[0].database.id]));
      }
    } catch (error) {
      console.error("Error loading databases:", error);
      toast.error("Failed to load databases");
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const toggleItem = (key: string) => {
    const newSelected = new Set(selectedDatabaseItems);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    onSelectionChange(newSelected);
  };

  const getItemsInFolder = (databaseId: string, schemaName?: string, type?: string): string[] => {
    return allItemKeys.filter(key => {
      const parsed = parseItemKey(key);
      if (parsed.databaseId !== databaseId) return false;
      if (schemaName && parsed.schemaName !== schemaName) return false;
      if (type && parsed.type !== type) return false;
      return true;
    });
  };

  const getFolderSelectionState = (databaseId: string, schemaName?: string, type?: string): 'checked' | 'unchecked' | 'indeterminate' => {
    const items = getItemsInFolder(databaseId, schemaName, type);
    if (items.length === 0) return 'unchecked';
    
    const selectedCount = items.filter(key => selectedDatabaseItems.has(key)).length;
    if (selectedCount === 0) return 'unchecked';
    if (selectedCount === items.length) return 'checked';
    return 'indeterminate';
  };

  const toggleFolder = (databaseId: string, schemaName?: string, type?: string) => {
    const items = getItemsInFolder(databaseId, schemaName, type);
    const state = getFolderSelectionState(databaseId, schemaName, type);
    
    const newSelected = new Set(selectedDatabaseItems);
    if (state === 'checked') {
      items.forEach(key => newSelected.delete(key));
    } else {
      items.forEach(key => newSelected.add(key));
    }
    onSelectionChange(newSelected);
  };

  const handleSelectAll = () => {
    onSelectionChange(new Set(allItemKeys));
  };

  const handleSelectNone = () => {
    onSelectionChange(new Set());
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'table': return <Table2 className="h-4 w-4 text-blue-500" />;
      case 'view': return <Eye className="h-4 w-4 text-purple-500" />;
      case 'function': return <FunctionSquare className="h-4 w-4 text-green-500" />;
      case 'trigger': return <Zap className="h-4 w-4 text-yellow-500" />;
      case 'index': return <Key className="h-4 w-4 text-orange-500" />;
      case 'sequence': return <Hash className="h-4 w-4 text-cyan-500" />;
      case 'type': return <List className="h-4 w-4 text-pink-500" />;
      case 'savedQuery': return <FileText className="h-4 w-4 text-emerald-500" />;
      case 'migration': return <History className="h-4 w-4 text-amber-500" />;
      default: return <Columns3 className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const renderTypeCategory = (
    databaseId: string,
    schemaName: string,
    type: string,
    items: SchemaObject[],
    label: string,
    depth: number
  ) => {
    if (items.length === 0) return null;
    
    const nodeId = `${databaseId}:${schemaName}:${type}`;
    const isExpanded = expandedNodes.has(nodeId);
    const selectionState = getFolderSelectionState(databaseId, schemaName, type);
    const paddingLeft = depth * 16 + 4;

    return (
      <div key={nodeId}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-accent/50 rounded-sm cursor-pointer group"
          style={{ paddingLeft }}
        >
          <button
            onClick={() => toggleExpanded(nodeId)}
            className="p-0.5 hover:bg-accent rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <Checkbox
            checked={selectionState === 'checked' ? true : selectionState === 'indeterminate' ? 'indeterminate' : false}
            onCheckedChange={() => toggleFolder(databaseId, schemaName, type)}
            className="data-[state=indeterminate]:bg-primary/50"
          />
          {getTypeIcon(type)}
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground ml-auto opacity-0 group-hover:opacity-100">
            {items.length}
          </span>
        </div>
        {isExpanded && (
          <div>
            {items.map(item => {
              const itemKey = getItemKey(databaseId, schemaName, type, item.name);
              const isSelected = selectedDatabaseItems.has(itemKey);
              return (
                <div
                  key={itemKey}
                  className={cn(
                    "flex items-center gap-2 py-1.5 px-2 hover:bg-accent/50 rounded-sm cursor-pointer",
                    isSelected && "bg-accent/30"
                  )}
                  style={{ paddingLeft: paddingLeft + 24 }}
                  onClick={() => toggleItem(itemKey)}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleItem(itemKey)}
                  />
                  {getTypeIcon(type)}
                  <span className="text-sm truncate">{item.name}</span>
                  {item.table && (
                    <span className="text-xs text-muted-foreground">on {item.table}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderSavedQueries = (databaseId: string, savedQueries: SavedQueryInfo[], depth: number) => {
    if (savedQueries.length === 0) return null;
    
    const nodeId = `${databaseId}:savedQueries`;
    const isExpanded = expandedNodes.has(nodeId);
    const selectionState = getFolderSelectionState(databaseId, 'savedQuery', 'savedQuery');
    const paddingLeft = depth * 16 + 4;

    return (
      <div key={nodeId}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-accent/50 rounded-sm cursor-pointer group"
          style={{ paddingLeft }}
        >
          <button
            onClick={() => toggleExpanded(nodeId)}
            className="p-0.5 hover:bg-accent rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <Checkbox
            checked={selectionState === 'checked' ? true : selectionState === 'indeterminate' ? 'indeterminate' : false}
            onCheckedChange={() => toggleFolder(databaseId, 'savedQuery', 'savedQuery')}
            className="data-[state=indeterminate]:bg-primary/50"
          />
          <FileText className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-medium">Saved Queries</span>
          <span className="text-xs text-muted-foreground ml-auto opacity-0 group-hover:opacity-100">
            {savedQueries.length}
          </span>
        </div>
        {isExpanded && (
          <div>
            {savedQueries.map(query => {
              const itemKey = getItemKey(databaseId, 'savedQuery', 'savedQuery', query.id);
              const isSelected = selectedDatabaseItems.has(itemKey);
              return (
                <div
                  key={itemKey}
                  className={cn(
                    "flex items-center gap-2 py-1.5 px-2 hover:bg-accent/50 rounded-sm cursor-pointer",
                    isSelected && "bg-accent/30"
                  )}
                  style={{ paddingLeft: paddingLeft + 24 }}
                  onClick={() => toggleItem(itemKey)}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleItem(itemKey)}
                  />
                  <FileText className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm truncate">{query.name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderMigrations = (databaseId: string, migrations: MigrationInfo[], depth: number) => {
    if (migrations.length === 0) return null;
    
    const nodeId = `${databaseId}:migrations`;
    const isExpanded = expandedNodes.has(nodeId);
    const selectionState = getFolderSelectionState(databaseId, 'migration', 'migration');
    const paddingLeft = depth * 16 + 4;

    return (
      <div key={nodeId}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-accent/50 rounded-sm cursor-pointer group"
          style={{ paddingLeft }}
        >
          <button
            onClick={() => toggleExpanded(nodeId)}
            className="p-0.5 hover:bg-accent rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <Checkbox
            checked={selectionState === 'checked' ? true : selectionState === 'indeterminate' ? 'indeterminate' : false}
            onCheckedChange={() => toggleFolder(databaseId, 'migration', 'migration')}
            className="data-[state=indeterminate]:bg-primary/50"
          />
          <History className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium">Migrations</span>
          <span className="text-xs text-muted-foreground ml-auto opacity-0 group-hover:opacity-100">
            {migrations.length}
          </span>
        </div>
        {isExpanded && (
          <div>
            {migrations.map(migration => {
              const itemKey = getItemKey(databaseId, 'migration', 'migration', migration.id);
              const isSelected = selectedDatabaseItems.has(itemKey);
              return (
                <div
                  key={itemKey}
                  className={cn(
                    "flex items-center gap-2 py-1.5 px-2 hover:bg-accent/50 rounded-sm cursor-pointer",
                    isSelected && "bg-accent/30"
                  )}
                  style={{ paddingLeft: paddingLeft + 24 }}
                  onClick={() => toggleItem(itemKey)}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleItem(itemKey)}
                  />
                  <History className="h-4 w-4 text-amber-500" />
                  <span className="text-sm truncate">{migration.name || `${migration.sequence_number}_${migration.statement_type}`}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderSchema = (databaseId: string, schema: SchemaInfo, depth: number) => {
    const nodeId = `${databaseId}:${schema.name}`;
    const isExpanded = expandedNodes.has(nodeId);
    const selectionState = getFolderSelectionState(databaseId, schema.name);
    const paddingLeft = depth * 16 + 4;

    const totalItems = 
      schema.tables.length + 
      schema.views.length + 
      schema.functions.length +
      schema.triggers.length +
      schema.indexes.length +
      schema.sequences.length +
      schema.types.length;

    return (
      <div key={nodeId}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-accent/50 rounded-sm cursor-pointer group"
          style={{ paddingLeft }}
        >
          <button
            onClick={() => toggleExpanded(nodeId)}
            className="p-0.5 hover:bg-accent rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <Checkbox
            checked={selectionState === 'checked' ? true : selectionState === 'indeterminate' ? 'indeterminate' : false}
            onCheckedChange={() => toggleFolder(databaseId, schema.name)}
            className="data-[state=indeterminate]:bg-primary/50"
          />
          <Columns3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{schema.name}</span>
          <span className="text-xs text-muted-foreground ml-auto opacity-0 group-hover:opacity-100">
            {totalItems} items
          </span>
        </div>
        {isExpanded && (
          <div>
            {renderTypeCategory(databaseId, schema.name, 'table', schema.tables, 'Tables', depth + 1)}
            {renderTypeCategory(databaseId, schema.name, 'view', schema.views, 'Views', depth + 1)}
            {renderTypeCategory(databaseId, schema.name, 'function', schema.functions, 'Functions', depth + 1)}
            {renderTypeCategory(databaseId, schema.name, 'trigger', schema.triggers, 'Triggers', depth + 1)}
            {renderTypeCategory(databaseId, schema.name, 'index', schema.indexes, 'Indexes', depth + 1)}
            {renderTypeCategory(databaseId, schema.name, 'sequence', schema.sequences, 'Sequences', depth + 1)}
            {renderTypeCategory(databaseId, schema.name, 'type', schema.types, 'Types', depth + 1)}
          </div>
        )}
      </div>
    );
  };

  const renderDatabase = (dbSchema: DatabaseSchema) => {
    const { database, schemas, savedQueries, migrations, loading: dbLoading, error } = dbSchema;
    const isExpanded = expandedNodes.has(database.id);
    const selectionState = getFolderSelectionState(database.id);

    return (
      <div key={database.id}>
        <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-accent/50 rounded-sm cursor-pointer group">
          <button
            onClick={() => toggleExpanded(database.id)}
            className="p-0.5 hover:bg-accent rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <Checkbox
            checked={selectionState === 'checked' ? true : selectionState === 'indeterminate' ? 'indeterminate' : false}
            onCheckedChange={() => toggleFolder(database.id)}
            className="data-[state=indeterminate]:bg-primary/50"
            disabled={dbLoading || !!error}
          />
          <Database className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium truncate">{database.name}</span>
          {dbLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          {error && <span className="text-xs text-destructive ml-2">Error</span>}
          <span className="text-xs text-muted-foreground ml-auto opacity-0 group-hover:opacity-100">
            {schemas.length} schemas
          </span>
        </div>
        {isExpanded && (
          <div>
            {dbLoading ? (
              <div className="flex items-center gap-2 py-2 px-4" style={{ paddingLeft: 36 }}>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading schema...</span>
              </div>
            ) : error ? (
              <div className="py-2 px-4 text-sm text-destructive" style={{ paddingLeft: 36 }}>
                {error}
              </div>
            ) : schemas.length === 0 && savedQueries.length === 0 && migrations.length === 0 ? (
              <div className="py-2 px-4 text-sm text-muted-foreground" style={{ paddingLeft: 36 }}>
                No schemas found
              </div>
            ) : (
              <>
                {renderSavedQueries(database.id, savedQueries, 1)}
                {renderMigrations(database.id, migrations, 1)}
                {schemas.map(schema => renderSchema(database.id, schema, 1))}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading databases...</span>
      </div>
    );
  }

  if (databases.length === 0) {
    return (
      <div className="text-center py-8">
        <Database className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No databases available.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Create a database in the Deploy section to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleSelectAll}>
          Select All
        </Button>
        <Button variant="outline" size="sm" onClick={handleSelectNone}>
          Select None
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {selectedDatabaseItems.size} of {allItemKeys.length} items selected
        </span>
      </div>

      <ScrollArea className="h-[350px] border rounded-md">
        <div className="p-2">
          {databases.map(db => renderDatabase(db))}
        </div>
      </ScrollArea>

      {/* Sample Data Options */}
      <div className="border rounded-md p-3 space-y-3 bg-muted/30">
        <div className="flex items-center gap-2">
          <Checkbox
            id="includeSampleData"
            checked={includeSampleData}
            onCheckedChange={(checked) => onIncludeSampleDataChange(!!checked)}
          />
          <Label htmlFor="includeSampleData" className="text-sm cursor-pointer">
            Include sample data for selected tables
          </Label>
        </div>
        {includeSampleData && (
          <div className="flex items-center gap-2 pl-6">
            <Label htmlFor="sampleRows" className="text-xs text-muted-foreground">
              Rows per table:
            </Label>
            <Input
              id="sampleRows"
              type="number"
              min={1}
              max={100}
              value={sampleDataRows}
              onChange={(e) => onSampleDataRowsChange(Math.max(1, Math.min(100, parseInt(e.target.value) || 5)))}
              className="w-20 h-8 text-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
}
