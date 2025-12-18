import React, { useCallback, useState } from 'react';
import { FileSpreadsheet, FileJson, Upload, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { parseExcelFile, ExcelData } from '@/utils/parseExcel';
import { parseJsonFile, ParsedJsonData } from '@/utils/parseJson';
import { toast } from 'sonner';

interface FileUploaderProps {
  onFileUploaded: (
    type: 'excel' | 'csv' | 'json',
    data: ExcelData | ParsedJsonData
  ) => void;
  accept?: string;
  maxSizeMB?: number;
}

export default function FileUploader({
  onFileUploaded,
  accept = '.xlsx,.xls,.csv,.json',
  maxSizeMB = 20
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setFileName(file.name);

    // Check file size
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File size exceeds ${maxSizeMB}MB limit`);
      setFileName(null);
      return;
    }

    // Determine file type
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    setIsLoading(true);
    
    try {
      if (extension === 'json') {
        const data = await parseJsonFile(file);
        if (data.tables.length === 0) {
          throw new Error('No valid data found in JSON file');
        }
        onFileUploaded('json', data);
        toast.success(`Loaded ${data.tables.length} table(s) from JSON`);
      } else if (extension === 'xlsx' || extension === 'xls') {
        const data = await parseExcelFile(file);
        if (data.sheets.length === 0) {
          throw new Error('No sheets found in Excel file');
        }
        onFileUploaded('excel', data);
        toast.success(`Loaded ${data.sheets.length} sheet(s) from Excel`);
      } else if (extension === 'csv') {
        // CSV is handled as Excel with single sheet
        const data = await parseExcelFile(file);
        onFileUploaded('csv', data);
        toast.success(`Loaded CSV file with ${data.sheets[0]?.rows.length || 0} rows`);
      } else {
        throw new Error('Unsupported file format');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse file';
      setError(message);
      setFileName(null);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [maxSizeMB, onFileUploaded]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
    // Reset input value to allow re-selecting same file
    e.target.value = '';
  }, [handleFile]);

  const clearFile = useCallback(() => {
    setFileName(null);
    setError(null);
  }, []);

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        className={cn(
          "relative border-2 border-dashed rounded-lg p-8 transition-colors",
          isDragging && "border-primary bg-primary/5",
          !isDragging && !error && "border-muted-foreground/30 hover:border-muted-foreground/50",
          error && "border-destructive bg-destructive/5"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept={accept}
          onChange={handleFileInputChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isLoading}
        />

        <div className="flex flex-col items-center justify-center gap-4 text-center pointer-events-none">
          {isLoading ? (
            <>
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Parsing file...</p>
            </>
          ) : fileName ? (
            <>
              <div className="flex items-center gap-2">
                {fileName.endsWith('.json') ? (
                  <FileJson className="h-8 w-8 text-primary" />
                ) : (
                  <FileSpreadsheet className="h-8 w-8 text-primary" />
                )}
                <span className="font-medium">{fileName}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 pointer-events-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                File loaded successfully. Click Next to continue.
              </p>
            </>
          ) : (
            <>
              <Upload className="h-12 w-12 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  Drop your file here or click to browse
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Supports Excel (.xlsx, .xls), CSV, and JSON files up to {maxSizeMB}MB
                </p>
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
      </div>

      {/* Supported Formats */}
      <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <FileSpreadsheet className="h-4 w-4" />
          <span>Excel / CSV</span>
        </div>
        <div className="flex items-center gap-1.5">
          <FileJson className="h-4 w-4" />
          <span>JSON</span>
        </div>
      </div>
    </div>
  );
}
