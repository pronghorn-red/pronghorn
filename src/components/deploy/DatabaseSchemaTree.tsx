import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown, Table2, Eye, Zap, Clock, Search, Hash, KeyRound, Type, FolderClosed, Database, FileCode, Bookmark, GitBranch, Download, Copy } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DatabaseTreeContextMenu, TreeItemContextType } from "./DatabaseTreeContextMenu";

interface SchemaInfo {
  name: string;
  tables: string[];
  views: string[];
  functions: string[];
  procedures: string[];
  triggers: { name: string; table: string }[];
  indexes: { name: string; table: string; definition: string }[];
  sequences: string[];
  types: { name: string; type: string }[];
  constraints: { name: string; table: string; type: string }[];
}

interface SavedQuery {
  id: string;
  name: string;
  description?: string;
  sql_content: string;
}

export interface Migration {
  id: string;
  sequence_number: number;
  name: string;
  sql_content: string;
  statement_type: string;
  object_type: string;
  object_schema?: string;
  object_name?: string;
  executed_at: string;
}

interface DatabaseSchemaTreeProps {
  schemas: SchemaInfo[];
  savedQueries?: SavedQuery[];
  migrations?: Migration[];
  loading?: boolean;
  onTableSelect?: (schema: string, table: string) => void;
  onViewSelect?: (schema: string, view: string) => void;
  onItemClick?: (type: string, schema: string, name: string, extra?: any) => void;
  onShowFirst100?: (schema: string, name: string) => void;
  onViewStructure?: (schema: string, name: string) => void;
  onGetDefinition?: (type: TreeItemContextType, schema: string, name: string, extra?: any) => void;
  onDropTable?: (schema: string, name: string) => void;
  onLoadQuery?: (query: SavedQuery) => void;
  onEditQuery?: (query: SavedQuery) => void;
  onDeleteQuery?: (query: SavedQuery) => void;
  onLoadMigration?: (migration: Migration) => void;
  onDeleteMigration?: (migration: Migration) => void;
  onDownloadMigration?: (migration: Migration) => void;
  onDownloadAllMigrations?: () => void;
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

type TreeItemType = 'schema' | 'category' | 'table' | 'view' | 'function' | 'trigger' | 'index' | 'sequence' | 'type' | 'constraint' | 'saved_query' | 'migration' | 'category_tables' | 'category_views' | 'category_functions' | 'category_triggers' | 'category_indexes' | 'category_sequences' | 'category_types' | 'category_constraints';

interface TreeItemProps {
  label: string;
  type: TreeItemType;
  icon: React.ReactNode;
  level: number;
  count?: number;
  children?: React.ReactNode;
  onClick?: () => void;
  onContextAction?: () => void;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  schema?: string;
  name?: string;
  extra?: any;
  contextMenuProps?: {
    onShowFirst100?: (schema: string, name: string) => void;
    onViewStructure?: (schema: string, name: string) => void;
    onGetDefinition?: (type: TreeItemContextType, schema: string, name: string, extra?: any) => void;
    onDropTable?: (schema: string, name: string) => void;
    onLoadQuery?: (query: any) => void;
    onEditQuery?: (query: any) => void;
    onDeleteQuery?: (query: any) => void;
    onLoadMigration?: (migration: any) => void;
    onDeleteMigration?: (migration: any) => void;
    onDownloadMigration?: (migration: any) => void;
    onDropAllTables?: (schema: string, tables: string[]) => void;
    onDropAllViews?: (schema: string, views: string[]) => void;
    onDropAllFunctions?: (schema: string, functions: string[]) => void;
    onDropAllTriggers?: (schema: string, triggers: { name: string; table: string }[]) => void;
    onDropAllIndexes?: (schema: string, indexes: { name: string; table: string }[]) => void;
    onDropAllSequences?: (schema: string, sequences: string[]) => void;
    onDropAllTypes?: (schema: string, types: { name: string }[]) => void;
    onDropAllConstraints?: (schema: string, constraints: { name: string; table: string }[]) => void;
  };
}

// Context menu types that support right-click
const contextMenuTypes: TreeItemContextType[] = [
  'table', 'view', 'function', 'trigger', 'index', 'sequence', 'type', 'constraint', 
  'saved_query', 'migration',
  'category_tables', 'category_views', 'category_functions', 'category_triggers',
  'category_indexes', 'category_sequences', 'category_types', 'category_constraints'
];

function TreeItem({ 
  label, 
  type, 
  icon, 
  level, 
  count, 
  children, 
  onClick, 
  defaultOpen = false,
  isOpen: controlledIsOpen,
  onToggle,
  schema = '',
  name = '',
  extra,
  contextMenuProps,
}: TreeItemProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  
  // Use controlled state if provided, otherwise use internal state
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalOpen;
  const setIsOpen = onToggle || setInternalOpen;
  
  const hasChildren = !!children;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      setIsOpen(!isOpen);
    }
    onClick?.();
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      setIsOpen(!isOpen);
    }
  };

  const itemButton = (
    <button
      className={cn(
        "w-full text-left px-2 py-1 text-sm flex items-center gap-1.5 transition-colors text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e]/50",
        (type === 'table' || type === 'view' || type === 'saved_query' || type === 'migration') && 'hover:bg-[#264f78]/30'
      )}
      style={{ paddingLeft: `${level * 16 + 8}px` }}
      onClick={handleClick}
    >
      {hasChildren ? (
        <span onClick={handleChevronClick} className="shrink-0">
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-[#858585]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[#858585]" />
          )}
        </span>
      ) : (
        <span className="w-3.5" />
      )}
      {icon}
      <span className="truncate flex-1 text-[#cccccc]">{label}</span>
      {count !== undefined && (
        <span className="text-xs text-[#858585]">({count})</span>
      )}
    </button>
  );

  // Wrap with context menu for items that support it
  const shouldHaveContextMenu = contextMenuTypes.includes(type as TreeItemContextType) && contextMenuProps;

  return (
    <div>
      {shouldHaveContextMenu ? (
        <DatabaseTreeContextMenu
          type={type as TreeItemContextType}
          schema={schema}
          name={name}
          extra={extra}
          onShowFirst100={contextMenuProps.onShowFirst100}
          onViewStructure={contextMenuProps.onViewStructure}
          onGetDefinition={contextMenuProps.onGetDefinition}
          onDropTable={contextMenuProps.onDropTable}
          onLoadQuery={contextMenuProps.onLoadQuery}
          onEditQuery={contextMenuProps.onEditQuery}
          onDeleteQuery={contextMenuProps.onDeleteQuery}
          onLoadMigration={contextMenuProps.onLoadMigration}
          onDeleteMigration={contextMenuProps.onDeleteMigration}
          onDownloadMigration={contextMenuProps.onDownloadMigration}
          onDropAllTables={contextMenuProps.onDropAllTables}
          onDropAllViews={contextMenuProps.onDropAllViews}
          onDropAllFunctions={contextMenuProps.onDropAllFunctions}
          onDropAllTriggers={contextMenuProps.onDropAllTriggers}
          onDropAllIndexes={contextMenuProps.onDropAllIndexes}
          onDropAllSequences={contextMenuProps.onDropAllSequences}
          onDropAllTypes={contextMenuProps.onDropAllTypes}
          onDropAllConstraints={contextMenuProps.onDropAllConstraints}
        >
          {itemButton}
        </DatabaseTreeContextMenu>
      ) : (
        itemButton
      )}
      {isOpen && children && <div>{children}</div>}
    </div>
  );
}

export function DatabaseSchemaTree({ 
  schemas, 
  savedQueries = [],
  migrations = [],
  loading, 
  onTableSelect,
  onViewSelect,
  onItemClick,
  onShowFirst100,
  onViewStructure,
  onGetDefinition,
  onDropTable,
  onLoadQuery,
  onEditQuery,
  onDeleteQuery,
  onLoadMigration,
  onDeleteMigration,
  onDownloadMigration,
  onDownloadAllMigrations,
  onDropAllTables,
  onDropAllViews,
  onDropAllFunctions,
  onDropAllTriggers,
  onDropAllIndexes,
  onDropAllSequences,
  onDropAllTypes,
  onDropAllConstraints,
}: DatabaseSchemaTreeProps) {
  const [searchTerm, setSearchTerm] = useState("");
  
  // Use ref to track initialization and preserve state across re-renders
  const initializedRef = useRef(false);
  const [openStates, setOpenStates] = useState<Record<string, boolean>>({});

  // Initialize open states only once
  useEffect(() => {
    if (!initializedRef.current && schemas.length > 0) {
      initializedRef.current = true;
      setOpenStates({
        'saved_queries': true,
        'migrations': false,
        'public': true,
        'public_tables': true,
      });
    }
  }, [schemas]);

  const toggleOpen = useCallback((key: string, value: boolean) => {
    setOpenStates(prev => ({ ...prev, [key]: value }));
  }, []);

  const contextMenuProps = {
    onShowFirst100,
    onViewStructure,
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
  };

  const filteredSchemas = useMemo(() => {
    if (!searchTerm.trim()) return schemas;

    const term = searchTerm.toLowerCase();
    return schemas.map(schema => ({
      ...schema,
      tables: schema.tables.filter(t => t.toLowerCase().includes(term)),
      views: schema.views.filter(v => v.toLowerCase().includes(term)),
      functions: schema.functions.filter(f => f.toLowerCase().includes(term)),
      triggers: schema.triggers.filter(t => t.name.toLowerCase().includes(term)),
      indexes: schema.indexes.filter(i => i.name.toLowerCase().includes(term)),
      sequences: schema.sequences.filter(s => s.toLowerCase().includes(term)),
      types: schema.types.filter(t => t.name.toLowerCase().includes(term)),
      constraints: schema.constraints.filter(c => c.name.toLowerCase().includes(term)),
    })).filter(schema => 
      schema.tables.length > 0 || 
      schema.views.length > 0 || 
      schema.functions.length > 0 ||
      schema.triggers.length > 0 ||
      schema.indexes.length > 0 ||
      schema.sequences.length > 0 ||
      schema.types.length > 0 ||
      schema.constraints.length > 0 ||
      schema.name.toLowerCase().includes(term)
    );
  }, [schemas, searchTerm]);

  const filteredSavedQueries = useMemo(() => {
    if (!searchTerm.trim()) return savedQueries;
    const term = searchTerm.toLowerCase();
    return savedQueries.filter(q => 
      q.name.toLowerCase().includes(term) || 
      q.description?.toLowerCase().includes(term) ||
      q.sql_content.toLowerCase().includes(term)
    );
  }, [savedQueries, searchTerm]);

  const filteredMigrations = useMemo(() => {
    if (!searchTerm.trim()) return migrations;
    const term = searchTerm.toLowerCase();
    return migrations.filter(m => 
      m.name?.toLowerCase().includes(term) || 
      m.sql_content.toLowerCase().includes(term) ||
      m.object_name?.toLowerCase().includes(term) ||
      m.object_type.toLowerCase().includes(term)
    );
  }, [migrations, searchTerm]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[#858585]">
        <div className="text-center space-y-2">
          <Database className="h-8 w-8 animate-pulse mx-auto" />
          <p className="text-sm">Loading schema...</p>
        </div>
      </div>
    );
  }

  if (schemas.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[#858585]">
        <p className="text-sm">No schema data available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-2 border-b border-[#3e3e42] shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[#858585]" />
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-sm bg-[#3c3c3c] border-[#3e3e42] text-[#cccccc] placeholder:text-[#858585] focus-visible:ring-[#007acc]"
          />
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="py-1">
          {/* Saved Queries Section */}
          {(savedQueries.length > 0 || filteredSavedQueries.length > 0) && (
            <TreeItem
              label="Saved Queries"
              type="category"
              icon={<Bookmark className="h-4 w-4 text-amber-500" />}
              level={0}
              count={savedQueries.length}
              isOpen={openStates['saved_queries'] ?? true}
              onToggle={(v) => toggleOpen('saved_queries', v)}
            >
              {filteredSavedQueries.map((query) => (
                <TreeItem
                  key={query.id}
                  label={query.name}
                  type="saved_query"
                  icon={<FileCode className="h-4 w-4 text-amber-400" />}
                  level={1}
                  schema=""
                  name={query.name}
                  extra={query}
                  contextMenuProps={contextMenuProps}
                  onClick={() => onLoadQuery?.(query)}
                />
              ))}
            </TreeItem>
          )}

          {/* Migrations Section - always render to preserve open state */}
          <TreeItem
            label="Migrations"
            type="category"
            icon={<GitBranch className="h-4 w-4 text-emerald-500" />}
            level={0}
            count={migrations.length}
            isOpen={openStates['migrations'] ?? false}
            onToggle={(v) => toggleOpen('migrations', v)}
          >
            {migrations.length === 0 ? (
              <div className="px-2 py-1 text-xs text-[#858585]" style={{ paddingLeft: '24px' }}>
                No migrations yet
              </div>
            ) : (
              <>
                {/* Download All button */}
                {migrations.length > 1 && onDownloadAllMigrations && (
                  <div className="px-2 py-1" style={{ paddingLeft: '24px' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onDownloadAllMigrations}
                      className="h-6 text-xs text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e]/50 w-full justify-start gap-1.5"
                    >
                      <Download className="h-3 w-3" />
                      Download All Migrations
                    </Button>
                  </div>
                )}
                {filteredMigrations.map((migration) => (
                  <TreeItem
                    key={migration.id}
                    label={`${migration.sequence_number}. ${migration.name || `${migration.statement_type} ${migration.object_type}`}`}
                    type="migration"
                    icon={<GitBranch className="h-4 w-4 text-emerald-400" />}
                    level={1}
                    schema={migration.object_schema || ''}
                    name={migration.name || ''}
                    extra={migration}
                    contextMenuProps={contextMenuProps}
                    onClick={() => onLoadMigration?.(migration)}
                  />
                ))}
              </>
            )}
          </TreeItem>

          {/* Schema sections */}
          {filteredSchemas.map((schema) => {
            const schemaKey = schema.name;
            return (
              <TreeItem
                key={schema.name}
                label={schema.name}
                type="schema"
                icon={<FolderClosed className="h-4 w-4 text-yellow-500" />}
                level={0}
                isOpen={openStates[schemaKey] ?? schema.name === 'public'}
                onToggle={(v) => toggleOpen(schemaKey, v)}
              >
                {/* Tables */}
                {schema.tables.length > 0 && (
                  <TreeItem
                    label="Tables"
                    type="category_tables"
                    icon={<FolderClosed className="h-4 w-4 text-[#858585]" />}
                    level={1}
                    count={schema.tables.length}
                    isOpen={openStates[`${schemaKey}_tables`] ?? schema.name === 'public'}
                    onToggle={(v) => toggleOpen(`${schemaKey}_tables`, v)}
                    schema={schema.name}
                    extra={{ items: schema.tables }}
                    contextMenuProps={contextMenuProps}
                  >
                    {schema.tables.map((table) => (
                      <TreeItem
                        key={table}
                        label={table}
                        type="table"
                        icon={<Table2 className="h-4 w-4 text-blue-500" />}
                        level={2}
                        schema={schema.name}
                        name={table}
                        contextMenuProps={contextMenuProps}
                        onClick={() => {
                          onTableSelect?.(schema.name, table);
                          onItemClick?.('table', schema.name, table);
                        }}
                      />
                    ))}
                  </TreeItem>
                )}

                {/* Views */}
                {schema.views.length > 0 && (
                  <TreeItem
                    label="Views"
                    type="category_views"
                    icon={<FolderClosed className="h-4 w-4 text-[#858585]" />}
                    level={1}
                    count={schema.views.length}
                    isOpen={openStates[`${schemaKey}_views`]}
                    onToggle={(v) => toggleOpen(`${schemaKey}_views`, v)}
                    schema={schema.name}
                    extra={{ items: schema.views }}
                    contextMenuProps={contextMenuProps}
                  >
                    {schema.views.map((view) => (
                      <TreeItem
                        key={view}
                        label={view}
                        type="view"
                        icon={<Eye className="h-4 w-4 text-purple-500" />}
                        level={2}
                        schema={schema.name}
                        name={view}
                        contextMenuProps={contextMenuProps}
                        onClick={() => {
                          onViewSelect?.(schema.name, view);
                          onItemClick?.('view', schema.name, view);
                        }}
                      />
                    ))}
                  </TreeItem>
                )}

                {/* Functions */}
                {schema.functions.length > 0 && (
                  <TreeItem
                    label="Functions"
                    type="category_functions"
                    icon={<FolderClosed className="h-4 w-4 text-[#858585]" />}
                    level={1}
                    count={schema.functions.length}
                    isOpen={openStates[`${schemaKey}_functions`]}
                    onToggle={(v) => toggleOpen(`${schemaKey}_functions`, v)}
                    schema={schema.name}
                    extra={{ items: schema.functions }}
                    contextMenuProps={contextMenuProps}
                  >
                    {schema.functions.map((func) => (
                      <TreeItem
                        key={func}
                        label={func}
                        type="function"
                        icon={<Zap className="h-4 w-4 text-orange-500" />}
                        level={2}
                        schema={schema.name}
                        name={func}
                        contextMenuProps={contextMenuProps}
                        onClick={() => {
                          onGetDefinition?.('function', schema.name, func);
                          onItemClick?.('function', schema.name, func);
                        }}
                      />
                    ))}
                  </TreeItem>
                )}

                {/* Triggers */}
                {schema.triggers.length > 0 && (
                  <TreeItem
                    label="Triggers"
                    type="category_triggers"
                    icon={<FolderClosed className="h-4 w-4 text-[#858585]" />}
                    level={1}
                    count={schema.triggers.length}
                    isOpen={openStates[`${schemaKey}_triggers`]}
                    onToggle={(v) => toggleOpen(`${schemaKey}_triggers`, v)}
                    schema={schema.name}
                    extra={{ items: schema.triggers }}
                    contextMenuProps={contextMenuProps}
                  >
                    {schema.triggers.map((trigger) => (
                      <TreeItem
                        key={trigger.name}
                        label={`${trigger.name} (${trigger.table})`}
                        type="trigger"
                        icon={<Clock className="h-4 w-4 text-green-500" />}
                        level={2}
                        schema={schema.name}
                        name={trigger.name}
                        extra={trigger}
                        contextMenuProps={contextMenuProps}
                        onClick={() => {
                          onGetDefinition?.('trigger', schema.name, trigger.name, trigger);
                          onItemClick?.('trigger', schema.name, trigger.name, trigger);
                        }}
                      />
                    ))}
                  </TreeItem>
                )}

                {/* Indexes */}
                {schema.indexes.length > 0 && (
                  <TreeItem
                    label="Indexes"
                    type="category_indexes"
                    icon={<FolderClosed className="h-4 w-4 text-[#858585]" />}
                    level={1}
                    count={schema.indexes.length}
                    isOpen={openStates[`${schemaKey}_indexes`]}
                    onToggle={(v) => toggleOpen(`${schemaKey}_indexes`, v)}
                    schema={schema.name}
                    extra={{ items: schema.indexes }}
                    contextMenuProps={contextMenuProps}
                  >
                    {schema.indexes.map((index) => (
                      <TreeItem
                        key={index.name}
                        label={`${index.name} (${index.table})`}
                        type="index"
                        icon={<Search className="h-4 w-4 text-cyan-500" />}
                        level={2}
                        schema={schema.name}
                        name={index.name}
                        extra={index}
                        contextMenuProps={contextMenuProps}
                        onClick={() => {
                          onGetDefinition?.('index', schema.name, index.name, index);
                          onItemClick?.('index', schema.name, index.name, index);
                        }}
                      />
                    ))}
                  </TreeItem>
                )}

                {/* Sequences */}
                {schema.sequences.length > 0 && (
                  <TreeItem
                    label="Sequences"
                    type="category_sequences"
                    icon={<FolderClosed className="h-4 w-4 text-[#858585]" />}
                    level={1}
                    count={schema.sequences.length}
                    isOpen={openStates[`${schemaKey}_sequences`]}
                    onToggle={(v) => toggleOpen(`${schemaKey}_sequences`, v)}
                    schema={schema.name}
                    extra={{ items: schema.sequences }}
                    contextMenuProps={contextMenuProps}
                  >
                    {schema.sequences.map((seq) => (
                      <TreeItem
                        key={seq}
                        label={seq}
                        type="sequence"
                        icon={<Hash className="h-4 w-4 text-pink-500" />}
                        level={2}
                        schema={schema.name}
                        name={seq}
                        contextMenuProps={contextMenuProps}
                        onClick={() => {
                          onGetDefinition?.('sequence', schema.name, seq);
                          onItemClick?.('sequence', schema.name, seq);
                        }}
                      />
                    ))}
                  </TreeItem>
                )}

                {/* Types */}
                {schema.types.length > 0 && (
                  <TreeItem
                    label="Types"
                    type="category_types"
                    icon={<FolderClosed className="h-4 w-4 text-[#858585]" />}
                    level={1}
                    count={schema.types.length}
                    isOpen={openStates[`${schemaKey}_types`]}
                    onToggle={(v) => toggleOpen(`${schemaKey}_types`, v)}
                    schema={schema.name}
                    extra={{ items: schema.types }}
                    contextMenuProps={contextMenuProps}
                  >
                    {schema.types.map((type) => (
                      <TreeItem
                        key={type.name}
                        label={`${type.name} (${type.type})`}
                        type="type"
                        icon={<Type className="h-4 w-4 text-indigo-500" />}
                        level={2}
                        schema={schema.name}
                        name={type.name}
                        extra={type}
                        contextMenuProps={contextMenuProps}
                        onClick={() => {
                          onGetDefinition?.('type', schema.name, type.name, type);
                          onItemClick?.('type', schema.name, type.name, type);
                        }}
                      />
                    ))}
                  </TreeItem>
                )}

                {/* Constraints */}
                {schema.constraints.length > 0 && (
                  <TreeItem
                    label="Constraints"
                    type="category_constraints"
                    icon={<FolderClosed className="h-4 w-4 text-[#858585]" />}
                    level={1}
                    count={schema.constraints.length}
                    isOpen={openStates[`${schemaKey}_constraints`]}
                    onToggle={(v) => toggleOpen(`${schemaKey}_constraints`, v)}
                    schema={schema.name}
                    extra={{ items: schema.constraints }}
                    contextMenuProps={contextMenuProps}
                  >
                    {schema.constraints.map((constraint) => (
                      <TreeItem
                        key={constraint.name}
                        label={`${constraint.name} (${constraint.type})`}
                        type="constraint"
                        icon={<KeyRound className="h-4 w-4 text-red-500" />}
                        level={2}
                        schema={schema.name}
                        name={constraint.name}
                        extra={constraint}
                        contextMenuProps={contextMenuProps}
                        onClick={() => {
                          onGetDefinition?.('constraint', schema.name, constraint.name, constraint);
                          onItemClick?.('constraint', schema.name, constraint.name, constraint);
                        }}
                      />
                    ))}
                  </TreeItem>
                )}
              </TreeItem>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
