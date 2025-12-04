import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Upload, X, FileText, ChevronDown, ChevronRight, CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TextFile {
  id: string;
  file: File;
  content: string;
  selected: boolean;
  expanded: boolean;
}

interface ArtifactTextFileListProps {
  files: TextFile[];
  onFilesChange: (files: TextFile[]) => void;
}

const TEXT_EXTENSIONS = [
  '.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go',
  '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.html', '.css', '.scss',
  '.less', '.xml', '.yaml', '.yml', '.toml', '.ini', '.conf', '.cfg', '.env',
  '.sh', '.bash', '.zsh', '.sql', '.graphql', '.vue', '.svelte', '.rs', '.swift',
  '.kt', '.scala', '.r', '.m', '.pl', '.lua', '.ex', '.exs', '.elm', '.hs',
];

export function ArtifactTextFileList({ files, onFilesChange }: ArtifactTextFileListProps) {
  const [isDragging, setIsDragging] = useState(false);

  const isTextFile = (file: File): boolean => {
    const name = file.name.toLowerCase();
    return TEXT_EXTENSIONS.some(ext => name.endsWith(ext)) || file.type.startsWith('text/');
  };

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
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(isTextFile);
    await addFiles(droppedFiles);
  }, [files, onFilesChange]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(isTextFile);
      await addFiles(selectedFiles);
    }
  }, [files, onFilesChange]);

  const addFiles = async (newFiles: File[]) => {
    const textFiles: TextFile[] = await Promise.all(
      newFiles.map(async file => ({
        id: `txt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        content: await file.text(),
        selected: true,
        expanded: false,
      }))
    );
    onFilesChange([...files, ...textFiles]);
  };

  const toggleSelection = (id: string) => {
    onFilesChange(files.map(f => 
      f.id === id ? { ...f, selected: !f.selected } : f
    ));
  };

  const toggleExpanded = (id: string) => {
    onFilesChange(files.map(f => 
      f.id === id ? { ...f, expanded: !f.expanded } : f
    ));
  };

  const updateContent = (id: string, content: string) => {
    onFilesChange(files.map(f => 
      f.id === id ? { ...f, content } : f
    ));
  };

  const removeFile = (id: string) => {
    onFilesChange(files.filter(f => f.id !== id));
  };

  const selectAll = () => {
    onFilesChange(files.map(f => ({ ...f, selected: true })));
  };

  const selectNone = () => {
    onFilesChange(files.map(f => ({ ...f, selected: false })));
  };

  const clearAll = () => {
    onFilesChange([]);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const selectedCount = files.filter(f => f.selected).length;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Drop Zone - Matching Excel style */}
      <div
        className={cn(
          "flex-1 border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-4 transition-colors min-h-[200px] max-h-[250px]",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <FileText className="h-16 w-16 text-muted-foreground" />
        <div className="text-center">
          <p className="text-lg font-medium">Drop text files here</p>
          <p className="text-sm text-muted-foreground">or click to browse</p>
        </div>
        <Button variant="outline" onClick={() => document.getElementById('text-file-input')?.click()}>
          <Upload className="h-4 w-4 mr-2" />
          Select Files
        </Button>
        <p className="text-xs text-muted-foreground">
          Supports TXT, MD, JSON, JS, TS, PY, and more
        </p>
        <input
          id="text-file-input"
          type="file"
          accept={TEXT_EXTENSIONS.join(',')}
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Actions */}
      {files.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={selectAll}>
            <CheckSquare className="h-4 w-4 mr-1" />
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={selectNone}>
            <Square className="h-4 w-4 mr-1" />
            Select None
          </Button>
          <Button variant="outline" size="sm" onClick={clearAll}>
            <X className="h-4 w-4 mr-1" />
            Clear All
          </Button>
          <span className="text-sm text-muted-foreground ml-auto">
            {selectedCount} of {files.length} selected
          </span>
        </div>
      )}

      {/* File List */}
      <ScrollArea className="flex-1">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <FileText className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">No text files added yet</p>
          </div>
        ) : (
          <div className="space-y-2 p-1">
            {files.map(file => (
              <Collapsible
                key={file.id}
                open={file.expanded}
                onOpenChange={() => toggleExpanded(file.id)}
              >
                <div className={cn(
                  "border rounded-lg transition-colors",
                  file.selected ? "border-primary" : "border-border"
                )}>
                  <div className="flex items-center gap-2 p-3">
                    <Checkbox
                      checked={file.selected}
                      onCheckedChange={() => toggleSelection(file.id)}
                    />
                    <CollapsibleTrigger className="flex items-center gap-2 flex-1 hover:bg-accent/50 rounded p-1 -m-1">
                      {file.expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm truncate flex-1 text-left">
                        {file.file.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(file.file.size)}
                      </span>
                    </CollapsibleTrigger>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeFile(file.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <CollapsibleContent>
                    <div className="px-3 pb-3">
                      <Textarea
                        value={file.content}
                        onChange={(e) => updateContent(file.id, e.target.value)}
                        className="font-mono text-xs min-h-[200px]"
                        placeholder="File content..."
                      />
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}