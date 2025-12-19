import React, { useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ParsedJsonData, JsonTable, getJsonHeaders, getJsonRowsAsArray } from '@/utils/parseJson';
import { Table2, GitBranch, CheckSquare, Square } from 'lucide-react';

interface JsonDataViewerProps {
  data: ParsedJsonData;
  selectedTable: string;
  onTableChange: (tableName: string) => void;
  selectedRowsByTable: Map<string, Set<number>>;
  onSelectedRowsByTableChange: (rows: Map<string, Set<number>>) => void;
  maxPreviewRows?: number;
}

export default function JsonDataViewer({
  data,
  selectedTable,
  onTableChange,
  selectedRowsByTable,
  onSelectedRowsByTableChange,
  maxPreviewRows = 100
}: JsonDataViewerProps) {
  const currentTable = useMemo(() =>
    data.tables.find(t => t.name === selectedTable) || data.tables[0],
    [data.tables, selectedTable]
  );

  const headers = useMemo(() => 
    currentTable ? getJsonHeaders(currentTable) : [],
    [currentTable]
  );

  const rows = useMemo(() =>
    currentTable ? getJsonRowsAsArray(currentTable) : [],
    [currentTable]
  );

  const displayRows = rows.slice(0, maxPreviewRows);

  // Get selected rows for current table
  const selectedRows = useMemo(() => 
    selectedRowsByTable.get(currentTable?.name || '') || new Set<number>(),
    [selectedRowsByTable, currentTable?.name]
  );

  // Auto-select all rows when table changes and has no selection
  useEffect(() => {
    if (currentTable && rows.length > 0) {
      const currentSelection = selectedRowsByTable.get(currentTable.name);
      if (!currentSelection || currentSelection.size === 0) {
        const newMap = new Map(selectedRowsByTable);
        newMap.set(currentTable.name, new Set(rows.map((_, i) => i)));
        onSelectedRowsByTableChange(newMap);
      }
    }
  }, [currentTable?.name, rows.length]);

  const handleSelectAll = () => {
    if (!currentTable) return;
    const newMap = new Map(selectedRowsByTable);
    
    if (selectedRows.size === rows.length) {
      newMap.set(currentTable.name, new Set());
    } else {
      newMap.set(currentTable.name, new Set(rows.map((_, i) => i)));
    }
    onSelectedRowsByTableChange(newMap);
  };

  const handleRowSelect = (idx: number) => {
    if (!currentTable) return;
    const newMap = new Map(selectedRowsByTable);
    const newSelected = new Set(selectedRows);
    
    if (newSelected.has(idx)) {
      newSelected.delete(idx);
    } else {
      newSelected.add(idx);
    }
    newMap.set(currentTable.name, newSelected);
    onSelectedRowsByTableChange(newMap);
  };

  const allSelected = selectedRows.size === rows.length && rows.length > 0;

  // Show relationships if multiple tables
  const hasRelationships = data.relationships.length > 0;

  // Calculate total selected across all tables
  const totalSelectedRows = useMemo(() => {
    let total = 0;
    selectedRowsByTable.forEach((selection) => {
      total += selection.size;
    });
    return total;
  }, [selectedRowsByTable]);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        {data.tables.length > 1 && (
          <div className="flex items-center gap-2">
            <Label className="text-sm">Table:</Label>
            <Select value={selectedTable} onValueChange={onTableChange}>
              <SelectTrigger className="w-48 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.tables.map(t => (
                  <SelectItem key={t.name} value={t.name}>
                    <div className="flex items-center gap-2">
                      <Table2 className="h-3 w-3" />
                      {t.name} ({t.rows.length} rows)
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            className="h-8"
          >
            {allSelected ? <CheckSquare className="h-4 w-4 mr-1" /> : <Square className="h-4 w-4 mr-1" />}
            {allSelected ? 'Deselect All' : 'Select All'}
          </Button>
          <span className="text-sm text-muted-foreground">
            {selectedRows.size} of {rows.length} selected in this table
          </span>
        </div>

        {data.tables.length > 1 && (
          <span className="text-sm text-muted-foreground border-l pl-4 ml-2">
            {totalSelectedRows} total rows selected across {data.tables.length} tables
          </span>
        )}

        {hasRelationships && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            <span>{data.relationships.length} relationship(s) detected</span>
          </div>
        )}
      </div>

      {/* Relationship summary */}
      {hasRelationships && (
        <div className="p-3 rounded-lg bg-muted/50 border text-sm">
          <div className="font-medium mb-2">Detected Relationships:</div>
          <div className="space-y-1">
            {data.relationships.map((rel, idx) => (
              <div key={idx} className="flex items-center gap-2 text-muted-foreground">
                <span className="font-mono text-xs bg-background px-1.5 py-0.5 rounded">{rel.parentTable}</span>
                <span>→</span>
                <span className="font-mono text-xs bg-background px-1.5 py-0.5 rounded">{rel.childTable}</span>
                <span className="text-xs">({rel.parentColumn} → {rel.childColumn})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Grid */}
      <div className="flex-1 border rounded-lg overflow-hidden bg-background min-h-0">
        <ScrollArea className="h-full w-full">
          <div className="min-w-max">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
              <tr>
                <th className="w-10 px-2 py-2 border-b border-r text-center">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                  />
                </th>
                <th className="w-12 px-2 py-2 border-b border-r text-center text-muted-foreground">#</th>
                {headers.map((header, idx) => (
                  <th 
                    key={idx}
                    className="px-3 py-2 border-b border-r text-left font-medium"
                  >
                    <span className="truncate max-w-[150px] block">{header}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, rowIdx) => {
                const isSelected = selectedRows.has(rowIdx);
                return (
                  <tr 
                    key={rowIdx}
                    className={cn(
                      "hover:bg-muted/30 transition-colors cursor-pointer",
                      isSelected && "bg-primary/10"
                    )}
                    onClick={() => handleRowSelect(rowIdx)}
                  >
                    <td className="px-2 py-1.5 border-b border-r text-center">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleRowSelect(rowIdx)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-2 py-1.5 border-b border-r text-center text-muted-foreground text-xs">
                      {rowIdx + 1}
                    </td>
                    {row.map((cell, colIdx) => (
                      <td 
                        key={colIdx}
                        className="px-3 py-1.5 border-b border-r max-w-[200px] truncate"
                        title={cell === null ? 'null' : typeof cell === 'object' ? JSON.stringify(cell) : String(cell)}
                      >
                        {cell === null || cell === undefined ? (
                          <span className="text-muted-foreground italic">null</span>
                        ) : typeof cell === 'object' ? (
                          <span className="text-muted-foreground font-mono text-xs">{JSON.stringify(cell)}</span>
                        ) : typeof cell === 'boolean' ? (
                          <span className={cell ? "text-green-600" : "text-red-600"}>{String(cell)}</span>
                        ) : (
                          String(cell)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {rows.length > maxPreviewRows && (
            <div className="p-3 text-center text-sm text-muted-foreground border-t bg-muted/30">
              Showing {maxPreviewRows} of {rows.length} rows
            </div>
          )}

          {rows.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              No data in this table
            </div>
          )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}
