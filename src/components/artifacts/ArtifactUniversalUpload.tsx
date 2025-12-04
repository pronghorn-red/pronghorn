import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  FolderOpen, 
  Image, 
  FileSpreadsheet, 
  FileText, 
  FileIcon,
  Presentation,
  Check
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FileCategory {
  type: string;
  label: string;
  icon: React.ReactNode;
  count: number;
  color: string;
}

interface ArtifactUniversalUploadProps {
  onImagesAdded: (files: File[]) => void;
  onExcelAdded: (file: File) => void;
  onTextFilesAdded: (files: File[]) => void;
  onDocxFilesAdded: (files: File[]) => void;
  onPdfFilesAdded: (files: File[]) => void;
  onPptxFilesAdded: (files: File[]) => void;
  counts: {
    images: number;
    excel: number;
    textFiles: number;
    docx: number;
    pdf: number;
    pptx: number;
  };
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
const EXCEL_EXTENSIONS = ['.xlsx', '.xls'];
const TEXT_EXTENSIONS = [
  '.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go',
  '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.html', '.css', '.scss',
  '.less', '.xml', '.yaml', '.yml', '.toml', '.ini', '.conf', '.cfg', '.env',
  '.sh', '.bash', '.zsh', '.sql', '.graphql', '.vue', '.svelte', '.rs', '.swift',
  '.kt', '.scala', '.r', '.m', '.pl', '.lua', '.ex', '.exs', '.elm', '.hs',
];
const DOCX_EXTENSIONS = ['.docx', '.doc'];
const PDF_EXTENSIONS = ['.pdf'];
const PPTX_EXTENSIONS = ['.pptx', '.ppt'];

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : '';
}

function categorizeFile(file: File): string | null {
  const ext = getFileExtension(file.name);
  
  if (IMAGE_EXTENSIONS.includes(ext) || file.type.startsWith('image/')) return 'image';
  if (EXCEL_EXTENSIONS.includes(ext)) return 'excel';
  if (TEXT_EXTENSIONS.includes(ext) || file.type.startsWith('text/')) return 'text';
  if (DOCX_EXTENSIONS.includes(ext)) return 'docx';
  if (PDF_EXTENSIONS.includes(ext)) return 'pdf';
  if (PPTX_EXTENSIONS.includes(ext)) return 'pptx';
  
  return null;
}

export function ArtifactUniversalUpload({
  onImagesAdded,
  onExcelAdded,
  onTextFilesAdded,
  onDocxFilesAdded,
  onPdfFilesAdded,
  onPptxFilesAdded,
  counts,
}: ArtifactUniversalUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [recentUpload, setRecentUpload] = useState<{ total: number; categories: Record<string, number> } | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFiles = useCallback((files: File[]) => {
    const categorized: Record<string, File[]> = {
      image: [],
      excel: [],
      text: [],
      docx: [],
      pdf: [],
      pptx: [],
    };

    files.forEach(file => {
      const category = categorizeFile(file);
      if (category && categorized[category]) {
        categorized[category].push(file);
      }
    });

    // Distribute to appropriate handlers
    if (categorized.image.length > 0) {
      onImagesAdded(categorized.image);
    }
    if (categorized.excel.length > 0) {
      // Only pass the first Excel file (the viewer handles one at a time)
      onExcelAdded(categorized.excel[0]);
    }
    if (categorized.text.length > 0) {
      onTextFilesAdded(categorized.text);
    }
    if (categorized.docx.length > 0) {
      onDocxFilesAdded(categorized.docx);
    }
    if (categorized.pdf.length > 0) {
      onPdfFilesAdded(categorized.pdf);
    }
    if (categorized.pptx.length > 0) {
      onPptxFilesAdded(categorized.pptx);
    }

    // Show upload summary
    const uploadSummary: Record<string, number> = {};
    let total = 0;
    Object.entries(categorized).forEach(([cat, catFiles]) => {
      if (catFiles.length > 0) {
        uploadSummary[cat] = catFiles.length;
        total += catFiles.length;
      }
    });
    
    if (total > 0) {
      setRecentUpload({ total, categories: uploadSummary });
      setTimeout(() => setRecentUpload(null), 3000);
    }
  }, [onImagesAdded, onExcelAdded, onTextFilesAdded, onDocxFilesAdded, onPdfFilesAdded, onPptxFilesAdded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  }, [processFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      processFiles(files);
      e.target.value = ''; // Reset input
    }
  }, [processFiles]);

  const categories: FileCategory[] = [
    { type: 'images', label: 'Images', icon: <Image className="h-4 w-4" />, count: counts.images, color: 'bg-blue-500' },
    { type: 'excel', label: 'Excel', icon: <FileSpreadsheet className="h-4 w-4" />, count: counts.excel, color: 'bg-green-500' },
    { type: 'textFiles', label: 'Text Files', icon: <FileText className="h-4 w-4" />, count: counts.textFiles, color: 'bg-yellow-500' },
    { type: 'docx', label: 'Word', icon: <FileText className="h-4 w-4" />, count: counts.docx, color: 'bg-blue-600' },
    { type: 'pdf', label: 'PDF', icon: <FileIcon className="h-4 w-4" />, count: counts.pdf, color: 'bg-red-500' },
    { type: 'pptx', label: 'PowerPoint', icon: <Presentation className="h-4 w-4" />, count: counts.pptx, color: 'bg-orange-500' },
  ];

  const totalFiles = Object.values(counts).reduce((sum, c) => sum + c, 0);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Drop Zone */}
      <div
        className={cn(
          "flex-1 border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-4 transition-colors min-h-[300px]",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <FolderOpen className="h-16 w-16 text-muted-foreground" />
        <div className="text-center">
          <p className="text-lg font-medium">Drop any files here</p>
          <p className="text-sm text-muted-foreground">or click to browse your project folder</p>
        </div>
        <Button variant="outline" onClick={() => document.getElementById('universal-file-input')?.click()}>
          <Upload className="h-4 w-4 mr-2" />
          Select Files
        </Button>
        <p className="text-xs text-muted-foreground text-center max-w-md">
          Supports Images, Excel, Text Files, Word, PDF, and PowerPoint.
          Files are automatically sorted into their categories.
        </p>
        <input
          id="universal-file-input"
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Recent Upload Notification */}
      {recentUpload && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 flex items-center gap-2">
          <Check className="h-5 w-5 text-green-500" />
          <span className="text-sm">
            Added {recentUpload.total} file{recentUpload.total !== 1 ? 's' : ''} to categories
          </span>
        </div>
      )}

      {/* Category Summary */}
      {totalFiles > 0 && (
        <div className="border rounded-lg p-4">
          <h4 className="text-sm font-medium mb-3">Files by Category</h4>
          <ScrollArea className="max-h-[200px]">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.map(cat => (
                <div
                  key={cat.type}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg border",
                    cat.count > 0 ? "bg-accent/50" : "opacity-50"
                  )}
                >
                  {cat.icon}
                  <span className="text-sm flex-1">{cat.label}</span>
                  {cat.count > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5">
                      {cat.count}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {totalFiles === 0 && (
        <div className="text-center text-sm text-muted-foreground py-4">
          <p>No files uploaded yet. Drop files above to get started.</p>
        </div>
      )}
    </div>
  );
}