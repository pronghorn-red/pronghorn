import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileIcon, Upload, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ArtifactPdfPlaceholderProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
}

export function ArtifactPdfPlaceholder({ files, onFilesChange }: ArtifactPdfPlaceholderProps) {
  const [isDragging, setIsDragging] = useState(false);

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
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => 
      f.name.toLowerCase().endsWith('.pdf')
    );
    onFilesChange([...files, ...droppedFiles]);
  }, [files, onFilesChange]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      onFilesChange([...files, ...selectedFiles]);
    }
  }, [files, onFilesChange]);

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Drop Zone */}
      <div
        className={cn(
          "flex-1 border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-4 transition-colors min-h-[200px] max-h-[250px]",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <FileIcon className="h-16 w-16 text-muted-foreground" />
        <div className="text-center">
          <p className="text-lg font-medium">Drop PDF files here</p>
          <p className="text-sm text-muted-foreground">or click to browse</p>
        </div>
        <Button variant="outline" onClick={() => document.getElementById('pdf-input')?.click()}>
          <Upload className="h-4 w-4 mr-2" />
          Select Files
        </Button>
        <p className="text-xs text-muted-foreground">
          Supports PDF files
        </p>
        <input
          id="pdf-input"
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Processing Notice */}
      <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
        <p className="text-sm text-amber-700 dark:text-amber-300">
          PDF document processing coming soon. Files are stored but not yet converted to artifacts.
        </p>
      </div>

      {/* File List */}
      <ScrollArea className="flex-1">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <FileIcon className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">No PDF files added yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 p-3 border rounded-lg"
              >
                <FileIcon className="h-8 w-8 text-red-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => removeFile(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}