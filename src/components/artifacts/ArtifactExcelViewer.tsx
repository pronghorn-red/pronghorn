import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Upload, 
  FileSpreadsheet, 
  X, 
  Filter, 
  CheckSquare, 
  Square, 
  Layers, 
  XCircle, 
  Plus, 
  Trash2, 
  TableProperties,
  ZoomIn,
  ZoomOut,
  Merge
} from "lucide-react";
import { parseExcelFile, ExcelData, SheetData } from "@/utils/parseExcel";
import { cn } from "@/lib/utils";

interface ArtifactExcelViewerProps {
  excelData: ExcelData | null;
  onExcelDataChange: (data: ExcelData | null) => void;
  selectedRows: Map<string, Set<number>>;
  onSelectedRowsChange: (rows: Map<string, Set<number>>) => void;
  mergeAsOne: boolean;
  onMergeAsOneChange: (value: boolean) => void;
}

export function ArtifactExcelViewer({
  excelData,
  onExcelDataChange,
  selectedRows,
  onSelectedRowsChange,
  mergeAsOne,
  onMergeAsOneChange,
}: ArtifactExcelViewerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [containsFilter, setContainsFilter] = useState("");
  const [notContainsFilter, setNotContainsFilter] = useState("");
  const [appliedContains, setAppliedContains] = useState<string[]>([]);
  const [appliedNotContains, setAppliedNotContains] = useState<string[]>([]);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  
  // Cell selection state
  const [selectionStart, setSelectionStart] = useState<{ row: number; col: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ row: number; col: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (excelData && excelData.sheets.length > 0 && !activeSheet) {
      setActiveSheet(excelData.sheets[0].name);
    }
  }, [excelData, activeSheet]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      await loadExcelFile(file);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await loadExcelFile(file);
    }
  };

  const loadExcelFile = async (file: File) => {
    try {
      const data = await parseExcelFile(file);
      onExcelDataChange(data);
      if (data.sheets.length > 0) {
        setActiveSheet(data.sheets[0].name);
      }
      // Reset filters
      setAppliedContains([]);
      setAppliedNotContains([]);
      setContainsFilter("");
      setNotContainsFilter("");
    } catch (error) {
      console.error("Error parsing Excel file:", error);
    }
  };

  const getCurrentSheet = (): SheetData | undefined => {
    return excelData?.sheets.find(s => s.name === activeSheet);
  };

  const rowMatchesFilters = (row: string[]): boolean => {
    const rowText = row.join(" ").toLowerCase();
    
    // Must contain ALL "contains" terms (if any)
    if (appliedContains.length > 0) {
      const allMatch = appliedContains.every(term => 
        rowText.includes(term.toLowerCase().trim())
      );
      if (!allMatch) return false;
    }
    
    // Must NOT contain ANY "not contains" terms
    if (appliedNotContains.length > 0) {
      const anyMatch = appliedNotContains.some(term => 
        rowText.includes(term.toLowerCase().trim())
      );
      if (anyMatch) return false;
    }
    
    return true;
  };

  const getFilteredRows = (): { row: string[]; originalIndex: number }[] => {
    const sheet = getCurrentSheet();
    if (!sheet) return [];
    
    return sheet.rows
      .map((row, index) => ({ row, originalIndex: index }))
      .filter(({ row }) => rowMatchesFilters(row));
  };

  const applyFilters = () => {
    const contains = containsFilter
      .split(",")
      .map(s => s.trim())
      .filter(s => s.length > 0);
    const notContains = notContainsFilter
      .split(",")
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    setAppliedContains(contains);
    setAppliedNotContains(notContains);
  };

  const clearFilters = () => {
    setContainsFilter("");
    setNotContainsFilter("");
    setAppliedContains([]);
    setAppliedNotContains([]);
  };

  const filtersActive = appliedContains.length > 0 || appliedNotContains.length > 0;

  const toggleRowSelection = (sheetName: string, rowIndex: number) => {
    const newSelection = new Map(selectedRows);
    const sheetSelection = new Set(newSelection.get(sheetName) || []);
    
    if (sheetSelection.has(rowIndex)) {
      sheetSelection.delete(rowIndex);
    } else {
      sheetSelection.add(rowIndex);
    }
    
    newSelection.set(sheetName, sheetSelection);
    onSelectedRowsChange(newSelection);
  };

  const selectAllVisible = () => {
    const filteredRows = getFilteredRows();
    const newSelection = new Map(selectedRows);
    const sheetSelection = new Set(newSelection.get(activeSheet) || []);
    
    filteredRows.forEach(({ originalIndex }) => {
      sheetSelection.add(originalIndex);
    });
    
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
      newSelection.set(sheet.name, new Set(sheet.rows.map((_, i) => i)));
    });
    onSelectedRowsChange(newSelection);
  };

  const clearAllSelections = () => {
    onSelectedRowsChange(new Map());
  };

  const setHeaderRow = () => {
    const sheet = getCurrentSheet();
    const sheetSelection = selectedRows.get(activeSheet);
    
    if (!sheet || !sheetSelection || sheetSelection.size !== 1) return;
    
    const headerRowIndex = Array.from(sheetSelection)[0];
    const newHeaders = sheet.rows[headerRowIndex];
    const newRows = sheet.rows.slice(headerRowIndex + 1);
    
    // Update the sheet data
    const newSheets = excelData!.sheets.map(s => {
      if (s.name === activeSheet) {
        return {
          ...s,
          headers: newHeaders,
          rows: newRows,
          headerRowIndex: 0,
        };
      }
      return s;
    });
    
    onExcelDataChange({ ...excelData!, sheets: newSheets });
    
    // Clear selection for this sheet
    const newSelection = new Map(selectedRows);
    newSelection.set(activeSheet, new Set());
    onSelectedRowsChange(newSelection);
  };

  const canSetHeader = () => {
    const sheetSelection = selectedRows.get(activeSheet);
    return sheetSelection && sheetSelection.size === 1;
  };

  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    if (!excelData) return;
    
    const newSheets = excelData.sheets.map(sheet => {
      if (sheet.name === activeSheet) {
        const newRows = [...sheet.rows];
        const newRow = [...newRows[rowIndex]];
        newRow[colIndex] = value;
        newRows[rowIndex] = newRow;
        return { ...sheet, rows: newRows };
      }
      return sheet;
    });
    
    onExcelDataChange({ ...excelData, sheets: newSheets });
  };

  const addRow = () => {
    if (!excelData) return;
    
    const newSheets = excelData.sheets.map(sheet => {
      if (sheet.name === activeSheet) {
        const colCount = sheet.headers.length || (sheet.rows[0]?.length || 0);
        const newRow = Array(colCount).fill("");
        return { ...sheet, rows: [...sheet.rows, newRow] };
      }
      return sheet;
    });
    
    onExcelDataChange({ ...excelData, sheets: newSheets });
  };

  const removeSelectedRows = () => {
    if (!excelData) return;
    
    const sheetSelection = selectedRows.get(activeSheet);
    if (!sheetSelection || sheetSelection.size === 0) return;
    
    const newSheets = excelData.sheets.map(sheet => {
      if (sheet.name === activeSheet) {
        const newRows = sheet.rows.filter((_, index) => !sheetSelection.has(index));
        return { ...sheet, rows: newRows };
      }
      return sheet;
    });
    
    onExcelDataChange({ ...excelData, sheets: newSheets });
    
    // Clear selection
    const newSelection = new Map(selectedRows);
    newSelection.set(activeSheet, new Set());
    onSelectedRowsChange(newSelection);
  };

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (!editingCell && selectionStart) {
      e.preventDefault();
      const pastedData = e.clipboardData?.getData("text");
      if (!pastedData || !excelData) return;
      
      const rows = pastedData.split("\n").map(row => row.split("\t"));
      
      const newSheets = excelData.sheets.map(sheet => {
        if (sheet.name === activeSheet) {
          const newRows = [...sheet.rows];
          rows.forEach((pastedRow, rOffset) => {
            const targetRow = selectionStart.row + rOffset;
            if (targetRow < newRows.length) {
              const newRow = [...newRows[targetRow]];
              pastedRow.forEach((cellValue, cOffset) => {
                const targetCol = selectionStart.col + cOffset;
                if (targetCol < newRow.length) {
                  newRow[targetCol] = cellValue;
                }
              });
              newRows[targetRow] = newRow;
            }
          });
          return { ...sheet, rows: newRows };
        }
        return sheet;
      });
      
      onExcelDataChange({ ...excelData, sheets: newSheets });
    }
  }, [editingCell, selectionStart, excelData, activeSheet, onExcelDataChange]);

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const handleMouseDown = (row: number, col: number) => {
    if (editingCell) return;
    setSelectionStart({ row, col });
    setSelectionEnd({ row, col });
    setIsSelecting(true);
  };

  const handleMouseMove = (row: number, col: number) => {
    if (isSelecting) {
      setSelectionEnd({ row, col });
    }
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
  };

  const isCellInSelection = (row: number, col: number): boolean => {
    if (!selectionStart || !selectionEnd) return false;
    const minRow = Math.min(selectionStart.row, selectionEnd.row);
    const maxRow = Math.max(selectionStart.row, selectionEnd.row);
    const minCol = Math.min(selectionStart.col, selectionEnd.col);
    const maxCol = Math.max(selectionStart.col, selectionEnd.col);
    return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
  };

  const getTotalSelectedCount = (): number => {
    let total = 0;
    selectedRows.forEach(set => {
      total += set.size;
    });
    return total;
  };

  const getSheetSelectedCount = (sheetName: string): number => {
    return selectedRows.get(sheetName)?.size || 0;
  };

  const zoomLevels = [60, 75, 85, 100, 115, 125, 150];
  
  const zoomIn = () => {
    const currentIndex = zoomLevels.indexOf(zoomLevel);
    if (currentIndex < zoomLevels.length - 1) {
      setZoomLevel(zoomLevels[currentIndex + 1]);
    }
  };

  const zoomOut = () => {
    const currentIndex = zoomLevels.indexOf(zoomLevel);
    if (currentIndex > 0) {
      setZoomLevel(zoomLevels[currentIndex - 1]);
    }
  };

  const currentSheet = getCurrentSheet();
  const filteredRows = getFilteredRows();
  const currentSheetSelection = selectedRows.get(activeSheet) || new Set();

  if (!excelData) {
    return (
      <div
        className={cn(
          "flex-1 border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-4 transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <FileSpreadsheet className="h-16 w-16 text-muted-foreground" />
        <div className="text-center">
          <p className="text-lg font-medium">Drop Excel file here</p>
          <p className="text-sm text-muted-foreground">or click to browse</p>
        </div>
        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-4 w-4 mr-2" />
          Select File
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex-1 flex flex-col gap-2 min-h-0 h-full">
        {/* Header with file info */}
        <div className="flex items-center justify-between gap-2 px-1 shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-green-600" />
            <span className="font-medium text-sm truncate">{excelData.fileName}</span>
            <Badge variant="secondary" className="text-xs">
              {excelData.sheets.length} sheet{excelData.sheets.length !== 1 ? "s" : ""}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              onExcelDataChange(null);
              onSelectedRowsChange(new Map());
              setActiveSheet("");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Toolbar with icon buttons */}
        <div className="flex items-center gap-1 flex-wrap px-1 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle Filters</TooltipContent>
          </Tooltip>

          <div className="w-px h-6 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={selectAllVisible}>
                <CheckSquare className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Select Visible Rows</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={clearSheetSelection}>
                <Square className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear Sheet Selection</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={selectFullWorkbook}>
                <Layers className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Select All Sheets</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={clearAllSelections}>
                <XCircle className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear All Selections</TooltipContent>
          </Tooltip>

          <div className="w-px h-6 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={setHeaderRow}
                disabled={!canSetHeader()}
              >
                <TableProperties className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Set Selected Row as Header (select exactly 1 row)</TooltipContent>
          </Tooltip>

          <div className="w-px h-6 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={addRow}>
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add Row</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={removeSelectedRows}
                disabled={currentSheetSelection.size === 0}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove Selected Rows</TooltipContent>
          </Tooltip>

          <div className="w-px h-6 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={zoomOut}
                disabled={zoomLevel <= zoomLevels[0]}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>

          <span className="text-xs text-muted-foreground w-10 text-center">{zoomLevel}%</span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={zoomIn}
                disabled={zoomLevel >= zoomLevels[zoomLevels.length - 1]}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>

          {filtersActive && (
            <Badge variant="secondary" className="ml-2 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
              Filters Active
            </Badge>
          )}
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="flex flex-col gap-2 p-3 bg-muted/30 rounded-lg border shrink-0">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Contains (comma-separated)</Label>
                <Input
                  value={containsFilter}
                  onChange={(e) => setContainsFilter(e.target.value)}
                  placeholder="term1, term2..."
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Does Not Contain (comma-separated)</Label>
                <Input
                  value={notContainsFilter}
                  onChange={(e) => setNotContainsFilter(e.target.value)}
                  placeholder="exclude1, exclude2..."
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={applyFilters}>
                Apply Filters
              </Button>
              <Button size="sm" variant="outline" onClick={clearFilters}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Table container with native scrolling */}
        <div 
          ref={tableContainerRef}
          className="flex-1 overflow-auto border rounded-lg min-h-0"
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <table
            className="w-max min-w-full border-collapse select-none"
            style={{ fontSize: `${0.75 * (zoomLevel / 100)}rem` }}
          >
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted">
                <th className="w-10 p-2 border-b border-r text-center sticky left-0 bg-muted z-20">
                  <Checkbox
                    checked={
                      filteredRows.length > 0 &&
                      filteredRows.every(({ originalIndex }) => currentSheetSelection.has(originalIndex))
                    }
                    onCheckedChange={(checked) => {
                      if (checked) {
                        selectAllVisible();
                      } else {
                        clearSheetSelection();
                      }
                    }}
                  />
                </th>
                <th className="w-12 p-2 border-b border-r text-center font-medium text-muted-foreground bg-muted">
                  #
                </th>
                {currentSheet?.headers.map((header, idx) => (
                  <th
                    key={idx}
                    className="p-2 border-b border-r text-left font-medium whitespace-nowrap bg-muted min-w-[100px]"
                  >
                    {header || `Column ${idx + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(({ row, originalIndex }) => {
                const isSelected = currentSheetSelection.has(originalIndex);
                return (
                  <tr
                    key={originalIndex}
                    className={cn(
                      "hover:bg-muted/50 transition-colors",
                      isSelected && "bg-primary/10"
                    )}
                  >
                    <td className="p-2 border-b border-r text-center sticky left-0 bg-background z-10">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRowSelection(activeSheet, originalIndex)}
                      />
                    </td>
                    <td className="p-2 border-b border-r text-center text-muted-foreground font-mono text-xs">
                      {originalIndex + 1}
                    </td>
                    {row.map((cell, colIdx) => {
                      const isEditing = editingCell?.row === originalIndex && editingCell?.col === colIdx;
                      const isCellSelected = isCellInSelection(originalIndex, colIdx);
                      
                      return (
                        <td
                          key={colIdx}
                          className={cn(
                            "p-0 border-b border-r relative min-w-[100px]",
                            isCellSelected && !isEditing && "bg-blue-100 dark:bg-blue-900/30"
                          )}
                          onMouseDown={() => handleMouseDown(originalIndex, colIdx)}
                          onMouseMove={() => handleMouseMove(originalIndex, colIdx)}
                          onDoubleClick={() => setEditingCell({ row: originalIndex, col: colIdx })}
                        >
                          {isEditing ? (
                            <input
                              type="text"
                              value={cell}
                              onChange={(e) => updateCell(originalIndex, colIdx, e.target.value)}
                              onBlur={() => setEditingCell(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === "Escape") {
                                  setEditingCell(null);
                                }
                              }}
                              className="w-full h-full p-2 border-2 border-primary outline-none bg-background select-text"
                              autoFocus
                            />
                          ) : (
                            <div className="p-2 min-h-[2rem] whitespace-nowrap overflow-hidden text-ellipsis max-w-[300px]">
                              {cell}
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
        </div>

        {/* Sheet tabs at bottom - Excel style */}
        <div className="flex items-center gap-1 overflow-x-auto py-1 px-1 border rounded-lg bg-muted/30 shrink-0">
          {excelData.sheets.map((sheet) => {
            const count = getSheetSelectedCount(sheet.name);
            const isActive = activeSheet === sheet.name;
            
            return (
              <button
                key={sheet.name}
                onClick={() => setActiveSheet(sheet.name)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded whitespace-nowrap flex items-center gap-2 transition-colors",
                  isActive
                    ? "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 font-medium"
                    : "bg-background hover:bg-muted text-muted-foreground"
                )}
              >
                {sheet.name}
                {count > 0 && (
                  <Badge variant="secondary" className="text-xs h-5 px-1.5 bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200">
                    {count}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer with selection info and merge toggle */}
        <div className="flex items-center justify-between gap-4 px-1 py-2 border-t shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{currentSheetSelection.size}</span> rows selected in this sheet
              {getTotalSelectedCount() > currentSheetSelection.size && (
                <span className="ml-2">
                  • <span className="font-medium text-foreground">{getTotalSelectedCount()}</span> total across all sheets
                </span>
              )}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2">
                  <Switch
                    id="merge-toggle"
                    checked={mergeAsOne}
                    onCheckedChange={onMergeAsOneChange}
                  />
                  <Label htmlFor="merge-toggle" className="text-sm cursor-pointer flex items-center gap-1">
                    <Merge className="h-3.5 w-3.5" />
                    Merge as Single Artifact
                  </Label>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {mergeAsOne 
                  ? "All selected rows will be combined into one artifact" 
                  : "Each selected row will become a separate artifact"
                }
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
