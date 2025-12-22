import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  X,
  Image as ImageIcon,
  Layers,
  CheckSquare,
  Square,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompactDropZone } from "./CompactDropZone";
import {
  processPDFFile,
  createPageThumbnails,
  extractPDFImages,
  type PdfData,
  type PdfExportMode,
  type PdfExportOptions,
  type PDFEmbeddedImage,
} from "@/utils/parsePdf";
import { cn } from "@/lib/utils";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const PAGES_PER_VIEW = 20;

interface ArtifactPdfViewerProps {
  pdfData: PdfData | null;
  onPdfDataChange: (data: PdfData | null) => void;
  exportOptions: PdfExportOptions;
  onExportOptionsChange: (options: PdfExportOptions) => void;
}

export function ArtifactPdfViewer({
  pdfData,
  onPdfDataChange,
  exportOptions,
  onExportOptionsChange,
}: ArtifactPdfViewerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewPageIndex, setPreviewPageIndex] = useState<number | null>(null);
  const [currentPageSet, setCurrentPageSet] = useState(1);
  const [isLoadingThumbnails, setIsLoadingThumbnails] = useState(false);

  // Calculate pagination
  const totalPageSets = pdfData ? Math.ceil(pdfData.pageCount / PAGES_PER_VIEW) : 0;

  const visiblePageRange = useMemo(() => {
    if (!pdfData) return { start: 0, end: 0 };
    const start = (currentPageSet - 1) * PAGES_PER_VIEW;
    const end = Math.min(start + PAGES_PER_VIEW - 1, pdfData.pageCount - 1);
    return { start, end };
  }, [currentPageSet, pdfData]);

  // Load thumbnails for visible pages when page set changes
  useEffect(() => {
    if (!pdfData || !pdfData.arrayBuffer) return;

    const loadVisibleThumbnails = async () => {
      const { start, end } = visiblePageRange;
      
      // Check if we already have thumbnails for this range
      let needsLoad = false;
      for (let i = start; i <= end; i++) {
        if (!pdfData.thumbnails.has(i)) {
          needsLoad = true;
          break;
        }
      }

      if (!needsLoad) return;

      setIsLoadingThumbnails(true);
      try {
        const newThumbnails = await createPageThumbnails(
          pdfData.arrayBuffer,
          start,
          end,
          0.5
        );

        // Merge with existing thumbnails
        const mergedThumbnails = new Map(pdfData.thumbnails);
        newThumbnails.forEach((value, key) => {
          mergedThumbnails.set(key, value);
        });

        onPdfDataChange({
          ...pdfData,
          thumbnails: mergedThumbnails,
        });
      } catch (error) {
        console.error("Failed to load thumbnails:", error);
      } finally {
        setIsLoadingThumbnails(false);
      }
    };

    loadVisibleThumbnails();
  }, [visiblePageRange, pdfData?.arrayBuffer]);

  const handleDragOver = () => setIsDragging(true);
  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = async (e: React.DragEvent) => {
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.name.toLowerCase().endsWith(".pdf")
    );
    if (files.length > 0) {
      await processFile(files[0]);
    }
  };

  const handleFileSelect = async (files: File[]) => {
    const pdfFiles = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length > 0) {
      await processFile(pdfFiles[0]);
    }
  };

  const processFile = async (file: File) => {
    setIsLoading(true);
    setParseError(null);
    setLoadingProgress(0);
    setLoadingMessage("Reading file...");

    try {
      const result = await processPDFFile(file, (stage, progress) => {
        setLoadingMessage(stage);
        setLoadingProgress(progress);
      });

      setLoadingMessage("Extracting embedded images...");
      setLoadingProgress(70);

      // Extract embedded images
      let embeddedImages = new Map<string, PDFEmbeddedImage>();
      try {
        embeddedImages = await extractPDFImages(result.arrayBuffer);
      } catch (error) {
        console.warn("Failed to extract embedded images:", error);
      }

      setLoadingProgress(85);
      setLoadingMessage("Generating initial thumbnails...");

      // Generate thumbnails for first page set
      const initialThumbnails = await createPageThumbnails(
        result.arrayBuffer,
        0,
        Math.min(PAGES_PER_VIEW - 1, result.pdfInfo.numPages - 1),
        0.5
      );

      setLoadingProgress(100);
      setLoadingMessage("Complete!");

      const pdfData: PdfData = {
        filename: file.name,
        fileSize: file.size,
        pageCount: result.pdfInfo.numPages,
        pagesText: result.pagesText,
        thumbnails: initialThumbnails,
        embeddedImages,
        arrayBuffer: result.arrayBuffer,
      };

      onPdfDataChange(pdfData);

      // Select all pages and images by default
      const allPages = new Set(Array.from({ length: result.pdfInfo.numPages }, (_, i) => i));
      const allImages = new Set(Array.from(embeddedImages.keys()));
      onExportOptionsChange({
        ...exportOptions,
        selectedPages: allPages,
        selectedImages: allImages,
      });

      setPreviewPageIndex(0);
      setCurrentPageSet(1);
    } catch (error) {
      console.error("Failed to parse PDF:", error);
      setParseError(error instanceof Error ? error.message : "Failed to parse PDF file");
    } finally {
      setIsLoading(false);
    }
  };

  const removeFile = () => {
    onPdfDataChange(null);
    setPreviewPageIndex(null);
    setParseError(null);
    setCurrentPageSet(1);
    onExportOptionsChange({
      mode: "text",
      mergeText: true,
      extractImages: true,
      selectedPages: new Set(),
      selectedImages: new Set(),
    });
  };

  const togglePageSelection = (index: number) => {
    const newSelected = new Set(exportOptions.selectedPages);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    onExportOptionsChange({ ...exportOptions, selectedPages: newSelected });
  };

  const selectAllPages = () => {
    if (!pdfData) return;
    const allPages = new Set(Array.from({ length: pdfData.pageCount }, (_, i) => i));
    onExportOptionsChange({ ...exportOptions, selectedPages: allPages });
  };

  const deselectAllPages = () => {
    onExportOptionsChange({ ...exportOptions, selectedPages: new Set() });
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
    if (!pdfData) return;
    const allImages = new Set(Array.from(pdfData.embeddedImages.keys()));
    onExportOptionsChange({ ...exportOptions, selectedImages: allImages });
  };

  const deselectAllImages = () => {
    onExportOptionsChange({ ...exportOptions, selectedImages: new Set() });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getArtifactCount = useCallback(() => {
    if (!pdfData || exportOptions.selectedPages.size === 0) return 0;

    let count = 0;
    const selectedCount = exportOptions.selectedPages.size;

    if (exportOptions.mode === "text" || exportOptions.mode === "both") {
      count += exportOptions.mergeText ? 1 : selectedCount;
    }
    if (exportOptions.mode === "rasterize" || exportOptions.mode === "both") {
      count += selectedCount;
    }
    if (exportOptions.extractImages && exportOptions.selectedImages) {
      count += exportOptions.selectedImages.size;
    }

    return count;
  }, [pdfData, exportOptions]);

  const previousPageSet = () => {
    if (currentPageSet > 1) {
      setCurrentPageSet((prev) => prev - 1);
    }
  };

  const nextPageSet = () => {
    if (currentPageSet < totalPageSets) {
      setCurrentPageSet((prev) => prev + 1);
    }
  };

  const previewPage = previewPageIndex !== null && pdfData;
  const selectedImagesCount = exportOptions.selectedImages?.size || 0;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Drop zone */}
      {!pdfData && !isLoading && (
        <CompactDropZone
          icon={FileText}
          label="Drop PDF file here or click to browse"
          buttonText="Select"
          acceptText="PDF files"
          accept=".pdf"
          onFilesSelected={handleFileSelect}
          isDragging={isDragging}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-8 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-sm text-muted-foreground">{loadingMessage}</div>
          <Progress value={loadingProgress} className="w-48" />
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="flex items-center gap-2 p-3 border rounded-lg bg-destructive/10 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{parseError}</p>
          <Button variant="ghost" size="sm" onClick={() => setParseError(null)} className="ml-auto">
            Dismiss
          </Button>
        </div>
      )}

      {/* File info and options */}
      {pdfData && !isLoading && (
        <>
          {/* File header */}
          <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30 shrink-0">
            <FileText className="h-5 w-5 text-red-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{pdfData.filename}</p>
              <p className="text-xs text-muted-foreground">
                {pdfData.pageCount} page{pdfData.pageCount !== 1 ? "s" : ""} •{" "}
                {pdfData.embeddedImages.size} embedded image{pdfData.embeddedImages.size !== 1 ? "s" : ""} •{" "}
                {formatFileSize(pdfData.fileSize)}
              </p>
            </div>
            <Badge variant="secondary">{getArtifactCount()} artifacts</Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={removeFile}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Export options */}
          <div className="p-3 border rounded-lg bg-muted/20 space-y-3 shrink-0">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Export Options
            </div>

            <RadioGroup
              value={exportOptions.mode}
              onValueChange={(value) =>
                onExportOptionsChange({ ...exportOptions, mode: value as PdfExportMode })
              }
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="text" id="pdf-mode-text" />
                <Label htmlFor="pdf-mode-text" className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <FileText className="h-3.5 w-3.5" /> Extract Text
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="rasterize" id="pdf-mode-raster" />
                <Label htmlFor="pdf-mode-raster" className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Layers className="h-3.5 w-3.5" /> Rasterize Pages
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="both" id="pdf-mode-both" />
                <Label htmlFor="pdf-mode-both" className="text-sm cursor-pointer">
                  Both
                </Label>
              </div>
            </RadioGroup>

            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {(exportOptions.mode === "text" || exportOptions.mode === "both") && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="pdf-merge-text"
                    checked={exportOptions.mergeText}
                    onCheckedChange={(checked) =>
                      onExportOptionsChange({ ...exportOptions, mergeText: !!checked })
                    }
                  />
                  <Label htmlFor="pdf-merge-text" className="text-sm cursor-pointer">
                    Merge text into single artifact
                  </Label>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="pdf-extract-images"
                  checked={exportOptions.extractImages}
                  onCheckedChange={(checked) =>
                    onExportOptionsChange({ ...exportOptions, extractImages: !!checked })
                  }
                />
                <Label htmlFor="pdf-extract-images" className="text-sm cursor-pointer">
                  Extract embedded images ({pdfData.embeddedImages.size})
                </Label>
              </div>
            </div>

          </div>

          {/* Main scrollable content area */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-4 pr-4">
              {/* Preview panel */}
              {previewPage && previewPageIndex !== null && (
                <div className="border rounded-lg p-4 bg-card">
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Page {previewPageIndex + 1} Preview
                  </div>
                  <div className="flex gap-4">
                    {/* Thumbnail preview */}
                    <div className="w-32 shrink-0">
                      {pdfData.thumbnails.has(previewPageIndex) ? (
                        <img
                          src={pdfData.thumbnails.get(previewPageIndex)}
                          alt={`Page ${previewPageIndex + 1}`}
                          className="w-full h-auto border rounded bg-white"
                        />
                      ) : (
                        <div className="w-full aspect-[3/4] border rounded bg-muted flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    {/* Text preview */}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground mb-1">Text Content</div>
                      <div className="text-sm bg-muted/30 rounded p-2 max-h-32 overflow-y-auto">
                        {pdfData.pagesText[previewPageIndex] ? (
                          <p className="whitespace-pre-wrap line-clamp-6">
                            {pdfData.pagesText[previewPageIndex].substring(0, 500)}
                            {pdfData.pagesText[previewPageIndex].length > 500 ? "..." : ""}
                          </p>
                        ) : (
                          <p className="text-muted-foreground italic">No text content on this page</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Page selection header with pagination */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    Page Selection ({exportOptions.selectedPages.size}/{pdfData.pageCount})
                  </span>
                  {isLoadingThumbnails && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Pagination controls */}
                  {totalPageSets > 1 && (
                    <div className="flex items-center gap-1 mr-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={previousPageSet}
                        disabled={currentPageSet === 1}
                        className="h-7 w-7 p-0"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xs text-muted-foreground min-w-[80px] text-center">
                        {visiblePageRange.start + 1}-{visiblePageRange.end + 1} of {pdfData.pageCount}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={nextPageSet}
                        disabled={currentPageSet === totalPageSets}
                        className="h-7 w-7 p-0"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAllPages}
                    className="h-7 text-xs gap-1"
                  >
                    <CheckSquare className="h-3 w-3" /> All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={deselectAllPages}
                    className="h-7 text-xs gap-1"
                  >
                    <Square className="h-3 w-3" /> None
                  </Button>
                </div>
              </div>

              {/* Page thumbnails grid */}
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {Array.from({ length: visiblePageRange.end - visiblePageRange.start + 1 }, (_, i) => {
                  const pageIndex = visiblePageRange.start + i;
                  const isSelected = exportOptions.selectedPages.has(pageIndex);
                  const thumbnail = pdfData.thumbnails.get(pageIndex);

                  return (
                    <div
                      key={pageIndex}
                      className={cn(
                        "relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all",
                        isSelected
                          ? "border-primary ring-2 ring-primary/20"
                          : "border-transparent hover:border-muted-foreground/30",
                        previewPageIndex === pageIndex && "ring-2 ring-blue-500"
                      )}
                      onClick={() => setPreviewPageIndex(pageIndex)}
                    >
                      {/* Thumbnail */}
                      <div className="aspect-[3/4] bg-white relative">
                        {thumbnail ? (
                          <img
                            src={thumbnail}
                            alt={`Page ${pageIndex + 1}`}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Selection checkbox */}
                      <div
                        className="absolute top-1 left-1 z-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePageSelection(pageIndex);
                        }}
                      >
                        <Checkbox checked={isSelected} className="bg-white/80" />
                      </div>

                      {/* Page number badge */}
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] text-center py-0.5">
                        {pageIndex + 1}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Embedded images gallery */}
              {exportOptions.extractImages && pdfData.embeddedImages.size > 0 && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Embedded Images ({selectedImagesCount}/{pdfData.embeddedImages.size})
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={selectAllImages}
                        className="h-7 text-xs gap-1"
                      >
                        <CheckSquare className="h-3 w-3" /> All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={deselectAllImages}
                        className="h-7 text-xs gap-1"
                      >
                        <Square className="h-3 w-3" /> None
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    {Array.from(pdfData.embeddedImages.entries()).map(([imageId, image]) => {
                      const isSelected = exportOptions.selectedImages.has(imageId);

                      return (
                        <div
                          key={imageId}
                          className={cn(
                            "relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all",
                            isSelected
                              ? "border-primary ring-2 ring-primary/20"
                              : "border-transparent hover:border-muted-foreground/30"
                          )}
                          onClick={() => toggleImageSelection(imageId)}
                        >
                          <div className="aspect-square bg-muted relative">
                            <img
                              src={image.dataUrl}
                              alt={`Embedded image from page ${image.pageIndex + 1}`}
                              className="w-full h-full object-contain"
                            />
                          </div>

                          {/* Selection checkbox */}
                          <div className="absolute top-1 left-1 z-10">
                            <Checkbox checked={isSelected} className="bg-white/80" />
                          </div>

                          {/* Page source badge */}
                          <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] text-center py-0.5">
                            p.{image.pageIndex + 1}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}

// Re-export types for convenience
export type { PdfData, PdfExportMode, PdfExportOptions } from "@/utils/parsePdf";
