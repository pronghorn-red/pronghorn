import { useState, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
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
  X
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DatabaseSchemaTree } from "./DatabaseSchemaTree";
import { SqlQueryEditor } from "./SqlQueryEditor";
import { QueryResultsViewer } from "./QueryResultsViewer";

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

interface DatabaseExplorerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  database: any;
  shareToken: string | null;
}

export function DatabaseExplorerModal({
  open,
  onOpenChange,
  database,
  shareToken,
}: DatabaseExplorerModalProps) {
  const [schemas, setSchemas] = useState<SchemaInfo[]>([]);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'query' | 'table'>('query');
  const [currentQuery, setCurrentQuery] = useState("SELECT 1;");
  const [isExecuting, setIsExecuting] = useState(false);
  
  const [queryResults, setQueryResults] = useState<{
    columns: string[];
    rows: any[];
    executionTime?: number;
    totalRows?: number;
  } | null>(null);
  
  const [selectedTable, setSelectedTable] = useState<{ schema: string; table: string } | null>(null);
  const [tableData, setTableData] = useState<{
    columns: string[];
    rows: any[];
    totalRows: number;
    offset: number;
  } | null>(null);
  const [tableLimit] = useState(100);
  const [loadingTable, setLoadingTable] = useState(false);

  const invokeManageDatabase = async (action: string, extraBody: any = {}) => {
    const { data, error } = await supabase.functions.invoke("manage-database", {
      body: {
        action,
        databaseId: database.id,
        shareToken,
        ...extraBody,
      },
    });

    if (error || !data?.success) {
      throw new Error(data?.error || error?.message || `Failed to ${action}`);
    }

    return data.data;
  };

  const initialLoadDone = useRef(false);

  const loadSchema = useCallback(async (silent = false) => {
    if (!silent) {
      setLoadingSchema(true);
    }
    setSchemaError(null);

    try {
      const result = await invokeManageDatabase("get_schema");
      setSchemas(result.schemas || []);
    } catch (error: any) {
      setSchemaError(error.message);
      if (!silent) {
        toast.error("Failed to load schema: " + error.message);
      }
    } finally {
      setLoadingSchema(false);
    }
  }, [database.id, shareToken]);

  // Auto-load schema when modal opens
  useEffect(() => {
    if (open && !initialLoadDone.current) {
      initialLoadDone.current = true;
      loadSchema();
    }
  }, [open, loadSchema]);

  // Silent refresh after query execution or table operations
  const silentRefresh = useCallback(() => {
    loadSchema(true);
  }, [loadSchema]);

  const handleExecuteQuery = async (sql: string) => {
    setIsExecuting(true);
    setQueryResults(null);

    try {
      const result = await invokeManageDatabase("execute_sql", { sql });
      setQueryResults({
        columns: result.columns || [],
        rows: result.rows || [],
        executionTime: result.executionTime,
        totalRows: result.rowCount,
      });
      toast.success(`Query executed: ${result.rowCount} rows`);
      // Silent refresh schema after query execution
      silentRefresh();
    } catch (error: any) {
      toast.error("Query failed: " + error.message);
      setQueryResults({
        columns: ['Error'],
        rows: [{ Error: error.message }],
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleTableSelect = async (schema: string, table: string, offset = 0) => {
    setSelectedTable({ schema, table });
    setActiveTab('table');
    setLoadingTable(true);

    try {
      const result = await invokeManageDatabase("get_table_data", {
        schema,
        table,
        limit: tableLimit,
        offset,
      });
      setTableData({
        columns: result.columns || [],
        rows: result.rows || [],
        totalRows: result.totalRows,
        offset,
      });
    } catch (error: any) {
      toast.error("Failed to load table data: " + error.message);
    } finally {
      setLoadingTable(false);
    }
  };

  const handleExport = async (format: 'json' | 'csv' | 'sql') => {
    if (!selectedTable) return;

    try {
      const result = await invokeManageDatabase("export_table", {
        schema: selectedTable.schema,
        table: selectedTable.table,
        format,
      });

      // Create download
      const content = format === 'json' 
        ? JSON.stringify(result.data, null, 2) 
        : result.data;
      
      const blob = new Blob([content], { 
        type: format === 'json' ? 'application/json' : 
              format === 'csv' ? 'text/csv' : 
              'text/plain' 
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedTable.table}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${result.rowCount} rows as ${format.toUpperCase()}`);
    } catch (error: any) {
      toast.error("Export failed: " + error.message);
    }
  };

  const handleItemClick = (type: string, schema: string, name: string, extra?: any) => {
    if (type === 'table') {
      handleTableSelect(schema, name);
    } else if (type === 'view') {
      // Generate view query
      setCurrentQuery(`SELECT * FROM "${schema}"."${name}" LIMIT 100;`);
      setActiveTab('query');
    } else if (type === 'function') {
      // Show function definition
      setCurrentQuery(`SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = '${name}';`);
      setActiveTab('query');
    } else if (type === 'index') {
      // Show index definition
      setCurrentQuery(`-- Index: ${name}\n-- Table: ${extra?.table}\n-- Definition:\n-- ${extra?.definition}`);
      setActiveTab('query');
    }
  };

  const handleCloseTable = () => {
    setSelectedTable(null);
    setTableData(null);
    setActiveTab('query');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[90vh] h-[90vh] p-0 gap-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{database.name}</h2>
              <p className="text-sm text-muted-foreground">
                PostgreSQL {database.postgres_version || "16"} • {database.region}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadSchema()}
            disabled={loadingSchema}
          >
            {loadingSchema ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh Schema</span>
          </Button>
        </div>

        <div className="flex-1 min-h-0">
          <ResizablePanelGroup direction="horizontal">
            {/* Left Panel - Schema Tree */}
            <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
              <div className="h-full border-r border-border">
                {schemaError ? (
                  <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                    <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                    <p className="text-sm text-destructive">{schemaError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadSchema()}
                      className="mt-4"
                    >
                      Retry
                    </Button>
                  </div>
                ) : (
                  <DatabaseSchemaTree
                    schemas={schemas}
                    loading={loadingSchema}
                    onTableSelect={handleTableSelect}
                    onViewSelect={(schema, view) => {
                      setCurrentQuery(`SELECT * FROM "${schema}"."${view}" LIMIT 100;`);
                      setActiveTab('query');
                    }}
                    onItemClick={handleItemClick}
                  />
                )}
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right Panel - Query/Results */}
            <ResizablePanel defaultSize={75}>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="h-full flex flex-col">
                <div className="border-b border-border px-4 flex items-center justify-between">
                  <TabsList className="h-10">
                    <TabsTrigger value="query" className="gap-2">
                      <Code className="h-4 w-4" />
                      SQL Query
                    </TabsTrigger>
                    {selectedTable && (
                      <TabsTrigger value="table" className="gap-2 pr-1">
                        <Table2 className="h-4 w-4" />
                        {`${selectedTable.schema}.${selectedTable.table}`}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCloseTable();
                          }}
                          className="ml-1 p-0.5 rounded hover:bg-muted"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </TabsTrigger>
                    )}
                  </TabsList>
                </div>

                <TabsContent value="query" className="flex-1 m-0 min-h-0">
                  <ResizablePanelGroup direction="vertical">
                    <ResizablePanel defaultSize={40} minSize={20}>
                      <SqlQueryEditor
                        query={currentQuery}
                        onQueryChange={setCurrentQuery}
                        onExecute={handleExecuteQuery}
                        isExecuting={isExecuting}
                      />
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={60} minSize={20}>
                      <div className="h-full bg-background">
                        {queryResults ? (
                          <QueryResultsViewer
                            columns={queryResults.columns}
                            rows={queryResults.rows}
                            totalRows={queryResults.totalRows}
                            executionTime={queryResults.executionTime}
                            onExport={async (format) => {
                              // Export current query results
                              const content = format === 'json' 
                                ? JSON.stringify(queryResults.rows, null, 2)
                                : format === 'csv'
                                ? [queryResults.columns.join(','), ...queryResults.rows.map(row => 
                                    queryResults.columns.map(col => JSON.stringify(row[col] ?? '')).join(',')
                                  )].join('\n')
                                : queryResults.rows.map(row => 
                                    `INSERT INTO query_result (${queryResults.columns.join(', ')}) VALUES (${
                                      queryResults.columns.map(col => {
                                        const v = row[col];
                                        return v === null ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v;
                                      }).join(', ')
                                    });`
                                  ).join('\n');
                              
                              const blob = new Blob([content], { 
                                type: format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'text/plain' 
                              });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `query_results.${format}`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                              toast.success(`Exported ${queryResults.rows.length} rows as ${format.toUpperCase()}`);
                            }}
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full text-muted-foreground">
                            <p className="text-sm">Run a query to see results</p>
                          </div>
                        )}
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </TabsContent>

                <TabsContent value="table" className="flex-1 m-0 min-h-0">
                  {loadingTable ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : tableData ? (
                    <QueryResultsViewer
                      columns={tableData.columns}
                      rows={tableData.rows}
                      totalRows={tableData.totalRows}
                      limit={tableLimit}
                      offset={tableData.offset}
                      onPageChange={(offset) => {
                        if (selectedTable) {
                          handleTableSelect(selectedTable.schema, selectedTable.table, offset);
                        }
                      }}
                      onExport={handleExport}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <p className="text-sm">Select a table from the schema tree</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </DialogContent>
    </Dialog>
  );
}
