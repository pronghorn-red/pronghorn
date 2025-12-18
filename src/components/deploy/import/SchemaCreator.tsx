import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Key, Hash, Fingerprint, AlertCircle, Sparkles } from 'lucide-react';

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

  // Infer column types from sample data
  useEffect(() => {
    const inferred = headers.map((header, idx) => {
      const values = sampleData.slice(0, sampleSize).map(row => row[idx]);
      const info = inferColumnType(values, header, sampleSize);
      
      return {
        name: sanitizeColumnName(header),
        originalName: header,
        type: info.inferredType,
        nullable: info.nullable,
        isPrimaryKey: !addAutoId && info.suggestPrimaryKey,
        isUnique: info.uniqueRatio > 0.99 && !info.suggestPrimaryKey,
        hasIndex: info.suggestIndex,
        inferredInfo: info
      };
    });

    setColumns(inferred);
  }, [headers, sampleData, sampleSize, addAutoId]);

  // Update parent when columns change
  useEffect(() => {
    const columnDefs: ColumnDefinition[] = [];
    const indexes: IndexDefinition[] = [];

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
    }

    // Add user columns
    columns.forEach(col => {
      columnDefs.push({
        name: col.name,
        type: col.type,
        nullable: col.nullable,
        isPrimaryKey: !addAutoId && col.isPrimaryKey,
        isUnique: col.isUnique && !col.isPrimaryKey
      });

      if (col.hasIndex && !col.isPrimaryKey && !col.isUnique) {
        indexes.push({
          name: `idx_${sanitizeTableName(tableName)}_${col.name}`,
          columns: [col.name],
          unique: false
        });
      }
    });

    onTableDefChange({
      name: sanitizeTableName(tableName),
      schema,
      columns: columnDefs,
      indexes
    });
  }, [columns, tableName, schema, addAutoId, onTableDefChange]);

  const updateColumn = (idx: number, updates: Partial<ColumnConfig>) => {
    setColumns(prev => prev.map((col, i) => 
      i === idx ? { ...col, ...updates } : col
    ));
  };

  const sanitizedTableName = sanitizeTableName(tableName);
  const hasValidName = sanitizedTableName.length > 0;

  return (
    <div className="flex flex-col h-full gap-4">
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

      {/* Column Configuration */}
      <div className="flex-1 border rounded-lg overflow-hidden min-h-0">
        <ScrollArea className="h-full">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
              <tr>
                <th className="px-3 py-2 border-b text-left font-medium">Column Name</th>
                <th className="px-3 py-2 border-b text-left font-medium">Type</th>
                <th className="px-3 py-2 border-b text-center font-medium w-20">Nullable</th>
                <th className="px-3 py-2 border-b text-center font-medium w-20" title="Primary Key">
                  <Key className="h-4 w-4 mx-auto" />
                </th>
                <th className="px-3 py-2 border-b text-center font-medium w-20" title="Unique">
                  <Fingerprint className="h-4 w-4 mx-auto" />
                </th>
                <th className="px-3 py-2 border-b text-center font-medium w-20" title="Index">
                  <Hash className="h-4 w-4 mx-auto" />
                </th>
                <th className="px-3 py-2 border-b text-left font-medium">Sample Values</th>
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
                <tr key={idx} className="hover:bg-muted/30">
                  <td className="px-3 py-2 border-b">
                    <Input
                      value={col.name}
                      onChange={(e) => updateColumn(idx, { name: sanitizeColumnName(e.target.value) })}
                      className="h-8 font-mono text-xs"
                    />
                    {col.name !== col.originalName && (
                      <span className="text-xs text-muted-foreground">
                        from: {col.originalName}
                      </span>
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
        </ScrollArea>
      </div>

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        {columns.length} columns • {addAutoId ? 1 : columns.filter(c => c.isPrimaryKey).length} primary key • 
        {columns.filter(c => c.hasIndex).length} indexes
      </div>
    </div>
  );
}
