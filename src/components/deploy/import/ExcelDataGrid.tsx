import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { SheetData } from '@/utils/parseExcel';
import { CheckSquare, Square, Filter, ArrowUpDown } from 'lucide-react';

interface ExcelDataGridProps {
  sheets: SheetData[];
  selectedSheet: string;
  onSheetChange: (sheetName: string) => void;
  headerRow: number;
  onHeaderRowChange: (row: number) => void;
  selectedRows: Set<number>;
  onSelectedRowsChange: (rows: Set<number>) => void;
  maxPreviewRows?: number;
}

export default function ExcelDataGrid({
  sheets,
  selectedSheet,
  onSheetChange,
  headerRow,
  onHeaderRowChange,
  selectedRows,
  onSelectedRowsChange,
  maxPreviewRows = 100
}: ExcelDataGridProps) {
  const [filterText, setFilterText] = useState('');
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const currentSheet = useMemo(() => 
    sheets.find(s => s.name === selectedSheet) || sheets[0],
    [sheets, selectedSheet]
  );

  const headers = useMemo(() => {
    if (!currentSheet || headerRow >= currentSheet.rows.length) return [];
    return currentSheet.rows[headerRow] || [];
  }, [currentSheet, headerRow]);

  const dataRows = useMemo(() => {
    if (!currentSheet) return [];
    return currentSheet.rows.slice(headerRow + 1);
  }, [currentSheet, headerRow]);

  const filteredRows = useMemo(() => {
    let rows = dataRows.map((row, idx) => ({ row, originalIndex: idx }));
    
    // Apply filter
    if (filterText.trim()) {
      const lower = filterText.toLowerCase();
      rows = rows.filter(({ row }) => 
        row.some(cell => String(cell ?? '').toLowerCase().includes(lower))
      );
    }

    // Apply sort
    if (sortColumn !== null) {
      rows.sort((a, b) => {
        const aVal = a.row[sortColumn] ?? '';
        const bVal = b.row[sortColumn] ?? '';
        const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }

    return rows;
  }, [dataRows, filterText, sortColumn, sortDirection]);

  const displayRows = filteredRows.slice(0, maxPreviewRows);

  const handleSelectAll = () => {
    if (selectedRows.size === dataRows.length) {
      onSelectedRowsChange(new Set());
    } else {
      onSelectedRowsChange(new Set(dataRows.map((_, i) => i)));
    }
  };

  const handleRowSelect = (idx: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(idx)) {
      newSelected.delete(idx);
    } else {
      newSelected.add(idx);
    }
    onSelectedRowsChange(newSelected);
  };

  const handleSort = (colIdx: number) => {
    if (sortColumn === colIdx) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(colIdx);
      setSortDirection('asc');
    }
  };

  const allSelected = selectedRows.size === dataRows.length && dataRows.length > 0;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        {sheets.length > 1 && (
          <div className="flex items-center gap-2">
            <Label className="text-sm">Sheet:</Label>
            <Select value={selectedSheet} onValueChange={onSheetChange}>
              <SelectTrigger className="w-40 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sheets.map(s => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name} ({s.rows.length} rows)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Label className="text-sm">Header Row:</Label>
          <Select 
            value={String(headerRow)} 
            onValueChange={(v) => onHeaderRowChange(parseInt(v, 10))}
          >
            <SelectTrigger className="w-20 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currentSheet?.rows.slice(0, 10).map((_, i) => (
                <SelectItem key={i} value={String(i)}>Row {i + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter rows..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="h-8"
          />
        </div>

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
            {selectedRows.size} of {dataRows.length} selected
          </span>
        </div>
      </div>

      {/* Data Grid */}
      <div className="flex-1 border rounded-lg overflow-hidden bg-background min-h-0">
        <ScrollArea className="h-full">
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
                    className="px-3 py-2 border-b border-r text-left font-medium cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleSort(idx)}
                  >
                    <div className="flex items-center gap-1">
                      <span className="truncate max-w-[150px]">{String(header ?? `Column ${idx + 1}`)}</span>
                      {sortColumn === idx && (
                        <ArrowUpDown className={cn(
                          "h-3 w-3 flex-shrink-0",
                          sortDirection === 'desc' && "rotate-180"
                        )} />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map(({ row, originalIndex }) => {
                const isSelected = selectedRows.has(originalIndex);
                return (
                  <tr 
                    key={originalIndex}
                    className={cn(
                      "hover:bg-muted/30 transition-colors cursor-pointer",
                      isSelected && "bg-primary/10"
                    )}
                    onClick={() => handleRowSelect(originalIndex)}
                  >
                    <td className="px-2 py-1.5 border-b border-r text-center">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleRowSelect(originalIndex)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-2 py-1.5 border-b border-r text-center text-muted-foreground text-xs">
                      {originalIndex + 1}
                    </td>
                    {headers.map((_, colIdx) => (
                      <td 
                        key={colIdx}
                        className="px-3 py-1.5 border-b border-r max-w-[200px] truncate"
                        title={String(row[colIdx] ?? '')}
                      >
                        {row[colIdx] === null || row[colIdx] === undefined ? (
                          <span className="text-muted-foreground italic">null</span>
                        ) : (
                          String(row[colIdx])
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredRows.length > maxPreviewRows && (
            <div className="p-3 text-center text-sm text-muted-foreground border-t bg-muted/30">
              Showing {maxPreviewRows} of {filteredRows.length} filtered rows ({dataRows.length} total)
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
