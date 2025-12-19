import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  ColumnTypeInfo, 
  PostgresType, 
  inferColumnType 
} from '@/utils/typeInference';
import { 
  sanitizeTableName, 
  sanitizeColumnName,
  TableDefinition,
  ColumnDefinition,
  IndexDefinition
} from '@/utils/sqlGenerator';
import { Key, Hash, Fingerprint, AlertCircle, Sparkles, AlertTriangle } from 'lucide-react';

const POSTGRES_TYPES: PostgresType[] = [
  'TEXT',
  'INTEGER',
  'BIGINT',
  'NUMERIC',
  'BOOLEAN',
  'DATE',
  'TIMESTAMP WITH TIME ZONE',
  'UUID',
  'JSONB'
];

interface SchemaCreatorProps {
  headers: string[];
  sampleData: any[][];
  tableName: string;
  onTableNameChange: (name: string) => void;
  onTableDefChange: (def: TableDefinition) => void;
  schema?: string;
  sampleSize?: number;
}

interface ColumnConfig {
  name: string;
  originalName: string;
  type: PostgresType;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  hasIndex: boolean;
  inferredInfo: ColumnTypeInfo;
  wasRenamed?: boolean;
}

export default function SchemaCreator({
  headers,
  sampleData,
  tableName,
  onTableNameChange,
  onTableDefChange,
  schema = 'public',
  sampleSize = 1000
}: SchemaCreatorProps) {
  const [addAutoId, setAddAutoId] = useState(true);
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  
  // Track the headers we've initialized with to prevent re-running inference
  const initializedHeadersRef = useRef<string | null>(null);
  const prevTableDefRef = useRef<string>('');

  // Check if source data has an "id" column (case-insensitive)
  const sourceHasIdColumn = useMemo(() => {
    return headers.some(h => h?.toLowerCase() === 'id');
  }, [headers]);

  // Infer column types from sample data - ONLY on initial load or when headers actually change
  useEffect(() => {
    const headersKey = JSON.stringify(headers);
    
    // Skip if already initialized with these headers or no headers
    if (headersKey === initializedHeadersRef.current || headers.length === 0) {
      return;
    }
    
    // Mark as initialized with these headers
    initializedHeadersRef.current = headersKey;

    const inferred = headers.map((header, idx) => {
      const values = sampleData.slice(0, sampleSize).map(row => row[idx]);
      const info = inferColumnType(values, header, sampleSize);
      
      // Sanitize column name
      let sanitizedName = sanitizeColumnName(header);
      let wasRenamed = false;
      
      // Check for duplicate "id" conflict when auto-ID is enabled
      if (addAutoId && sanitizedName.toLowerCase() === 'id') {
        sanitizedName = 'original_id';
        wasRenamed = true;
      }
      
      return {
        name: sanitizedName,
        originalName: header,
        type: info.inferredType,
        nullable: info.nullable,
        isPrimaryKey: false, // Don't auto-set PK, let user decide
        isUnique: info.uniqueRatio > 0.99 && !info.suggestPrimaryKey,
        hasIndex: info.suggestIndex,
        inferredInfo: info,
        wasRenamed
      };
    });

    setColumns(inferred);
  }, [headers]); // Only depend on headers - NOT addAutoId

  // Handle addAutoId change separately - just update column names for id conflict
  useEffect(() => {
    if (columns.length === 0) return;
    
    setColumns(prev => prev.map(col => {
      const sanitizedName = sanitizeColumnName(col.originalName);
      
      // Check for duplicate "id" conflict when auto-ID is enabled
      if (addAutoId && sanitizedName.toLowerCase() === 'id') {
        return { ...col, name: 'original_id', wasRenamed: true };
      } else if (!addAutoId && col.wasRenamed && col.name === 'original_id') {
        // Restore original id name if auto-id is disabled
        return { ...col, name: sanitizedName, wasRenamed: false };
      }
      return col;
    }));
  }, [addAutoId]);

  // Update parent when columns change - with deduplication to prevent loops
  useEffect(() => {
    if (columns.length === 0) return;
    
    const columnDefs: ColumnDefinition[] = [];
    const indexes: IndexDefinition[] = [];
    const usedNames = new Set<string>();

    // Add auto-generated UUID if enabled
    if (addAutoId) {
      columnDefs.push({
        name: 'id',
        type: 'UUID',
        nullable: false,
        isPrimaryKey: true,
        isUnique: true,
        defaultValue: 'gen_random_uuid()'
      });
      usedNames.add('id');
    }

    // Add user columns, checking for duplicates
    columns.forEach(col => {
      let finalName = col.name;
      
      // Ensure no duplicate column names
      if (usedNames.has(finalName.toLowerCase())) {
        // Append suffix to make unique
        let suffix = 2;
        while (usedNames.has(`${finalName}_${suffix}`.toLowerCase())) {
          suffix++;
        }
        finalName = `${finalName}_${suffix}`;
      }
      usedNames.add(finalName.toLowerCase());
      
      columnDefs.push({
        name: finalName,
        type: col.type,
        nullable: col.nullable,
        isPrimaryKey: !addAutoId && col.isPrimaryKey,
        isUnique: col.isUnique && !col.isPrimaryKey
      });

      if (col.hasIndex && !col.isPrimaryKey && !col.isUnique) {
        indexes.push({
          name: `idx_${sanitizeTableName(tableName)}_${finalName}`,
          columns: [finalName],
          unique: false
        });
      }
    });

    const newDef: TableDefinition = {
      name: sanitizeTableName(tableName),
      schema,
      columns: columnDefs,
      indexes
    };
    
    // Only notify parent if definition actually changed
    const defJson = JSON.stringify(newDef);
    if (defJson !== prevTableDefRef.current) {
      prevTableDefRef.current = defJson;
      onTableDefChange(newDef);
    }
  }, [columns, tableName, schema, addAutoId, onTableDefChange]);

  const updateColumn = (idx: number, updates: Partial<ColumnConfig>) => {
    setColumns(prev => prev.map((col, i) => 
      i === idx ? { ...col, ...updates } : col
    ));
  };

  const sanitizedTableName = sanitizeTableName(tableName);
  const hasValidName = sanitizedTableName.length > 0;

  // Count renamed columns
  const renamedColumnsCount = columns.filter(c => c.wasRenamed).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Table Name */}
      <div className="space-y-2">
        <Label>Table Name</Label>
        <div className="flex items-center gap-2">
          <Input
            value={tableName}
            onChange={(e) => onTableNameChange(e.target.value)}
            placeholder="Enter table name"
            className={cn(!hasValidName && "border-destructive")}
          />
          {tableName !== sanitizedTableName && (
            <Badge variant="secondary" className="whitespace-nowrap">
              → {sanitizedTableName}
            </Badge>
          )}
        </div>
        {!hasValidName && (
          <p className="text-sm text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Table name is required
          </p>
        )}
      </div>

      {/* Options */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="auto-id"
            checked={addAutoId}
            onCheckedChange={(checked) => setAddAutoId(!!checked)}
          />
          <Label htmlFor="auto-id" className="text-sm cursor-pointer">
            Add auto-generated UUID primary key
          </Label>
        </div>
      </div>

      {/* Warning if source has 'id' column and auto-ID is enabled */}
      {addAutoId && sourceHasIdColumn && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-sm text-muted-foreground">
            Your data has an "id" column which conflicts with the auto-generated primary key. 
            It has been renamed to "original_id" to avoid duplication.
          </p>
        </div>
      )}

      {/* Column Configuration */}
      <div className="flex-1 w-full border rounded-lg min-h-0 overflow-auto">
        <div className="w-full overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
            <tr>
              <th className="px-3 py-2 border-b text-left font-medium min-w-[180px] bg-muted/80">Column Name</th>
              <th className="px-3 py-2 border-b text-left font-medium min-w-[180px] bg-muted/80">Type</th>
              <th className="px-3 py-2 border-b text-center font-medium w-20 bg-muted/80">Nullable</th>
              <th className="px-3 py-2 border-b text-center font-medium w-20 bg-muted/80" title="Primary Key">
                <Key className="h-4 w-4 mx-auto" />
              </th>
              <th className="px-3 py-2 border-b text-center font-medium w-20 bg-muted/80" title="Unique">
                <Fingerprint className="h-4 w-4 mx-auto" />
              </th>
              <th className="px-3 py-2 border-b text-center font-medium w-20 bg-muted/80" title="Index">
                <Hash className="h-4 w-4 mx-auto" />
              </th>
              <th className="px-3 py-2 border-b text-left font-medium min-w-[200px] bg-muted/80">Sample Values</th>
            </tr>
          </thead>
          <tbody>
            {addAutoId && (
              <tr className="bg-primary/5">
                <td className="px-3 py-2 border-b">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">id</span>
                    <Badge variant="outline" className="text-xs">auto</Badge>
                  </div>
                </td>
                <td className="px-3 py-2 border-b">
                  <span className="font-mono text-xs">UUID</span>
                </td>
                <td className="px-3 py-2 border-b text-center">
                  <Checkbox checked={false} disabled />
                </td>
                <td className="px-3 py-2 border-b text-center">
                  <Checkbox checked={true} disabled />
                </td>
                <td className="px-3 py-2 border-b text-center">
                  <Checkbox checked={true} disabled />
                </td>
                <td className="px-3 py-2 border-b text-center">
                  <Checkbox checked={false} disabled />
                </td>
                <td className="px-3 py-2 border-b text-muted-foreground italic text-xs">
                  gen_random_uuid()
                </td>
              </tr>
            )}
            {columns.map((col, idx) => (
              <tr key={idx} className={cn("hover:bg-muted/30", col.wasRenamed && "bg-amber-500/5")}>
                <td className="px-3 py-2 border-b">
                  <Input
                    value={col.name}
                    onChange={(e) => updateColumn(idx, { name: sanitizeColumnName(e.target.value), wasRenamed: false })}
                    className="h-8 font-mono text-xs"
                  />
                  {(col.name !== col.originalName || col.wasRenamed) && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-muted-foreground">
                        from: {col.originalName}
                      </span>
                      {col.wasRenamed && (
                        <Badge variant="outline" className="text-xs text-amber-600">renamed</Badge>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 border-b">
                  <Select
                    value={col.type}
                    onValueChange={(v) => updateColumn(idx, { type: v as PostgresType })}
                  >
                    <SelectTrigger className="h-8 font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POSTGRES_TYPES.map(t => (
                        <SelectItem key={t} value={t} className="font-mono text-xs">
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {col.type !== col.inferredInfo.inferredType && (
                    <div className="flex items-center gap-1 mt-1">
                      <Sparkles className="h-3 w-3 text-amber-500" />
                      <span className="text-xs text-muted-foreground">
                        AI suggested: {col.inferredInfo.inferredType}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 border-b text-center">
                  <Checkbox
                    checked={col.nullable}
                    onCheckedChange={(checked) => updateColumn(idx, { nullable: !!checked })}
                  />
                </td>
                <td className="px-3 py-2 border-b text-center">
                  <Checkbox
                    checked={col.isPrimaryKey}
                    onCheckedChange={(checked) => updateColumn(idx, { 
                      isPrimaryKey: !!checked,
                      isUnique: checked ? false : col.isUnique,
                      hasIndex: checked ? false : col.hasIndex
                    })}
                    disabled={addAutoId}
                  />
                </td>
                <td className="px-3 py-2 border-b text-center">
                  <Checkbox
                    checked={col.isUnique}
                    onCheckedChange={(checked) => updateColumn(idx, { isUnique: !!checked })}
                    disabled={col.isPrimaryKey}
                  />
                </td>
                <td className="px-3 py-2 border-b text-center">
                  <Checkbox
                    checked={col.hasIndex}
                    onCheckedChange={(checked) => updateColumn(idx, { hasIndex: !!checked })}
                    disabled={col.isPrimaryKey || col.isUnique}
                  />
                </td>
                <td className="px-3 py-2 border-b">
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {col.inferredInfo.sampleValues.slice(0, 3).map((v, i) => (
                      <Badge key={i} variant="secondary" className="text-xs font-normal truncate max-w-[80px]">
                        {v === null ? 'null' : String(v)}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {Math.round(col.inferredInfo.castingSuccessRate * 100)}% cast success
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        {columns.length} columns • {addAutoId ? 1 : columns.filter(c => c.isPrimaryKey).length} primary key • 
        {columns.filter(c => c.hasIndex).length} indexes
        {renamedColumnsCount > 0 && (
          <span className="text-amber-600"> • {renamedColumnsCount} column(s) renamed</span>
        )}
      </div>
    </div>
  );
}
