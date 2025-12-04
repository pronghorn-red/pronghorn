import React, { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, X, FileSpreadsheet, Filter, CheckSquare, Square, 
  Plus, Minus, ChevronDown, ChevronUp 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseExcelFile, SheetData, ExcelData } from "@/utils/parseExcel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ArtifactExcelViewerProps {
  excelData: ExcelData | null;
  onExcelDataChange: (data: ExcelData | null) => void;
  selectedRows: Map<string, Set<number>>;
  onSelectedRowsChange: (rows: Map<string, Set<number>>) => void;
}

export function ArtifactExcelViewer({
  excelData,
  onExcelDataChange,
  selectedRows,
  onSelectedRowsChange,
}: ArtifactExcelViewerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterColumn, setFilterColumn] = useState<number>(0);
  const [filterMode, setFilterMode] = useState<"contains" | "not_contains">("contains");
  const [filterValue, setFilterValue] = useState("");
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [cellSelection, setCellSelection] = useState<{ start: { row: number; col: number }; end: { row: number; col: number } } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    if (excelData && excelData.sheets.length > 0 && !activeSheet) {
      setActiveSheet(excelData.sheets[0].name);
    }
  }, [excelData]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = Array.from(e.dataTransfer.files).find(f => 
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv')
    );
    if (file) {
      await loadExcelFile(file);
    }
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await loadExcelFile(e.target.files[0]);
    }
  }, []);

  const loadExcelFile = async (file: File) => {
    try {
      const data = await parseExcelFile(file);
      onExcelDataChange(data);
      if (data.sheets.length > 0) {
        setActiveSheet(data.sheets[0].name);
      }
      // Initialize empty selection for all sheets
      const newSelection = new Map<string, Set<number>>();
      data.sheets.forEach(sheet => {
        newSelection.set(sheet.name, new Set());
      });
      onSelectedRowsChange(newSelection);
    } catch (error) {
      console.error("Failed to parse Excel file:", error);
    }
  };

  const getCurrentSheet = (): SheetData | undefined => {
    return excelData?.sheets.find(s => s.name === activeSheet);
  };

  const getFilteredRows = (): number[] => {
    const sheet = getCurrentSheet();
    if (!sheet) return [];

    return sheet.rows.map((_, idx) => idx).filter(rowIdx => {
      if (!filterValue.trim()) return true;
      
      const cellValue = (sheet.rows[rowIdx][filterColumn] || "").toLowerCase();
      const search = filterValue.toLowerCase();
      
      if (filterMode === "contains") {
        return cellValue.includes(search);
      } else {
        return !cellValue.includes(search);
      }
    });
  };

  const toggleRowSelection = (rowIndex: number) => {
    const newSelection = new Map(selectedRows);
    const sheetSelection = new Set(newSelection.get(activeSheet) || []);
    
    if (sheetSelection.has(rowIndex)) {
      sheetSelection.delete(rowIndex);
    } else {
      sheetSelection.add(rowIndex);
    }
    
    newSelection.set(activeSheet, sheetSelection);
    onSelectedRowsChange(newSelection);
  };

  const selectAllVisible = () => {
    const filteredRows = getFilteredRows();
    const newSelection = new Map(selectedRows);
    const sheetSelection = new Set(newSelection.get(activeSheet) || []);
    
    filteredRows.forEach(rowIdx => sheetSelection.add(rowIdx));
    newSelection.set(activeSheet, sheetSelection);
    onSelectedRowsChange(newSelection);
  };

  const clearSheetSelection = () => {
    const newSelection = new Map(selectedRows);
    newSelection.set(activeSheet, new Set());
    onSelectedRowsChange(newSelection);
  };

  const selectFullWorkbook = () => {
    if (!excelData) return;
    const newSelection = new Map<string, Set<number>>();
    excelData.sheets.forEach(sheet => {
      newSelection.set(sheet.name, new Set(sheet.rows.map((_, idx) => idx)));
    });
    onSelectedRowsChange(newSelection);
  };

  const clearAllSelections = () => {
    if (!excelData) return;
    const newSelection = new Map<string, Set<number>>();
    excelData.sheets.forEach(sheet => {
      newSelection.set(sheet.name, new Set());
    });
    onSelectedRowsChange(newSelection);
  };

  const setHeaderRow = (rowIndex: number) => {
    if (!excelData) return;
    const newSheets = excelData.sheets.map(sheet => {
      if (sheet.name === activeSheet) {
        return {
          ...sheet,
          headerRowIndex: rowIndex,
          headers: sheet.rows[rowIndex] || [],
        };
      }
      return sheet;
    });
    onExcelDataChange({ ...excelData, sheets: newSheets });
  };

  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    if (!excelData) return;
    const newSheets = excelData.sheets.map(sheet => {
      if (sheet.name === activeSheet) {
        const newRows = [...sheet.rows];
        if (!newRows[rowIndex]) {
          newRows[rowIndex] = [];
        }
        newRows[rowIndex] = [...newRows[rowIndex]];
        newRows[rowIndex][colIndex] = value;
        return { ...sheet, rows: newRows };
      }
      return sheet;
    });
    onExcelDataChange({ ...excelData, sheets: newSheets });
  };

  const addRow = () => {
    if (!excelData) return;
    const sheet = getCurrentSheet();
    if (!sheet) return;
    
    const colCount = Math.max(...sheet.rows.map(r => r.length), sheet.headers.length);
    const newRow = Array(colCount).fill("");
    
    const newSheets = excelData.sheets.map(s => {
      if (s.name === activeSheet) {
        return { ...s, rows: [...s.rows, newRow] };
      }
      return s;
    });
    onExcelDataChange({ ...excelData, sheets: newSheets });
  };

  const removeSelectedRows = () => {
    if (!excelData) return;
    const sheetSelection = selectedRows.get(activeSheet);
    if (!sheetSelection || sheetSelection.size === 0) return;

    const newSheets = excelData.sheets.map(sheet => {
      if (sheet.name === activeSheet) {
        const newRows = sheet.rows.filter((_, idx) => !sheetSelection.has(idx));
        return { ...sheet, rows: newRows };
      }
      return sheet;
    });
    
    onExcelDataChange({ ...excelData, sheets: newSheets });
    clearSheetSelection();
  };

  // Handle paste from clipboard (Excel copy/paste support)
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (!editingCell && !cellSelection) return;
    
    const pasteData = e.clipboardData.getData("text");
    if (!pasteData) return;
    
    const rows = pasteData.split(/\r?\n/).map(row => row.split('\t'));
    if (rows.length === 0) return;

    const startRow = editingCell?.row ?? cellSelection?.start.row ?? 0;
    const startCol = editingCell?.col ?? cellSelection?.start.col ?? 0;

    if (!excelData) return;
    
    const newSheets = excelData.sheets.map(sheet => {
      if (sheet.name === activeSheet) {
        const newRows = [...sheet.rows];
        rows.forEach((pasteRow, rowOffset) => {
          const targetRow = startRow + rowOffset;
          if (targetRow < newRows.length) {
            if (!newRows[targetRow]) newRows[targetRow] = [];
            newRows[targetRow] = [...newRows[targetRow]];
            pasteRow.forEach((value, colOffset) => {
              newRows[targetRow][startCol + colOffset] = value;
            });
          }
        });
        return { ...sheet, rows: newRows };
      }
      return sheet;
    });
    
    onExcelDataChange({ ...excelData, sheets: newSheets });
    e.preventDefault();
  }, [editingCell, cellSelection, excelData, activeSheet]);

  const handleMouseDown = (rowIndex: number, colIndex: number) => {
    setIsSelecting(true);
    setCellSelection({ start: { row: rowIndex, col: colIndex }, end: { row: rowIndex, col: colIndex } });
  };

  const handleMouseMove = (rowIndex: number, colIndex: number) => {
    if (isSelecting && cellSelection) {
      setCellSelection({ ...cellSelection, end: { row: rowIndex, col: colIndex } });
    }
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
  };

  const isCellInSelection = (rowIndex: number, colIndex: number): boolean => {
    if (!cellSelection) return false;
    const minRow = Math.min(cellSelection.start.row, cellSelection.end.row);
    const maxRow = Math.max(cellSelection.start.row, cellSelection.end.row);
    const minCol = Math.min(cellSelection.start.col, cellSelection.end.col);
    const maxCol = Math.max(cellSelection.start.col, cellSelection.end.col);
    return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol;
  };

  const clearFile = () => {
    onExcelDataChange(null);
    onSelectedRowsChange(new Map());
    setActiveSheet("");
  };

  const sheet = getCurrentSheet();
  const filteredRows = getFilteredRows();
  const sheetSelection = selectedRows.get(activeSheet) || new Set();
  const totalSelected = Array.from(selectedRows.values()).reduce((sum, set) => sum + set.size, 0);

  // Calculate max columns
  const maxCols = sheet ? Math.max(...sheet.rows.map(r => r.length), sheet.headers.length) : 0;

  return (
    <div className="flex flex-col h-full gap-4" onPaste={handlePaste}>
      {!excelData ? (
        /* Drop Zone */
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer flex-1 flex flex-col items-center justify-center",
            isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => document.getElementById('excel-input')?.click()}
        >
          <input
            id="excel-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileSelect}
          />
          <FileSpreadsheet className="h-12 w-12 mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drop Excel file here or click to browse
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Supports XLSX, XLS, CSV
          </p>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{excelData.fileName}</span>
              <Badge variant="secondary">{excelData.sheets.length} sheets</Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={clearFile}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Sheet Tabs */}
          <Tabs value={activeSheet} onValueChange={setActiveSheet}>
            <TabsList className="w-full justify-start overflow-x-auto">
              {excelData.sheets.map(sheet => {
                const count = selectedRows.get(sheet.name)?.size || 0;
                return (
                  <TabsTrigger key={sheet.name} value={sheet.name} className="gap-1">
                    {sheet.name}
                    {count > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                        {count}
                      </Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4 mr-1" />
              {showFilters ? "Hide Filters" : "Show Filters"}
            </Button>
            <Button variant="outline" size="sm" onClick={selectAllVisible}>
              <CheckSquare className="h-4 w-4 mr-1" />
              Select Visible
            </Button>
            <Button variant="outline" size="sm" onClick={clearSheetSelection}>
              <Square className="h-4 w-4 mr-1" />
              Clear Sheet
            </Button>
            <Button variant="outline" size="sm" onClick={selectFullWorkbook}>
              Select All Sheets
            </Button>
            <Button variant="outline" size="sm" onClick={clearAllSelections}>
              Clear All
            </Button>
            <div className="flex items-center gap-1 ml-auto">
              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus className="h-4 w-4 mr-1" />
                Add Row
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={removeSelectedRows}
                disabled={sheetSelection.size === 0}
              >
                <Minus className="h-4 w-4 mr-1" />
                Remove Selected
              </Button>
            </div>
          </div>

          {/* Filters */}
          {showFilters && sheet && (
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <span className="text-sm">Filter:</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    {sheet.headers[filterColumn] || `Column ${filterColumn + 1}`}
                    <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {Array.from({ length: maxCols }, (_, i) => (
                    <DropdownMenuItem key={i} onClick={() => setFilterColumn(i)}>
                      {sheet.headers[i] || `Column ${i + 1}`}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    {filterMode === "contains" ? "Contains" : "Does Not Contain"}
                    <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setFilterMode("contains")}>
                    Contains
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterMode("not_contains")}>
                    Does Not Contain
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Input
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                placeholder="Filter value..."
                className="w-48"
              />
              {filterValue && (
                <Button variant="ghost" size="sm" onClick={() => setFilterValue("")}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}

          {/* Table */}
          <ScrollArea className="flex-1 border rounded-lg">
            {sheet && (
              <table 
                ref={tableRef} 
                className="w-full text-sm"
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <thead className="sticky top-0 bg-muted z-10">
                  <tr>
                    <th className="w-10 p-2 border-r border-b text-center">#</th>
                    <th className="w-10 p-2 border-r border-b text-center">Row</th>
                    {Array.from({ length: maxCols }, (_, i) => (
                      <th key={i} className="p-2 border-r border-b text-left font-medium min-w-[120px]">
                        {sheet.headers[i] || `Col ${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(rowIndex => {
                    const row = sheet.rows[rowIndex] || [];
                    const isSelected = sheetSelection.has(rowIndex);
                    const isHeaderRow = rowIndex === sheet.headerRowIndex;

                    return (
                      <tr 
                        key={rowIndex} 
                        className={cn(
                          "hover:bg-muted/50 transition-colors",
                          isSelected && "bg-primary/10",
                          isHeaderRow && "bg-yellow-500/10"
                        )}
                      >
                        <td className="p-2 border-r text-center">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleRowSelection(rowIndex)}
                          />
                        </td>
                        <td className="p-2 border-r text-center text-muted-foreground">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 px-2">
                                {rowIndex + 1}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => setHeaderRow(rowIndex)}>
                                Set as Header Row
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                        {Array.from({ length: maxCols }, (_, colIndex) => {
                          const cellValue = row[colIndex] || "";
                          const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex;
                          const inSelection = isCellInSelection(rowIndex, colIndex);

                          return (
                            <td
                              key={colIndex}
                              className={cn(
                                "p-0 border-r relative",
                                inSelection && "bg-primary/20"
                              )}
                              onMouseDown={() => handleMouseDown(rowIndex, colIndex)}
                              onMouseMove={() => handleMouseMove(rowIndex, colIndex)}
                              onDoubleClick={() => setEditingCell({ row: rowIndex, col: colIndex })}
                            >
                              {isEditing ? (
                                <Input
                                  value={cellValue}
                                  onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                                  onBlur={() => setEditingCell(null)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === 'Escape') {
                                      setEditingCell(null);
                                    }
                                  }}
                                  className="h-8 rounded-none border-0 focus-visible:ring-1 focus-visible:ring-inset"
                                  autoFocus
                                />
                              ) : (
                                <div className="p-2 min-h-[32px] truncate">
                                  {cellValue}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </ScrollArea>

          {/* Footer */}
          <div className="text-sm text-muted-foreground">
            {sheetSelection.size} rows selected in {activeSheet} • {totalSelected} total across all sheets
          </div>
        </>
      )}
    </div>
  );
}
