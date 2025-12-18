import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight, Upload, Sparkles, Database, FileSpreadsheet, FileJson, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExcelData, SheetData } from '@/utils/parseExcel';
import { ParsedJsonData, JsonTable } from '@/utils/parseJson';
import { ColumnTypeInfo, CastingRule } from '@/utils/typeInference';
import { SQLStatement, TableDefinition } from '@/utils/sqlGenerator';
import FileUploader from './import/FileUploader';

// Wizard step types
type WizardStep = 'upload' | 'clean' | 'schema' | 'review' | 'execute';

// Import action type
type ImportAction = 'create_new' | 'import_existing';

// Column mapping type
interface ColumnMapping {
  sourceColumn: string;
  targetColumn: string | null;
  ignored: boolean;
  constantValue?: string;
  castingRule?: CastingRule;
}

// Execution progress type
interface ExecutionProgress {
  currentBatch: number;
  totalBatches: number;
  rowsCompleted: number;
  totalRows: number;
  currentStatement: string;
  status: 'running' | 'paused' | 'completed' | 'error';
  errors: { row: number; error: string }[];
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
  { key: 'clean', label: 'Clean', icon: <FileSpreadsheet className="h-4 w-4" /> },
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
  // Current step
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload');
  
  // File and data state
  const [fileType, setFileType] = useState<'excel' | 'csv' | 'json' | null>(null);
  const [excelData, setExcelData] = useState<ExcelData | null>(null);
  const [jsonData, setJsonData] = useState<ParsedJsonData | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [headerRow, setHeaderRow] = useState<number>(0);
  const [selectedRows, setSelectedRows] = useState<Map<string, Set<number>>>(new Map());
  
  // AI mode
  const [aiMode, setAiMode] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  
  // Schema/mapping state
  const [action, setAction] = useState<ImportAction>('create_new');
  const [targetTable, setTargetTable] = useState<string | null>(null);
  const [tableName, setTableName] = useState<string>('');
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [columnTypeInfos, setColumnTypeInfos] = useState<ColumnTypeInfo[]>([]);
  const [tableDef, setTableDef] = useState<TableDefinition | null>(null);
  
  // SQL review state
  const [proposedSQL, setProposedSQL] = useState<SQLStatement[]>([]);
  const [sqlReviewed, setSqlReviewed] = useState(false);
  
  // Execution state
  const [executionProgress, setExecutionProgress] = useState<ExecutionProgress | null>(null);

  // Get current step index
  const currentStepIndex = STEPS.findIndex(s => s.key === currentStep);

  // Navigation handlers
  const canGoBack = currentStepIndex > 0 && executionProgress?.status !== 'running';
  const canGoNext = currentStepIndex < STEPS.length - 1;

  const goBack = () => {
    if (canGoBack) {
      setCurrentStep(STEPS[currentStepIndex - 1].key);
    }
  };

  const goNext = () => {
    if (canGoNext) {
      setCurrentStep(STEPS[currentStepIndex + 1].key);
    }
  };

  // Validate current step for next button
  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 'upload':
        return (excelData !== null || jsonData !== null);
      case 'clean':
        return true; // Can always proceed from clean
      case 'schema':
        return action === 'create_new' 
          ? tableName.trim().length > 0 && columnTypeInfos.length > 0
          : targetTable !== null && columnMappings.some(m => !m.ignored && m.targetColumn);
      case 'review':
        return sqlReviewed && proposedSQL.length > 0;
      case 'execute':
        return executionProgress?.status === 'completed';
      default:
        return false;
    }
  }, [currentStep, excelData, jsonData, action, tableName, columnTypeInfos, targetTable, columnMappings, sqlReviewed, proposedSQL, executionProgress]);

  // Handle file upload
  const handleFileUploaded = useCallback((
    type: 'excel' | 'csv' | 'json',
    data: ExcelData | ParsedJsonData
  ) => {
    setFileType(type);
    
    if (type === 'json') {
      setJsonData(data as ParsedJsonData);
      setExcelData(null);
      // Auto-set table name from first table
      const jsonParsed = data as ParsedJsonData;
      if (jsonParsed.tables.length > 0) {
        setTableName(jsonParsed.tables[0].name);
      }
    } else {
      setExcelData(data as ExcelData);
      setJsonData(null);
      // Auto-select first sheet
      const excelParsed = data as ExcelData;
      if (excelParsed.sheets.length > 0) {
        setSelectedSheet(excelParsed.sheets[0].name);
        setHeaderRow(excelParsed.sheets[0].headerRowIndex);
        // Auto-set table name from file name
        setTableName(excelParsed.fileName.replace(/\.(xlsx?|csv)$/i, '').toLowerCase().replace(/[^a-z0-9_]/g, '_'));
      }
    }
  }, []);

  // Reset wizard state
  const resetWizard = useCallback(() => {
    setCurrentStep('upload');
    setFileType(null);
    setExcelData(null);
    setJsonData(null);
    setSelectedSheet('');
    setHeaderRow(0);
    setSelectedRows(new Map());
    setAiMode(false);
    setAiLoading(false);
    setAction('create_new');
    setTargetTable(null);
    setTableName('');
    setColumnMappings([]);
    setColumnTypeInfos([]);
    setTableDef(null);
    setProposedSQL([]);
    setSqlReviewed(false);
    setExecutionProgress(null);
  }, []);

  // Handle dialog close
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetWizard();
    }
    onOpenChange(newOpen);
  };

  // Get step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 'upload':
        return (
          <div className="space-y-6">
            <FileUploader onFileUploaded={handleFileUploaded} />
            
            {(excelData || jsonData) && (
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {fileType === 'json' ? (
                    <FileJson className="h-4 w-4" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4" />
                  )}
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
      
      case 'clean':
        return (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <p>Data cleaning step - Coming soon</p>
          </div>
        );
      
      case 'schema':
        return (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <p>Schema creation/mapping step - Coming soon</p>
          </div>
        );
      
      case 'review':
        return (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <p>SQL review step - Coming soon</p>
          </div>
        );
      
      case 'execute':
        return (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <p>Execution step - Coming soon</p>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Import Data
          </DialogTitle>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-between px-2 py-4 border-b border-border">
          {STEPS.map((step, index) => {
            const isActive = step.key === currentStep;
            const isCompleted = index < currentStepIndex;
            
            return (
              <React.Fragment key={step.key}>
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors",
                      isActive && "border-primary bg-primary text-primary-foreground",
                      isCompleted && "border-primary bg-primary/20 text-primary",
                      !isActive && !isCompleted && "border-muted-foreground/30 text-muted-foreground"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      step.icon
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium hidden sm:inline",
                      isActive && "text-primary",
                      !isActive && "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 mx-2",
                      isCompleted ? "bg-primary" : "bg-muted-foreground/30"
                    )}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* AI Mode Toggle */}
        <div className="flex items-center justify-between px-2 py-2 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <Label htmlFor="ai-mode" className="text-sm font-medium">
              AI-Assisted Mode
            </Label>
          </div>
          <Switch
            id="ai-mode"
            checked={aiMode}
            onCheckedChange={setAiMode}
            disabled={aiLoading}
          />
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto py-4 min-h-[300px]">
          {renderStepContent()}
        </div>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={!canGoBack}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>

          <div className="text-sm text-muted-foreground">
            Step {currentStepIndex + 1} of {STEPS.length}
          </div>

          {currentStep === 'execute' ? (
            <Button
              onClick={() => {
                onImportComplete?.();
                handleOpenChange(false);
              }}
              disabled={executionProgress?.status !== 'completed'}
            >
              Done
            </Button>
          ) : (
            <Button
              onClick={goNext}
              disabled={!canProceed()}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
