import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { 
  FileText, X, Loader2, Image as ImageIcon, 
  CheckSquare, Square, FileDown
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CompactDropZone } from "./CompactDropZone";
import { 
  DocxData, 
  DocxExportOptions, 
  DocxExportMode, 
  DocxTextFormat,
  DocxImage,
  processDocxFile,
  rasterizeDocx,
  getTextContent,
} from "@/utils/parseDocx";

export type { DocxData, DocxExportOptions, DocxExportMode, DocxTextFormat };

// Preview tab now controls export format
type PreviewTabType = "markdown-raw" | "markdown-preview" | "html" | "text";

interface ArtifactDocxViewerProps {
  docxData: DocxData | null;
  onDocxDataChange: (data: DocxData | null) => void;
  exportOptions: DocxExportOptions;
  onExportOptionsChange: (options: DocxExportOptions) => void;
}

export function ArtifactDocxViewer({
  docxData,
  onDocxDataChange,
  exportOptions,
  onExportOptionsChange,
}: ArtifactDocxViewerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTabType>("markdown-preview");
  const [rasterizedPages, setRasterizedPages] = useState<string[]>([]);
  const [isRasterizing, setIsRasterizing] = useState(false);
  const rasterAbortRef = useRef<AbortController | null>(null);

  // Generate rasterized preview when mode changes
  useEffect(() => {
    if (docxData && (exportOptions.mode === "rasterize" || exportOptions.mode === "both") && rasterizedPages.length === 0) {
      generateRasterizedPreview();
    }
  }, [docxData, exportOptions.mode]);

  // Page selection helpers using exportOptions
  const toggleRasterPageSelection = (pageIndex: number) => {
    const newSet = new Set(exportOptions.selectedRasterPages);
    if (newSet.has(pageIndex)) {
      newSet.delete(pageIndex);
    } else {
      newSet.add(pageIndex);
    }
    onExportOptionsChange({ ...exportOptions, selectedRasterPages: newSet });
  };

  const selectAllRasterPages = () => {
    onExportOptionsChange({
      ...exportOptions,
      selectedRasterPages: new Set(rasterizedPages.map((_, i) => i)),
    });
  };

  const deselectAllRasterPages = () => {
    onExportOptionsChange({ ...exportOptions, selectedRasterPages: new Set() });
  };

  // Sync previewTab to exportOptions.outputFormat for export
  useEffect(() => {
    let outputFormat: DocxTextFormat;
    if (previewTab === "markdown-raw" || previewTab === "markdown-preview") {
      outputFormat = "markdown";
    } else if (previewTab === "html") {
      outputFormat = "html";
    } else {
      outputFormat = "plaintext";
    }
    if (exportOptions.outputFormat !== outputFormat) {
      onExportOptionsChange({ ...exportOptions, outputFormat });
    }
  }, [previewTab]);

  const [rasterProgress, setRasterProgress] = useState<{ current: number; total: number } | null>(null);

  const generateRasterizedPreview = async () => {
    if (!docxData || isRasterizing) return;
    
    // Create abort controller for this rasterization
    rasterAbortRef.current = new AbortController();
    
    setIsRasterizing(true);
    setRasterProgress(null);
    try {
      const pages = await rasterizeDocx(docxData.arrayBuffer, { 
        width: 816, 
        scale: 1,
        onProgress: (current, total) => {
          setRasterProgress({ current, total });
        },
        abortSignal: rasterAbortRef.current.signal,
      });
      setRasterizedPages(pages);
      // Auto-select all pages and update export options with cached pages
      onExportOptionsChange({
        ...exportOptions,
        selectedRasterPages: new Set(pages.map((_, i) => i)),
        rasterizedPageCount: pages.length,
        cachedRasterizedPages: pages, // Cache for reuse in AddArtifactModal
      });
    } catch (err: any) {
      if (err.name === "AbortError") {
        toast.info("Rasterization cancelled");
        return;
      }
      console.error("Failed to generate rasterized preview:", err);
    } finally {
      setIsRasterizing(false);
      setRasterProgress(null);
      rasterAbortRef.current = null;
    }
  };

  const handleDragOver = () => setIsDragging(true);
  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f =>
      f.name.toLowerCase().endsWith(".docx") || f.name.toLowerCase().endsWith(".doc")
    );
    if (droppedFiles.length > 0) {
      processFile(droppedFiles[0]);
    }
  };

  const handleFileSelect = (selectedFiles: File[]) => {
    const docxFiles = selectedFiles.filter(f =>
      f.name.toLowerCase().endsWith(".docx") || f.name.toLowerCase().endsWith(".doc")
    );
    if (docxFiles.length > 0) {
      processFile(docxFiles[0]);
    }
  };

  const processFile = async (file: File) => {
    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingMessage("Reading file...");
    setParseError(null);
    setRasterizedPages([]);

    try {
      setLoadingProgress(20);
      setLoadingMessage("Extracting content...");

      const data = await processDocxFile(file);

      setLoadingProgress(80);
      setLoadingMessage("Processing images...");

      // Set default export options with all images selected
      const allImageIds = new Set(data.embeddedImages.keys());
      onExportOptionsChange({
        ...exportOptions,
        selectedImages: allImageIds,
      });

      setLoadingProgress(100);
      setLoadingMessage("Done!");

      onDocxDataChange(data);
    } catch (err) {
      console.error("Failed to parse DOCX:", err);
      setParseError(err instanceof Error ? err.message : "Failed to parse document");
    } finally {
      setIsLoading(false);
    }
  };

  const removeFile = () => {
    onDocxDataChange(null);
    setRasterizedPages([]);
    onExportOptionsChange({
      mode: "text",
      outputFormat: "markdown",
      extractImages: true,
      selectedImages: new Set(),
      selectedRasterPages: new Set(),
      rasterizedPageCount: 0,
    });
  };

  const toggleImageSelection = (imageId: string) => {
    const newSelected = new Set(exportOptions.selectedImages);
    if (newSelected.has(imageId)) {
      newSelected.delete(imageId);
    } else {
      newSelected.add(imageId);
    }
    onExportOptionsChange({ ...exportOptions, selectedImages: newSelected });
  };

  const selectAllImages = () => {
    if (!docxData) return;
    const allIds = new Set(docxData.embeddedImages.keys());
    onExportOptionsChange({ ...exportOptions, selectedImages: allIds });
  };

  const deselectAllImages = () => {
    onExportOptionsChange({ ...exportOptions, selectedImages: new Set() });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getArtifactCount = (): number => {
    if (!docxData) return 0;
    let count = 0;

    if (exportOptions.mode === "text" || exportOptions.mode === "both") {
      count += 1; // Text content (merged)
    }
    if (exportOptions.mode === "rasterize" || exportOptions.mode === "both") {
      count += exportOptions.selectedRasterPages.size; // Only count SELECTED pages
    }
    if (exportOptions.extractImages) {
      count += exportOptions.selectedImages.size;
    }

    return count;
  };

  // Render drop zone when no file loaded
  if (!docxData && !isLoading) {
    return (
      <div className="flex flex-col gap-3 h-full min-h-0">
        <CompactDropZone
          icon={FileText}
          label="Drop Word document here or click to browse"
          buttonText="Select"
          acceptText="DOCX files"
          accept=".docx,.doc"
          onFilesSelected={handleFileSelect}
          isDragging={isDragging}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
        {parseError && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
            {parseError}
          </div>
        )}
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="w-full max-w-xs space-y-2">
          <Progress value={loadingProgress} className="h-2" />
          <p className="text-sm text-muted-foreground text-center">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  if (!docxData) return null;

  const imageCount = docxData.embeddedImages.size;
  const selectedImageCount = exportOptions.selectedImages.size;
  const artifactCount = getArtifactCount();

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* File Header */}
      <div className="shrink-0 flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
        <FileText className="h-5 w-5 text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{docxData.filename}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(docxData.fileSize)} • {imageCount} embedded image{imageCount !== 1 ? "s" : ""}
          </p>
        </div>
        {artifactCount > 0 && (
          <Badge variant="default" className="shrink-0">
            {artifactCount} artifact{artifactCount !== 1 ? "s" : ""}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
          onClick={removeFile}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Export Options */}
      <div className="shrink-0 p-3 border rounded-lg bg-muted/20 space-y-3">
        <div className="flex flex-wrap gap-4">
          {/* Mode Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Export Mode</Label>
            <RadioGroup
              value={exportOptions.mode}
              onValueChange={(v) => onExportOptionsChange({ ...exportOptions, mode: v as DocxExportMode })}
              className="flex gap-3"
            >
              <div className="flex items-center space-x-1.5">
                <RadioGroupItem value="text" id="mode-text" />
                <Label htmlFor="mode-text" className="text-xs cursor-pointer">Extract Text</Label>
              </div>
              <div className="flex items-center space-x-1.5">
                <RadioGroupItem value="rasterize" id="mode-rasterize" />
                <Label htmlFor="mode-rasterize" className="text-xs cursor-pointer">Rasterize</Label>
              </div>
              <div className="flex items-center space-x-1.5">
                <RadioGroupItem value="both" id="mode-both" />
                <Label htmlFor="mode-both" className="text-xs cursor-pointer">Both</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Extract Images Checkbox */}
          {imageCount > 0 && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="extract-images"
                checked={exportOptions.extractImages}
                onCheckedChange={(checked) =>
                  onExportOptionsChange({ ...exportOptions, extractImages: checked === true })
                }
              />
              <Label htmlFor="extract-images" className="text-xs cursor-pointer">
                Extract Images ({selectedImageCount}/{imageCount})
              </Label>
            </div>
          )}
        </div>

      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-4 p-1">
          {/* Text Preview */}
          {(exportOptions.mode === "text" || exportOptions.mode === "both") && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileDown className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Text Preview</span>
                <div className="flex gap-1 ml-auto flex-wrap">
                  <Button
                    variant={previewTab === "markdown-raw" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setPreviewTab("markdown-raw")}
                  >
                    Markdown Raw
                  </Button>
                  <Button
                    variant={previewTab === "markdown-preview" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setPreviewTab("markdown-preview")}
                  >
                    Markdown Preview
                  </Button>
                  <Button
                    variant={previewTab === "html" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setPreviewTab("html")}
                  >
                    HTML
                  </Button>
                  <Button
                    variant={previewTab === "text" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setPreviewTab("text")}
                  >
                    Text
                  </Button>
                </div>
              </div>
              <div className="border rounded-lg p-3 bg-background">
                {previewTab === "markdown-preview" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {docxData.markdownContent}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                    {previewTab === "markdown-raw" && docxData.markdownContent}
                    {previewTab === "html" && docxData.htmlContent}
                    {previewTab === "text" && docxData.rawText}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* Rasterized Preview */}
          {(exportOptions.mode === "rasterize" || exportOptions.mode === "both") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Rasterized Pages {rasterizedPages.length > 0 && `(${exportOptions.selectedRasterPages.size}/${rasterizedPages.length})`}
                  </span>
                </div>
                {rasterizedPages.length > 0 && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={selectAllRasterPages}
                    >
                      <CheckSquare className="h-3 w-3 mr-1" />
                      All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={deselectAllRasterPages}
                    >
                      <Square className="h-3 w-3 mr-1" />
                      None
                    </Button>
                  </div>
                )}
              </div>
              <div className="border rounded-lg p-2 bg-background">
                {isRasterizing ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {rasterProgress 
                        ? `Rasterizing page ${rasterProgress.current} of ${rasterProgress.total}...`
                        : "Preparing document..."}
                    </span>
                  </div>
                ) : rasterizedPages.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {rasterizedPages.map((page, index) => {
                      const isSelected = exportOptions.selectedRasterPages.has(index);
                      return (
                        <div
                          key={index}
                          className={cn(
                            "relative border rounded overflow-hidden bg-white cursor-pointer",
                            isSelected ? "ring-2 ring-primary border-primary" : "hover:border-primary/50"
                          )}
                          onClick={() => toggleRasterPageSelection(index)}
                        >
                          <div className="absolute top-1 left-1 z-10">
                            <Checkbox
                              checked={isSelected}
                              className="h-4 w-4 bg-background/80"
                            />
                          </div>
                          <img
                            src={page}
                            alt={`Page ${index + 1}`}
                            className="w-full h-auto object-contain"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                            <p className="text-[10px] text-white text-center">Page {index + 1}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-40">
                    <Button variant="outline" size="sm" onClick={generateRasterizedPreview}>
                      Generate Preview
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Embedded Images Gallery */}
          {exportOptions.extractImages && imageCount > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Embedded Images ({selectedImageCount}/{imageCount})
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={selectAllImages}
                  >
                    <CheckSquare className="h-3 w-3 mr-1" />
                    All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={deselectAllImages}
                  >
                    <Square className="h-3 w-3 mr-1" />
                    None
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                {Array.from(docxData.embeddedImages.entries()).map(([id, img]) => {
                  const isSelected = exportOptions.selectedImages.has(id);
                  return (
                    <div
                      key={id}
                      className={cn(
                        "relative aspect-square border rounded-lg overflow-hidden cursor-pointer group",
                        isSelected ? "ring-2 ring-primary border-primary" : "hover:border-primary/50"
                      )}
                      onClick={() => toggleImageSelection(id)}
                    >
                      <img
                        src={`data:${img.mimeType};base64,${img.base64}`}
                        alt={img.filename}
                        className="w-full h-full object-cover"
                        style={{ imageOrientation: "from-image" }}
                      />
                      <div
                        className={cn(
                          "absolute inset-0 bg-primary/20 flex items-center justify-center transition-opacity",
                          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-50"
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          className="h-5 w-5 bg-background"
                        />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                        <p className="text-[10px] text-white truncate">{img.filename}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
