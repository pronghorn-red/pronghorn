import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Upload, Database, FileSpreadsheet, FileJson, Check, Plus, ArrowRight, AlertTriangle, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExcelData } from '@/utils/parseExcel';
import { 
  ParsedJsonData, 
  getJsonHeaders, 
  getJsonRowsAsArray, 
  NormalizationStrategy, 
  NormalizationOptions,
  JsonStructureNode,
  analyzeJsonStructure,
  parseJsonData as parseJsonDataWithOptions
} from '@/utils/parseJson';
import { ColumnTypeInfo, CastingRule, inferColumnType } from '@/utils/typeInference';
import { 
  SQLStatement, 
  TableDefinition, 
  generateFullImportSQL,
  generateTableDefinitionFromInference,
  calculateBatchSize,
  generateInsertBatchSQL,
  generateMultiTableImportSQL
} from '@/utils/sqlGenerator';
import { extractDDLStatements } from '@/lib/sqlParser';
import FileUploader from './import/FileUploader';
import ExcelDataGrid from './import/ExcelDataGrid';
import JsonDataViewer from './import/JsonDataViewer';
import SchemaCreator from './import/SchemaCreator';
import FieldMapper from './import/FieldMapper';
import SqlReviewPanel from './import/SqlReviewPanel';
import ImportProgressTracker from './import/ImportProgressTracker';
import { JsonRelationshipFlow } from './import/JsonRelationshipFlow';
import JsonNormalizationSelector from './import/JsonNormalizationSelector';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type WizardStep = 'upload' | 'normalize' | 'clean' | 'schema' | 'review' | 'execute';
type ImportAction = 'create_new' | 'import_existing';

interface ColumnMapping {
  sourceColumn: string;
  targetColumn: string | null;
  ignored: boolean;
  constantValue?: string;
  castingEnabled: boolean;
}

interface ExecutionProgress {
  currentBatch: number;
  totalBatches: number;
  rowsCompleted: number;
  totalRows: number;
  currentStatement: string;
  status: 'running' | 'paused' | 'completed' | 'error';
  errors: { row: number; error: string }[];
  startTime?: number;
}

interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
}

interface DatabaseImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  databaseId?: string;
  connectionId?: string;
  projectId: string;
  shareToken: string | null;
  schema?: string;
  existingTables?: string[];
  onImportComplete?: () => void;
}

const STEPS: { key: WizardStep; label: string; icon: React.ReactNode }[] = [
  { key: 'upload', label: 'Upload', icon: <Upload className="h-4 w-4" /> },
  { key: 'normalize', label: 'Structure', icon: <GitBranch className="h-4 w-4" /> },
  { key: 'clean', label: 'Preview', icon: <FileSpreadsheet className="h-4 w-4" /> },
  { key: 'schema', label: 'Schema', icon: <Database className="h-4 w-4" /> },
  { key: 'review', label: 'Review', icon: <FileJson className="h-4 w-4" /> },
  { key: 'execute', label: 'Execute', icon: <Check className="h-4 w-4" /> },
];

export default function DatabaseImportWizard({
  open,
  onOpenChange,
  databaseId,
  connectionId,
  projectId,
  shareToken,
  schema = 'public',
  existingTables = [],
  onImportComplete
}: DatabaseImportWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload');
  
  // File state
  const [fileType, setFileType] = useState<'excel' | 'csv' | 'json' | null>(null);
  const [excelData, setExcelData] = useState<ExcelData | null>(null);
  const [jsonData, setJsonData] = useState<ParsedJsonData | null>(null);
  const [rawJsonData, setRawJsonData] = useState<any>(null); // Store raw JSON for re-parsing
  const [rawJsonFileName, setRawJsonFileName] = useState<string>('imported_data');
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [headerRow, setHeaderRow] = useState<number>(0);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [selectedRowsByTable, setSelectedRowsByTable] = useState<Map<string, Set<number>>>(new Map());
  const [selectedJsonTable, setSelectedJsonTable] = useState<string>('');
  
  // Normalization state
  const [normalizationStrategy, setNormalizationStrategy] = useState<NormalizationStrategy>('partial');
  const [customTablePaths, setCustomTablePaths] = useState<Set<string>>(new Set());
  const [jsonStructure, setJsonStructure] = useState<JsonStructureNode[]>([]);
  
  // AI mode
  const [aiMode, setAiMode] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  
  // Schema state
  const [action, setAction] = useState<ImportAction>('create_new');
  const [targetTable, setTargetTable] = useState<string | null>(null);
  const [tableName, setTableName] = useState<string>('');
  const [tableDef, setTableDef] = useState<TableDefinition | null>(null);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [targetColumns, setTargetColumns] = useState<TableColumn[]>([]);
  const [enableCasting, setEnableCasting] = useState(true);
  
  // Per-table definitions for multi-table JSON import
  const [tableDefsMap, setTableDefsMap] = useState<Map<string, TableDefinition>>(new Map());
  
  // Memoized callback for SchemaCreator to prevent re-renders
  const handleTableDefChange = useCallback((def: TableDefinition) => {
    setTableDef(def);
  }, []);
  
  // Memoized callback for multi-table SchemaCreator
  const handleMultiTableDefChange = useCallback((tableName: string, def: TableDefinition) => {
    setTableDefsMap(prev => new Map(prev).set(tableName, def));
  }, []);
  
  // SQL state
  const [proposedSQL, setProposedSQL] = useState<SQLStatement[]>([]);
  const [sqlReviewed, setSqlReviewed] = useState(false);
  const [excludedStatements, setExcludedStatements] = useState<Set<number>>(new Set());
  
  // Execution state
  const [executionProgress, setExecutionProgress] = useState<ExecutionProgress | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const currentStepIndex = STEPS.findIndex(s => s.key === currentStep);
  const canGoBack = currentStepIndex > 0 && executionProgress?.status !== 'running';

  // Get current data headers and rows
  const { headers, dataRows } = useMemo(() => {
    if (fileType === 'json' && jsonData) {
      const table = jsonData.tables.find(t => t.name === selectedJsonTable) || jsonData.tables[0];
      if (!table) return { headers: [], dataRows: [] };
      return {
        headers: getJsonHeaders(table),
        dataRows: getJsonRowsAsArray(table)
      };
    } else if (excelData) {
      const sheet = excelData.sheets.find(s => s.name === selectedSheet) || excelData.sheets[0];
      if (!sheet) return { headers: [], dataRows: [] };
      const hdrs = sheet.rows[headerRow] || [];
      const rows = sheet.rows.slice(headerRow + 1);
      return { headers: hdrs.map(h => String(h ?? '')), dataRows: rows };
    }
    return { headers: [], dataRows: [] };
  }, [fileType, jsonData, selectedJsonTable, excelData, selectedSheet, headerRow]);

  // Get selected data rows for import
  const selectedDataRows = useMemo(() => {
    if (selectedRows.size === 0) return dataRows;
    return dataRows.filter((_, idx) => selectedRows.has(idx));
  }, [dataRows, selectedRows]);

  // Memoize sample data for SchemaCreator to prevent re-inference on every render
  const memoizedSampleData = useMemo(() => 
    selectedDataRows.slice(0, 1000), 
    [selectedDataRows]
  );

  // Auto-select all rows initially
  useEffect(() => {
    if (dataRows.length > 0 && selectedRows.size === 0) {
      setSelectedRows(new Set(dataRows.map((_, i) => i)));
    }
  }, [dataRows]);

  // Auto-select first JSON table for multi-table JSON
  useEffect(() => {
    if (fileType === 'json' && jsonData && jsonData.tables.length > 0 && !selectedJsonTable) {
      setSelectedJsonTable(jsonData.tables[0].name);
    }
  }, [fileType, jsonData, selectedJsonTable]);

  const goBack = () => {
    if (canGoBack) {
      setCurrentStep(STEPS[currentStepIndex - 1].key);
    }
  };

  const goNext = () => {
    if (currentStepIndex < STEPS.length - 1) {
      const nextStep = STEPS[currentStepIndex + 1].key;
      
      // Skip normalize step for non-JSON files
      if (nextStep === 'normalize' && fileType !== 'json') {
        setCurrentStep('clean');
        return;
      }
      
      // Re-parse JSON with selected normalization options when moving from normalize to clean
      if (currentStep === 'normalize' && nextStep === 'clean' && rawJsonData) {
        const options: NormalizationOptions = {
          strategy: normalizationStrategy,
          customTablePaths: normalizationStrategy === 'custom' ? customTablePaths : undefined
        };
        const reparsed = parseJsonDataWithOptions(rawJsonData, rawJsonFileName, options);
        setJsonData(reparsed);
        
        // Reset selections for new table structure
        if (reparsed.tables.length > 0) {
          setSelectedJsonTable(reparsed.tables[0].name);
          setTableName(reparsed.tables[0].name);
          
          const initialSelection = new Map<string, Set<number>>();
          reparsed.tables.forEach(table => {
            initialSelection.set(table.name, new Set(table.rows.map((_, i) => i)));
          });
          setSelectedRowsByTable(initialSelection);
        }
      }
      
      // Generate SQL when moving to review step
      if (nextStep === 'review') {
        if (fileType === 'json' && jsonData && jsonData.tables.length > 1) {
          // Multi-table JSON import - pass user-configured table definitions
          const statements = generateMultiTableImportSQL(
            jsonData.tables,
            jsonData.relationships,
            schema,
            selectedRowsByTable,
            tableDefsMap
          );
          setProposedSQL(statements);
          setSqlReviewed(false);
        } else if (action === 'create_new' && tableDef) {
          const batchSize = calculateBatchSize(tableDef.columns.length, selectedDataRows.length);
          const statements = generateFullImportSQL(tableDef, selectedDataRows, batchSize);
          setProposedSQL(statements);
          setSqlReviewed(false);
        } else if (action === 'import_existing' && targetTable && columnMappings.length > 0) {
          // Generate INSERT statements for existing table import
          const statements = generateExistingTableInsertSQL(
            targetTable,
            schema,
            headers,
            columnMappings,
            selectedDataRows,
            enableCasting,
            targetColumns
          );
          setProposedSQL(statements);
          setSqlReviewed(false);
        }
      }
      
      setCurrentStep(nextStep);
    }
  };

  // Generate INSERT SQL for importing to an existing table
  const generateExistingTableInsertSQL = (
    table: string,
    targetSchema: string,
    sourceHeaders: string[],
    mappings: ColumnMapping[],
    rows: any[][],
    castingEnabled: boolean,
    columns: TableColumn[]
  ): SQLStatement[] => {
    // Get mapped columns (non-ignored with a target)
    const activeMappings = mappings.filter(m => !m.ignored && m.targetColumn);
    if (activeMappings.length === 0 || rows.length === 0) {
      console.warn('[generateExistingTableInsertSQL] No active mappings or rows', { activeMappings, rowCount: rows.length });
      return [];
    }

    // Map source column indices
    const sourceIndices = activeMappings.map(m => sourceHeaders.indexOf(m.sourceColumn));
    const targetColumnNames = activeMappings.map(m => m.targetColumn!);
    
    // Find target column types for casting
    const targetColumnTypes = activeMappings.map(m => {
      const col = columns.find(c => c.name === m.targetColumn);
      return col?.type || 'text';
    });

    // Transform rows based on mappings
    const mappedRows = rows.map(row => {
      return sourceIndices.map((srcIdx, i) => {
        const value = srcIdx >= 0 ? row[srcIdx] : null;
        if (castingEnabled && activeMappings[i].castingEnabled) {
          return castValue(value, targetColumnTypes[i]);
        }
        return value;
      });
    });

    const batchSize = calculateBatchSize(targetColumnNames.length, mappedRows.length);
    return generateInsertBatchSQL(table, targetSchema, targetColumnNames, mappedRows, batchSize);
  };

  // Simple value casting helper
  const castValue = (value: any, targetType: string): any => {
    if (value === null || value === undefined || value === '') return null;
    const strVal = String(value).trim();
    
    if (targetType.includes('int') || targetType === 'bigint' || targetType === 'smallint') {
      const parsed = parseInt(strVal.replace(/[^0-9-]/g, ''), 10);
      return isNaN(parsed) ? null : parsed;
    }
    if (targetType.includes('numeric') || targetType.includes('decimal') || targetType === 'real' || targetType === 'double precision') {
      const parsed = parseFloat(strVal.replace(/[^0-9.-]/g, ''));
      return isNaN(parsed) ? null : parsed;
    }
    if (targetType === 'boolean' || targetType === 'bool') {
      const lower = strVal.toLowerCase();
      if (['true', 'yes', '1', 'on'].includes(lower)) return true;
      if (['false', 'no', '0', 'off'].includes(lower)) return false;
      return null;
    }
    if (targetType.includes('timestamp') || targetType === 'date') {
      const d = new Date(strVal);
      return isNaN(d.getTime()) ? null : d;
    }
    return value;
  };

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 'upload':
        return excelData !== null || jsonData !== null;
      case 'normalize':
        // Always can proceed from normalize step - user has made their choice
        return fileType === 'json' && jsonStructure.length >= 0;
      case 'clean':
        if (fileType === 'json' && jsonData && jsonData.tables.length > 1) {
          // Multi-table: check if any table has selected rows
          return Array.from(selectedRowsByTable.values()).some(set => set.size > 0);
        }
        return selectedRows.size > 0 || selectedDataRows.length > 0;
      case 'schema':
        if (fileType === 'json' && jsonData && jsonData.tables.length > 1) {
          // Multi-table JSON always can proceed (auto-creates tables)
          return true;
        }
        return action === 'create_new' 
          ? tableName.trim().length > 0 && tableDef !== null
          : targetTable !== null && columnMappings.some(m => !m.ignored && m.targetColumn);
      case 'review':
        return sqlReviewed && proposedSQL.length > 0;
      case 'execute':
        return executionProgress?.status === 'completed';
      default:
        return false;
    }
  }, [currentStep, excelData, jsonData, fileType, jsonStructure, selectedRows, selectedDataRows, selectedRowsByTable, action, tableName, tableDef, targetTable, columnMappings, sqlReviewed, proposedSQL, executionProgress]);

  const handleFileUploaded = useCallback((
    type: 'excel' | 'csv' | 'json',
    data: ExcelData | ParsedJsonData,
    rawData?: any,
    fileName?: string
  ) => {
    setFileType(type);
    setSelectedRows(new Set());
    
    if (type === 'json') {
      const jsonParsed = data as ParsedJsonData;
      setJsonData(jsonParsed);
      setExcelData(null);
      
      // Store raw JSON for re-parsing with different normalization options
      if (rawData) {
        setRawJsonData(rawData);
        setRawJsonFileName(fileName || 'imported_data');
        // Analyze structure for normalization selector
        const structure = analyzeJsonStructure(rawData);
        setJsonStructure(structure);
      }
      
      if (jsonParsed.tables.length > 0) {
        setSelectedJsonTable(jsonParsed.tables[0].name);
        setTableName(jsonParsed.tables[0].name);
        
        // Initialize selectedRowsByTable with all rows selected for each table
        const initialSelection = new Map<string, Set<number>>();
        jsonParsed.tables.forEach(table => {
          initialSelection.set(table.name, new Set(table.rows.map((_, i) => i)));
        });
        setSelectedRowsByTable(initialSelection);
      }
    } else {
      const excelParsed = data as ExcelData;
      setExcelData(excelParsed);
      setJsonData(null);
      setRawJsonData(null);
      setJsonStructure([]);
      if (excelParsed.sheets.length > 0) {
        setSelectedSheet(excelParsed.sheets[0].name);
        setHeaderRow(excelParsed.sheets[0].headerRowIndex);
        setTableName(excelParsed.fileName.replace(/\.(xlsx?|csv)$/i, '').toLowerCase().replace(/[^a-z0-9_]/g, '_'));
      }
    }
  }, []);

  const resetWizard = useCallback(() => {
    setCurrentStep('upload');
    setFileType(null);
    setExcelData(null);
    setJsonData(null);
    setRawJsonData(null);
    setRawJsonFileName('imported_data');
    setSelectedSheet('');
    setHeaderRow(0);
    setSelectedRows(new Set());
    setSelectedJsonTable('');
    setNormalizationStrategy('partial');
    setCustomTablePaths(new Set());
    setJsonStructure([]);
    setAiMode(false);
    setAiLoading(false);
    setAiExplanation(null);
    setAction('create_new');
    setTargetTable(null);
    setTableName('');
    setTableDef(null);
    setColumnMappings([]);
    setTargetColumns([]);
    setEnableCasting(true);
    setProposedSQL([]);
    setSqlReviewed(false);
    setExecutionProgress(null);
    setIsPaused(false);
  }, []);

  // Call AI agent for schema/mapping suggestions
  const callAiAgent = async () => {
    if (!aiMode || headers.length === 0) return;
    
    setAiLoading(true);
    setAiExplanation(null);
    
    try {
      const sampleData = {
        headers,
        rows: selectedDataRows.slice(0, 100).map(row => 
          headers.map((_, i) => row[i])
        ),
        totalRows: selectedDataRows.length
      };

      const { data, error } = await supabase.functions.invoke('database-agent-import', {
        body: {
          projectId,
          shareToken,
          databaseId,
          connectionId,
          action: action === 'create_new' ? 'propose_schema' : 'propose_mapping',
          sampleData,
          fileType: fileType || 'excel',
          intent: action,
          targetTable: action === 'import_existing' ? targetTable : undefined,
          existingSchema: existingTables.map(t => ({ table_name: t }))
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.fallbackToManual) {
        toast.error('AI analysis failed, please use manual mode');
        setAiMode(false);
        return;
      }

      // Apply AI suggestions
      if (data.columns && action === 'create_new') {
        const aiTableDef: TableDefinition = {
          name: data.proposedTableName || tableName,
          schema,
          columns: data.columns.map((col: any) => ({
            name: col.name,
            type: col.inferredType,
            nullable: col.nullable,
            isPrimaryKey: col.isPrimaryKey || false,
            isUnique: col.isUnique || false
          })),
          indexes: (data.indexes || []).map((idx: string, i: number) => ({
            name: `idx_${tableName}_${i}`,
            columns: [idx],
            unique: false
          }))
        };
        setTableDef(aiTableDef);
        if (data.proposedTableName) setTableName(data.proposedTableName);
      }

      if (data.columnMappings && action === 'import_existing') {
        setColumnMappings(data.columnMappings.map((m: any) => ({
          sourceColumn: m.sourceColumn,
          targetColumn: m.targetColumn,
          ignored: m.ignored,
          castingEnabled: !!m.casting
        })));
      }

      if (data.explanation) {
        setAiExplanation(data.explanation);
        toast.success('AI analysis complete');
      }
    } catch (e: any) {
      console.error('AI agent error:', e);
      toast.error(`AI analysis failed: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) resetWizard();
    onOpenChange(newOpen);
  };

  // Load target table columns when selected
  useEffect(() => {
    if (action === 'import_existing' && targetTable && (databaseId || connectionId)) {
      const loadColumns = async () => {
        try {
          const body: any = { 
            action: 'get_table_columns', 
            shareToken,
            schema: 'public',
            table: targetTable
          };
          if (databaseId) body.databaseId = databaseId;
          if (connectionId) body.connectionId = connectionId;
          
          const { data, error } = await supabase.functions.invoke('manage-database', { body });
          console.log('[Import Wizard] Target columns response:', data);
          if (!error && data?.success && data.data?.columns) {
            // Handle both response formats: {name, type} or {column_name, data_type}
            setTargetColumns(data.data.columns.map((c: any) => ({
              name: c.name || c.column_name,
              type: c.type || c.data_type,
              nullable: c.nullable ?? c.is_nullable === 'YES'
            })));
            // Reset mappings when table changes so they get re-auto-matched
            setColumnMappings([]);
          } else {
            console.error('[Import Wizard] No columns in response:', data);
            setTargetColumns([]);
          }
        } catch (e) {
          console.error('Failed to load columns:', e);
          setTargetColumns([]);
        }
      };
      loadColumns();
    }
  }, [action, targetTable, databaseId, connectionId, shareToken]);

  // Execute import
  const executeImport = async () => {
    // Filter out excluded statements
    const statementsToExecute = proposedSQL.filter((_, i) => !excludedStatements.has(i));
    if (statementsToExecute.length === 0) return;
    
    setExecutionProgress({
      currentBatch: 0,
      totalBatches: proposedSQL.length,
      rowsCompleted: 0,
      totalRows: selectedDataRows.length,
      currentStatement: '',
      status: 'running',
      errors: [],
      startTime: Date.now()
    });

    const errors: { row: number; error: string }[] = [];
    
    for (let i = 0; i < proposedSQL.length; i++) {
      if (isPaused) {
        setExecutionProgress(prev => prev ? { ...prev, status: 'paused' } : null);
        return;
      }

      const stmt = proposedSQL[i];
      
      setExecutionProgress(prev => prev ? {
        ...prev,
        currentBatch: i + 1,
        currentStatement: stmt.description
      } : null);

      try {
        const body: any = { 
          action: 'execute_sql', 
          shareToken,
          sql: stmt.sql
        };
        if (databaseId) body.databaseId = databaseId;
        if (connectionId) body.connectionId = connectionId;
        
        const { data, error } = await supabase.functions.invoke('manage-database', { body });
        
        if (error || !data?.success) {
          errors.push({ row: i, error: data?.error || error?.message || 'Unknown error' });
        } else {
          // Capture DDL statements as migrations (same as SQL Query Editor)
          if (databaseId || connectionId) {
            const ddlStatements = extractDDLStatements(stmt.sql);
            for (const ddl of ddlStatements) {
              try {
                await supabase.rpc("insert_migration_with_token", {
                  p_database_id: databaseId || null,
                  p_connection_id: connectionId || null,
                  p_sql_content: ddl.sql,
                  p_statement_type: ddl.statementType,
                  p_object_type: ddl.objectType,
                  p_token: shareToken || null,
                  p_object_schema: ddl.objectSchema || schema,
                  p_object_name: ddl.objectName,
                });
                console.log(`Migration captured: ${ddl.statementType} ${ddl.objectType} ${ddl.objectName}`);
              } catch (e) {
                console.error("Failed to capture migration:", e);
              }
            }
          }
          
          // Track INSERT progress
          if (stmt.type === 'INSERT') {
            const match = stmt.description.match(/(\d+)-(\d+)/);
            if (match) {
              setExecutionProgress(prev => prev ? {
                ...prev,
                rowsCompleted: parseInt(match[2], 10)
              } : null);
            }
          }
        }
      } catch (e: any) {
        errors.push({ row: i, error: e.message });
      }
    }

    setExecutionProgress(prev => prev ? {
      ...prev,
      status: errors.length > 0 ? 'error' : 'completed',
      errors,
      rowsCompleted: selectedDataRows.length
    } : null);

    if (errors.length === 0) {
      toast.success('Import completed successfully!');
    } else {
      toast.error(`Import completed with ${errors.length} error(s)`);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'upload':
        return (
          <div className="space-y-6">
            <FileUploader onFileUploaded={handleFileUploaded} />
            {(excelData || jsonData) && (
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {fileType === 'json' ? <FileJson className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}
                  <span>
                    {fileType === 'json' 
                      ? `${jsonData?.tables.length} table(s) detected, ${jsonData?.totalRows} total rows`
                      : `${excelData?.sheets.length} sheet(s), ${excelData?.sheets.reduce((acc, s) => acc + s.rows.length, 0)} total rows`
                    }
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      
      case 'normalize':
        // Only shown for JSON files
        return (
          <div className="h-full overflow-auto">
            <JsonNormalizationSelector
              structure={jsonStructure}
              strategy={normalizationStrategy}
              onStrategyChange={setNormalizationStrategy}
              customPaths={customTablePaths}
              onCustomPathsChange={setCustomTablePaths}
            />
          </div>
        );
      
      case 'clean':
        return (
          <div className="h-full flex flex-col">
            {fileType === 'json' && jsonData ? (
              <JsonDataViewer
                data={jsonData}
                selectedTable={selectedJsonTable}
                onTableChange={setSelectedJsonTable}
                selectedRowsByTable={selectedRowsByTable}
                onSelectedRowsByTableChange={setSelectedRowsByTable}
              />
            ) : excelData ? (
              <ExcelDataGrid
                sheets={excelData.sheets}
                selectedSheet={selectedSheet}
                onSheetChange={setSelectedSheet}
                headerRow={headerRow}
                onHeaderRowChange={setHeaderRow}
                selectedRows={selectedRows}
                onSelectedRowsChange={setSelectedRows}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No data to preview
              </div>
            )}
          </div>
        );
      
      case 'schema':
        // For multi-table JSON, show all tables
        const isMultiTableJson = fileType === 'json' && jsonData && jsonData.tables.length > 1;
        
        return (
          <div className="h-full flex flex-col gap-4">
            {/* Table selector for multi-table JSON */}
            {isMultiTableJson && (
              <div className="flex items-center gap-4 shrink-0">
                <Label className="text-sm font-medium whitespace-nowrap">Configure Table:</Label>
                <Select value={selectedJsonTable} onValueChange={setSelectedJsonTable}>
                  <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder="Select a table" />
                  </SelectTrigger>
                  <SelectContent>
                    {jsonData.tables.map(t => (
                      <SelectItem key={t.name} value={t.name}>
                        {t.name} ({t.rows.length} rows)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  All {jsonData.tables.length} tables will be created with relationships
                </span>
              </div>
            )}
            
            {/* Show full SchemaCreator for selected table in multi-table mode - ABOVE the diagram */}
            {isMultiTableJson && selectedJsonTable && (
              <div className="flex-1 min-h-[300px] overflow-auto border rounded-lg p-4">
                <SchemaCreator
                  key={selectedJsonTable}
                  headers={headers.filter(h => h !== '_row_id')}
                  sampleData={memoizedSampleData}
                  tableName={selectedJsonTable}
                  onTableNameChange={() => {}} // Table names are fixed from JSON structure
                  onTableDefChange={(def) => handleMultiTableDefChange(selectedJsonTable, def)}
                  schema={schema}
                />
              </div>
            )}
            
            {/* Show relationship diagram for multi-table JSON - below SchemaCreator */}
            {isMultiTableJson && (
              <div className="space-y-2 shrink-0 h-[180px]">
                <Label className="text-sm font-medium">Table Relationships (click to select)</Label>
                <JsonRelationshipFlow
                  tables={jsonData.tables.map(t => ({
                    name: t.name,
                    columns: getJsonHeaders(t),
                    parentTable: t.parentTable,
                    foreignKey: t.foreignKey
                  }))}
                  relationships={jsonData.relationships}
                  onTableClick={(name) => setSelectedJsonTable(name)}
                />
              </div>
            )}
            
            {/* Action Toggle - hide for multi-table JSON since we auto-create */}
            {!isMultiTableJson && (
              <Tabs value={action} onValueChange={(v) => setAction(v as ImportAction)} className="flex-1 flex flex-col min-h-0">
                <TabsList className="grid w-full grid-cols-2 shrink-0">
                  <TabsTrigger value="create_new" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create New Table
                  </TabsTrigger>
                  <TabsTrigger value="import_existing" className="gap-2" disabled={existingTables.length === 0}>
                    <ArrowRight className="h-4 w-4" />
                    Import to Existing
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="create_new" className="flex-1 mt-4 min-h-0 overflow-auto">
                  <SchemaCreator
                    headers={headers}
                    sampleData={memoizedSampleData}
                    tableName={tableName}
                    onTableNameChange={setTableName}
                    onTableDefChange={handleTableDefChange}
                    schema={schema}
                  />
                </TabsContent>
                
                <TabsContent value="import_existing" className="flex-1 mt-4 min-h-0 overflow-auto">
                  <FieldMapper
                    sourceHeaders={headers}
                    targetTables={existingTables}
                    selectedTable={targetTable || ''}
                    onTableChange={setTargetTable}
                    targetColumns={targetColumns}
                    mappings={columnMappings}
                    onMappingsChange={setColumnMappings}
                    enableCasting={enableCasting}
                    onEnableCastingChange={setEnableCasting}
                  />
                </TabsContent>
              </Tabs>
            )}
          </div>
        );
      
      case 'review':
        return (
          <div className="h-full flex flex-col">
            <SqlReviewPanel
              statements={proposedSQL}
              reviewed={sqlReviewed}
              onReviewedChange={setSqlReviewed}
              excludedStatements={excludedStatements}
              onExcludedChange={setExcludedStatements}
            />
          </div>
        );
      
      case 'execute':
        // Calculate total rows for multi-table JSON
        const totalRowsToImport = fileType === 'json' && jsonData && jsonData.tables.length > 1
          ? Array.from(selectedRowsByTable.values()).reduce((sum, set) => sum + set.size, 0)
          : selectedDataRows.length;
        
        return (
          <div className="h-full flex flex-col">
            {executionProgress ? (
              <ImportProgressTracker
                progress={executionProgress}
                onPause={() => setIsPaused(true)}
                onResume={() => { setIsPaused(false); executeImport(); }}
                onCancel={() => {
                  setIsPaused(true);
                  setExecutionProgress(prev => prev ? { ...prev, status: 'error' } : null);
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <Database className="h-16 w-16 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Ready to Import</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  {proposedSQL.length} SQL statements will be executed to import {totalRowsToImport} rows
                  {fileType === 'json' && jsonData && jsonData.tables.length > 1 && ` across ${jsonData.tables.length} tables`}.
                </p>
                <Button onClick={executeImport} size="lg">
                  Start Import
                </Button>
              </div>
            )}
          </div>
        );
      
      default:
        return null;
    }
  };

  // Check if a step can be navigated to (for forward navigation)
  const canNavigateToStep = (stepIndex: number): boolean => {
    if (stepIndex === currentStepIndex) return true;
    if (stepIndex < currentStepIndex) return executionProgress?.status !== 'running';
    // For forward navigation, check if current step can proceed
    if (stepIndex === currentStepIndex + 1) return canProceed();
    return false;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[90vw] h-[90vh] max-w-none flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Import Data
          </DialogTitle>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-between px-2 py-4 border-b border-border shrink-0">
          {STEPS.map((step, index) => {
            const isActive = step.key === currentStep;
            const isCompleted = index < currentStepIndex;
            // Can navigate to completed steps, current step, or next step if canProceed
            const canNavigate = canNavigateToStep(index) && step.key !== currentStep;
            
            const handleStepClick = () => {
              if (canNavigate) {
                // If navigating forward to review, generate SQL
                if (step.key === 'review' && index > currentStepIndex) {
                  if (fileType === 'json' && jsonData && jsonData.tables.length > 1) {
                    // Multi-table JSON import
                    const statements = generateMultiTableImportSQL(
                      jsonData.tables,
                      jsonData.relationships,
                      schema,
                      selectedRowsByTable
                    );
                    setProposedSQL(statements);
                    setSqlReviewed(false);
                  } else if (action === 'create_new' && tableDef) {
                    const batchSize = calculateBatchSize(tableDef.columns.length, selectedDataRows.length);
                    const statements = generateFullImportSQL(tableDef, selectedDataRows, batchSize);
                    setProposedSQL(statements);
                    setSqlReviewed(false);
                  } else if (action === 'import_existing' && targetTable && columnMappings.length > 0) {
                    const statements = generateExistingTableInsertSQL(
                      targetTable,
                      schema,
                      headers,
                      columnMappings,
                      selectedDataRows,
                      enableCasting,
                      targetColumns
                    );
                    setProposedSQL(statements);
                    setSqlReviewed(false);
                  }
                }
                setCurrentStep(step.key);
              }
            };
            
            return (
              <React.Fragment key={step.key}>
                <button
                  type="button"
                  onClick={handleStepClick}
                  disabled={!canNavigate}
                  className={cn(
                    "flex items-center gap-2 transition-opacity",
                    canNavigate && "cursor-pointer hover:opacity-80",
                    !canNavigate && "cursor-default"
                  )}
                >
                  <div className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors",
                    isActive && "border-primary bg-primary text-primary-foreground",
                    isCompleted && "border-primary bg-primary/20 text-primary",
                    !isActive && !isCompleted && "border-muted-foreground/30 text-muted-foreground"
                  )}>
                    {isCompleted ? <Check className="h-4 w-4" /> : step.icon}
                  </div>
                  <span className={cn(
                    "text-sm font-medium hidden sm:inline",
                    isActive && "text-primary",
                    !isActive && "text-muted-foreground"
                  )}>
                    {step.label}
                  </span>
                </button>
                {index < STEPS.length - 1 && (
                  <div className={cn("flex-1 h-0.5 mx-2", isCompleted ? "bg-primary" : "bg-muted-foreground/30")} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto py-4 min-h-0">
          {renderStepContent()}
        </div>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={goBack} disabled={!canGoBack}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="text-sm text-muted-foreground">Step {currentStepIndex + 1} of {STEPS.length}</div>
          {currentStep === 'execute' ? (
            <Button onClick={() => { onImportComplete?.(); handleOpenChange(false); }} disabled={executionProgress?.status !== 'completed'}>
              Done
            </Button>
          ) : (
            <Button onClick={goNext} disabled={!canProceed()}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
