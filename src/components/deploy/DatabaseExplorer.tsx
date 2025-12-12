import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ResizableHandle, 
  ResizablePanel, 
  ResizablePanelGroup 
} from "@/components/ui/resizable";
import { 
  Database, 
  RefreshCw, 
  Loader2, 
  AlertCircle,
  Table2,
  Code,
  X,
  ChevronLeft,
  ChevronRight,
  Bot,
  Columns
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DatabaseSchemaTree } from "./DatabaseSchemaTree";
import { SqlQueryEditor } from "./SqlQueryEditor";
import { QueryResultsViewer } from "./QueryResultsViewer";
import { TableStructureViewer } from "./TableStructureViewer";
import { SaveQueryDialog } from "./SaveQueryDialog";
import { TreeItemContextType } from "./DatabaseTreeContextMenu";
import { useIsMobile } from "@/hooks/use-mobile";

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

interface DatabaseExplorerProps {
  database: any;
  shareToken: string | null;
  onBack?: () => void;
}

export function DatabaseExplorer({ database, shareToken, onBack }: DatabaseExplorerProps) {
  const isMobile = useIsMobile();
  const [schemas, setSchemas] = useState<SchemaInfo[]>([]);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'query' | 'table' | 'structure'>('query');
  const [currentQuery, setCurrentQuery] = useState("SELECT 1;");
  const [isExecuting, setIsExecuting] = useState(false);
  
  const [queryResults, setQueryResults] = useState<{
    columns: string[];
    rows: any[];
    executionTime?: number;
    totalRows?: number;
  } | null>(null);
  
  const [selectedTable, setSelectedTable] = useState<{ schema: string; table: string } | null>(null);
  const [tableData, setTableData] = useState<{ columns: string[]; rows: any[]; totalRows: number; offset: number; } | null>(null);
  const [tableStructure, setTableStructure] = useState<{ columns: any[]; indexes: any[] } | null>(null);
  const [tableLimit] = useState(100);
  const [loadingTable, setLoadingTable] = useState(false);
  
  const [isAgentPanelCollapsed, setIsAgentPanelCollapsed] = useState(true);
  const [mobileActiveTab, setMobileActiveTab] = useState("schema");
  
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [editingQuery, setEditingQuery] = useState<SavedQuery | null>(null);
  const [pendingSqlToSave, setPendingSqlToSave] = useState("");

  const invokeManageDatabase = async (action: string, extraBody: any = {}) => {
    const { data, error } = await supabase.functions.invoke("manage-database", {
      body: { action, databaseId: database.id, shareToken, ...extraBody },
    });
    if (error || !data?.success) {
      throw new Error(data?.error || error?.message || `Failed to ${action}`);
    }
    return data.data;
  };

  const initialLoadDone = useRef(false);

  const loadSchema = useCallback(async (silent = false) => {
    if (!silent) setLoadingSchema(true);
    setSchemaError(null);
    try {
      const result = await invokeManageDatabase("get_schema");
      setSchemas(result.schemas || []);
    } catch (error: any) {
      setSchemaError(error.message);
      if (!silent) toast.error("Failed to load schema: " + error.message);
    } finally {
      setLoadingSchema(false);
    }
  }, [database.id, shareToken]);

  const loadSavedQueries = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_saved_queries_with_token", {
        p_database_id: database.id,
        p_token: shareToken || null,
      });
      if (!error && data) setSavedQueries(data);
    } catch (error) {
      console.error("Failed to load saved queries:", error);
    }
  }, [database.id, shareToken]);

  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      loadSchema();
      loadSavedQueries();
    }
  }, [loadSchema, loadSavedQueries]);

  const silentRefresh = useCallback(() => { loadSchema(true); }, [loadSchema]);

  const handleExecuteQuery = async (sql: string) => {
    setIsExecuting(true);
    setQueryResults(null);
    try {
      const result = await invokeManageDatabase("execute_sql", { sql });
      setQueryResults({ columns: result.columns || [], rows: result.rows || [], executionTime: result.executionTime, totalRows: result.rowCount });
      toast.success(`Query executed: ${result.rowCount} rows`);
      silentRefresh();
      if (isMobile) setMobileActiveTab("results");
    } catch (error: any) {
      toast.error("Query failed: " + error.message);
      setQueryResults({ columns: ['Error'], rows: [{ Error: error.message }] });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleTableSelect = async (schema: string, table: string, offset = 0) => {
    setSelectedTable({ schema, table });
    setActiveTab('table');
    setLoadingTable(true);
    try {
      const result = await invokeManageDatabase("get_table_data", { schema, table, limit: tableLimit, offset });
      setTableData({ columns: result.columns || [], rows: result.rows || [], totalRows: result.totalRows, offset });
      if (isMobile) setMobileActiveTab("results");
    } catch (error: any) {
      toast.error("Failed to load table data: " + error.message);
    } finally {
      setLoadingTable(false);
    }
  };

  const handleViewStructure = async (schema: string, table: string) => {
    setSelectedTable({ schema, table });
    setActiveTab('structure');
    setLoadingTable(true);
    try {
      const [colResult, indexResult] = await Promise.all([
        invokeManageDatabase("get_table_columns", { schema, table }),
        invokeManageDatabase("get_schema").then(r => {
          const s = r.schemas?.find((s: any) => s.name === schema);
          return s?.indexes?.filter((i: any) => i.table === table) || [];
        }),
      ]);
      setTableStructure({ columns: colResult.columns || [], indexes: indexResult });
      if (isMobile) setMobileActiveTab("results");
    } catch (error: any) {
      toast.error("Failed to load table structure: " + error.message);
    } finally {
      setLoadingTable(false);
    }
  };

  const handleShowFirst100 = (schema: string, name: string) => { handleTableSelect(schema, name, 0); };

  const handleGetDefinition = async (type: TreeItemContextType, schema: string, name: string, extra?: any) => {
    try {
      let actionMap: Record<string, string> = {
        'table': 'get_table_definition',
        'view': 'get_view_definition',
        'function': 'get_function_definition',
        'trigger': 'get_trigger_definition',
        'index': 'get_index_definition',
        'sequence': 'get_sequence_info',
        'type': 'get_type_definition',
      };

      const action = actionMap[type];
      if (!action) {
        // For constraint, just copy the name
        if (type === 'constraint') {
          navigator.clipboard.writeText(name);
          toast.success("Constraint name copied");
        }
        return;
      }

      if (type === 'index' && extra?.definition) {
        // For indexes, we already have the definition from schema
        setCurrentQuery(extra.definition + ';');
        navigator.clipboard.writeText(extra.definition + ';');
        toast.success("Index definition copied and loaded into editor");
        setActiveTab('query');
        if (isMobile) setMobileActiveTab("query");
        return;
      }

      toast.info(`Fetching ${type} definition...`);
      const result = await invokeManageDatabase(action, { 
        schema, 
        ...(type === 'table' ? { table: name } : { name }) 
      });

      if (result.definition) {
        setCurrentQuery(result.definition);
        navigator.clipboard.writeText(result.definition);
        toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} definition copied and loaded into editor`);
        setActiveTab('query');
        if (isMobile) setMobileActiveTab("query");
      }
    } catch (error: any) {
      toast.error(`Failed to get definition: ${error.message}`);
      // Fallback to SQL query
      let sql = "";
      if (type === 'table') sql = `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = '${name}' ORDER BY ordinal_position;`;
      else if (type === 'view') sql = `SELECT definition FROM pg_views WHERE schemaname = '${schema}' AND viewname = '${name}';`;
      else if (type === 'function') sql = `SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = '${schema}' AND p.proname = '${name}';`;
      else if (type === 'trigger') sql = `SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = '${schema}' AND t.tgname = '${name}';`;
      else if (type === 'sequence') sql = `SELECT * FROM "${schema}"."${name}";`;
      else if (type === 'type') sql = `SELECT typname, typtype FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = '${schema}' AND t.typname = '${name}';`;
      if (sql) {
        setCurrentQuery(sql);
        setActiveTab('query');
        if (isMobile) setMobileActiveTab("query");
      }
    }
  };

  const handleLoadQuery = (query: SavedQuery) => { setCurrentQuery(query.sql_content); setActiveTab('query'); if (isMobile) setMobileActiveTab("query"); };
  const handleEditQuery = (query: SavedQuery) => { setEditingQuery(query); setSaveDialogOpen(true); };
  const handleDeleteQuery = async (query: SavedQuery) => {
    try {
      await supabase.rpc("delete_saved_query_with_token", { p_query_id: query.id, p_token: shareToken || null });
      toast.success("Query deleted");
      loadSavedQueries();
    } catch (error: any) { toast.error("Failed to delete: " + error.message); }
  };

  const handleSaveQuery = async (name: string, description: string, sqlContent: string) => {
    try {
      if (editingQuery) {
        await supabase.rpc("update_saved_query_with_token", { p_query_id: editingQuery.id, p_token: shareToken || null, p_name: name, p_description: description || null, p_sql_content: sqlContent });
        toast.success("Query updated");
      } else {
        await supabase.rpc("insert_saved_query_with_token", { p_database_id: database.id, p_name: name, p_sql_content: sqlContent, p_token: shareToken || null, p_description: description || null });
        toast.success("Query saved");
      }
      loadSavedQueries();
      setEditingQuery(null);
    } catch (error: any) { toast.error("Failed to save: " + error.message); throw error; }
  };

  const handleOpenSaveDialog = (sql: string) => { setPendingSqlToSave(sql); setEditingQuery(null); setSaveDialogOpen(true); };

  const handleExport = async (format: 'json' | 'csv' | 'sql') => {
    if (!selectedTable) return;
    try {
      const result = await invokeManageDatabase("export_table", { schema: selectedTable.schema, table: selectedTable.table, format });
      const content = format === 'json' ? JSON.stringify(result.data, null, 2) : result.data;
      const blob = new Blob([content], { type: format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${selectedTable.table}.${format}`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      toast.success(`Exported ${result.rowCount} rows as ${format.toUpperCase()}`);
    } catch (error: any) { toast.error("Export failed: " + error.message); }
  };

  const handleExportQueryResults = async (format: 'json' | 'csv' | 'sql') => {
    if (!queryResults) return;
    const content = format === 'json' ? JSON.stringify(queryResults.rows, null, 2) : format === 'csv' ? [queryResults.columns.join(','), ...queryResults.rows.map(row => queryResults.columns.map(col => JSON.stringify(row[col] ?? '')).join(','))].join('\n') : queryResults.rows.map(row => `INSERT INTO query_result (${queryResults.columns.join(', ')}) VALUES (${queryResults.columns.map(col => { const v = row[col]; return v === null ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v; }).join(', ')});`).join('\n');
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `query_results.${format}`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success(`Exported ${queryResults.rows.length} rows as ${format.toUpperCase()}`);
  };

  const handleCloseTable = () => { setSelectedTable(null); setTableData(null); setTableStructure(null); setActiveTab('query'); };

  const SchemaTreePanel = () => (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      <div className="p-2 border-b border-[#3e3e42] bg-[#252526] flex items-center justify-between">
        <div className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /><span className="text-sm font-semibold text-[#cccccc]">Schema</span></div>
        <Button variant="ghost" size="icon" onClick={() => loadSchema()} disabled={loadingSchema} className="h-6 w-6 hover:bg-[#2a2d2e] text-[#cccccc]">
          {loadingSchema ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {schemaError ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center"><AlertCircle className="h-8 w-8 text-destructive mb-2" /><p className="text-sm text-destructive">{schemaError}</p><Button variant="outline" size="sm" onClick={() => loadSchema()} className="mt-4">Retry</Button></div>
        ) : (
          <DatabaseSchemaTree schemas={schemas} savedQueries={savedQueries} loading={loadingSchema} onTableSelect={handleTableSelect} onViewSelect={(s, v) => { setCurrentQuery(`SELECT * FROM "${s}"."${v}" LIMIT 100;`); setActiveTab('query'); if (isMobile) setMobileActiveTab("query"); }} onItemClick={(t, s, n, e) => { if (t === 'table') handleTableSelect(s, n); }} onShowFirst100={handleShowFirst100} onViewStructure={handleViewStructure} onGetDefinition={handleGetDefinition} onLoadQuery={handleLoadQuery} onEditQuery={handleEditQuery} onDeleteQuery={handleDeleteQuery} />
        )}
      </div>
    </div>
  );

  const QueryEditorPanel = () => (
    <div className="h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="h-full flex flex-col">
        <div className="border-b border-border px-2 flex items-center justify-between bg-background">
          <TabsList className="h-10">
            <TabsTrigger value="query" className="gap-2 text-xs"><Code className="h-4 w-4" />SQL</TabsTrigger>
            {selectedTable && activeTab === 'table' && (<TabsTrigger value="table" className="gap-2 pr-1 text-xs"><Table2 className="h-4 w-4" /><span className="hidden sm:inline">{`${selectedTable.schema}.${selectedTable.table}`}</span><span className="sm:hidden">{selectedTable.table}</span><button onClick={(e) => { e.stopPropagation(); handleCloseTable(); }} className="ml-1 p-0.5 rounded hover:bg-muted"><X className="h-3 w-3" /></button></TabsTrigger>)}
            {selectedTable && activeTab === 'structure' && (<TabsTrigger value="structure" className="gap-2 pr-1 text-xs"><Columns className="h-4 w-4" />Structure<button onClick={(e) => { e.stopPropagation(); handleCloseTable(); }} className="ml-1 p-0.5 rounded hover:bg-muted"><X className="h-3 w-3" /></button></TabsTrigger>)}
          </TabsList>
        </div>
        <TabsContent value="query" className="flex-1 m-0 min-h-0">
          {isMobile ? <SqlQueryEditor query={currentQuery} onQueryChange={setCurrentQuery} onExecute={handleExecuteQuery} isExecuting={isExecuting} onSaveQuery={handleOpenSaveDialog} /> : (
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={40} minSize={20}><SqlQueryEditor query={currentQuery} onQueryChange={setCurrentQuery} onExecute={handleExecuteQuery} isExecuting={isExecuting} onSaveQuery={handleOpenSaveDialog} /></ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={60} minSize={20}><div className="h-full bg-background">{queryResults ? <QueryResultsViewer columns={queryResults.columns} rows={queryResults.rows} totalRows={queryResults.totalRows} executionTime={queryResults.executionTime} onExport={handleExportQueryResults} /> : <div className="flex items-center justify-center h-full text-muted-foreground"><p className="text-sm">Run a query to see results</p></div>}</div></ResizablePanel>
            </ResizablePanelGroup>
          )}
        </TabsContent>
        <TabsContent value="table" className="flex-1 m-0 min-h-0">{loadingTable ? <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : tableData ? <QueryResultsViewer columns={tableData.columns} rows={tableData.rows} totalRows={tableData.totalRows} limit={tableLimit} offset={tableData.offset} onPageChange={(o) => { if (selectedTable) handleTableSelect(selectedTable.schema, selectedTable.table, o); }} onExport={handleExport} /> : <div className="flex items-center justify-center h-full text-muted-foreground"><p className="text-sm">Select a table</p></div>}</TabsContent>
        <TabsContent value="structure" className="flex-1 m-0 min-h-0">{loadingTable ? <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> : tableStructure && selectedTable ? <TableStructureViewer schema={selectedTable.schema} table={selectedTable.table} columns={tableStructure.columns} indexes={tableStructure.indexes} onClose={handleCloseTable} /> : <div className="flex items-center justify-center h-full text-muted-foreground"><p className="text-sm">Select a table to view structure</p></div>}</TabsContent>
      </Tabs>
    </div>
  );

  const ResultsPanel = () => <div className="h-full bg-background">{activeTab === 'table' && tableData ? <QueryResultsViewer columns={tableData.columns} rows={tableData.rows} totalRows={tableData.totalRows} limit={tableLimit} offset={tableData.offset} onPageChange={(o) => { if (selectedTable) handleTableSelect(selectedTable.schema, selectedTable.table, o); }} onExport={handleExport} /> : activeTab === 'structure' && tableStructure && selectedTable ? <TableStructureViewer schema={selectedTable.schema} table={selectedTable.table} columns={tableStructure.columns} indexes={tableStructure.indexes} /> : queryResults ? <QueryResultsViewer columns={queryResults.columns} rows={queryResults.rows} totalRows={queryResults.totalRows} executionTime={queryResults.executionTime} onExport={handleExportQueryResults} /> : <div className="flex items-center justify-center h-full text-muted-foreground"><p className="text-sm">Run a query or select a table to see results</p></div>}</div>;
  const AgentPanel = () => <div className="h-full flex flex-col bg-card"><div className="p-3 border-b border-border flex items-center justify-between"><div className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /><span className="text-sm font-semibold">Database Agent</span></div>{!isMobile && <Button variant="ghost" size="icon" onClick={() => setIsAgentPanelCollapsed(true)} className="h-6 w-6"><ChevronRight className="h-4 w-4" /></Button>}</div><div className="flex-1 flex items-center justify-center p-4 text-center"><div className="space-y-2"><Bot className="h-12 w-12 mx-auto text-muted-foreground/50" /><p className="text-sm text-muted-foreground">Database Agent coming soon</p></div></div></div>;

  if (isMobile) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-2 border-b border-border bg-background flex items-center gap-2">{onBack && <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8"><ChevronLeft className="h-4 w-4" /></Button>}<div className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /><span className="font-semibold text-sm truncate">{database.name}</span></div></div>
        <Tabs value={mobileActiveTab} onValueChange={setMobileActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full h-10 rounded-none border-b grid grid-cols-4"><TabsTrigger value="schema" className="text-xs">Schema</TabsTrigger><TabsTrigger value="query" className="text-xs">Query</TabsTrigger><TabsTrigger value="results" className="text-xs">Results</TabsTrigger><TabsTrigger value="agent" className="text-xs">Agent</TabsTrigger></TabsList>
          <TabsContent value="schema" className="flex-1 m-0 min-h-0" forceMount data-state={mobileActiveTab === "schema" ? "active" : "inactive"}><div className={mobileActiveTab === "schema" ? "h-full" : "hidden"}><SchemaTreePanel /></div></TabsContent>
          <TabsContent value="query" className="flex-1 m-0 min-h-0" forceMount data-state={mobileActiveTab === "query" ? "active" : "inactive"}><div className={mobileActiveTab === "query" ? "h-full" : "hidden"}><SqlQueryEditor query={currentQuery} onQueryChange={setCurrentQuery} onExecute={handleExecuteQuery} isExecuting={isExecuting} onSaveQuery={handleOpenSaveDialog} /></div></TabsContent>
          <TabsContent value="results" className="flex-1 m-0 min-h-0" forceMount data-state={mobileActiveTab === "results" ? "active" : "inactive"}><div className={mobileActiveTab === "results" ? "h-full" : "hidden"}><ResultsPanel /></div></TabsContent>
          <TabsContent value="agent" className="flex-1 m-0 min-h-0" forceMount data-state={mobileActiveTab === "agent" ? "active" : "inactive"}><div className={mobileActiveTab === "agent" ? "h-full" : "hidden"}><AgentPanel /></div></TabsContent>
        </Tabs>
        <SaveQueryDialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen} onSave={handleSaveQuery} sqlContent={pendingSqlToSave} editingQuery={editingQuery} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-border bg-background/95 backdrop-blur flex items-center justify-between">
        <div className="flex items-center gap-3">{onBack && <Button variant="ghost" size="sm" onClick={onBack} className="h-8"><ChevronLeft className="h-4 w-4 mr-1" />Back</Button>}<div className="flex items-center gap-2"><div className="p-1.5 rounded-md bg-primary/10"><Database className="h-4 w-4 text-primary" /></div><div><h2 className="text-sm font-semibold">{database.name}</h2><p className="text-xs text-muted-foreground">PostgreSQL {database.postgres_version || "16"} • {database.region}</p></div></div></div>
        {isAgentPanelCollapsed && <Button variant="outline" size="sm" onClick={() => setIsAgentPanelCollapsed(false)} className="h-8"><Bot className="h-4 w-4 mr-2" />Database Agent</Button>}
      </div>
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={20} minSize={15} maxSize={35}><SchemaTreePanel /></ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={isAgentPanelCollapsed ? 80 : 55} minSize={35}><QueryEditorPanel /></ResizablePanel>
          {!isAgentPanelCollapsed && (<><ResizableHandle withHandle /><ResizablePanel defaultSize={25} minSize={20} maxSize={40}><AgentPanel /></ResizablePanel></>)}
        </ResizablePanelGroup>
      </div>
      <SaveQueryDialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen} onSave={handleSaveQuery} sqlContent={pendingSqlToSave} editingQuery={editingQuery} />
    </div>
  );
}
