import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Presentation,
  X,
  FileText,
  Image as ImageIcon,
  Layers,
  CheckSquare,
  Square,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { CompactDropZone } from "./CompactDropZone";
import { parsePptxFile, type PptxData, type PptxSlide, type PptxImage } from "@/utils/parsePptx";
import { generateSlideThumbnail } from "@/utils/renderPptxSlide";
import { cn } from "@/lib/utils";

export type PptxExportMode = "text" | "rasterize" | "both";

export interface PptxExportOptions {
  mode: PptxExportMode;
  mergeText: boolean;
  extractImages: boolean;
  selectedSlides: Set<number>;
  selectedImages: Set<string>;
}

interface ArtifactPptxViewerProps {
  pptxData: PptxData | null;
  onPptxDataChange: (data: PptxData | null) => void;
  exportOptions: PptxExportOptions;
  onExportOptionsChange: (options: PptxExportOptions) => void;
}

export function ArtifactPptxViewer({
  pptxData,
  onPptxDataChange,
  exportOptions,
  onExportOptionsChange,
}: ArtifactPptxViewerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [previewSlideIndex, setPreviewSlideIndex] = useState<number | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Generate thumbnails when data changes
  useEffect(() => {
    if (!pptxData) {
      setThumbnails(new Map());
      return;
    }

    const generateThumbnails = async () => {
      const newThumbnails = new Map<number, string>();

      for (let i = 0; i < pptxData.slides.length; i++) {
        const slide = pptxData.slides[i];
        try {
          const thumbnail = await generateSlideThumbnail(slide, pptxData.media);
          if (thumbnail) {
            newThumbnails.set(i, thumbnail);
            setThumbnails(new Map(newThumbnails));
          }
        } catch (error) {
          console.warn(`Failed to generate thumbnail for slide ${i + 1}`);
        }
      }
    };

    generateThumbnails();
  }, [pptxData]);

  const handleDragOver = () => setIsDragging(true);
  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = async (e: React.DragEvent) => {
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.toLowerCase().endsWith(".pptx") || f.name.toLowerCase().endsWith(".ppt")
    );
    if (files.length > 0) {
      await processFile(files[0]);
    }
  };

  const handleFileSelect = async (files: File[]) => {
    const pptxFiles = files.filter(
      (f) => f.name.toLowerCase().endsWith(".pptx") || f.name.toLowerCase().endsWith(".ppt")
    );
    if (pptxFiles.length > 0) {
      await processFile(pptxFiles[0]);
    }
  };

  const processFile = async (file: File) => {
    setIsLoading(true);
    setParseError(null);
    setLoadingProgress(0);
    setLoadingMessage("Reading file...");

    try {
      setLoadingProgress(20);
      setLoadingMessage("Extracting content...");

      const data = await parsePptxFile(file);

      setLoadingProgress(60);
      setLoadingMessage("Processing slides...");

      // Select all slides and images by default
      const allSlides = new Set(data.slides.map((_, i) => i));
      const allImages = new Set(Array.from(data.media.keys()));
      onExportOptionsChange({
        ...exportOptions,
        selectedSlides: allSlides,
        selectedImages: allImages,
      });

      setLoadingProgress(100);
      setLoadingMessage("Complete!");

      onPptxDataChange(data);
      setPreviewSlideIndex(0);
    } catch (error) {
      console.error("Failed to parse PPTX:", error);
      setParseError(error instanceof Error ? error.message : "Failed to parse PowerPoint file");
    } finally {
      setIsLoading(false);
    }
  };

  const removeFile = () => {
    onPptxDataChange(null);
    setThumbnails(new Map());
    setPreviewSlideIndex(null);
    setParseError(null);
    onExportOptionsChange({
      mode: "text",
      mergeText: true,
      extractImages: true,
      selectedSlides: new Set(),
      selectedImages: new Set(),
    });
  };

  const toggleSlideSelection = (index: number) => {
    const newSelected = new Set(exportOptions.selectedSlides);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    onExportOptionsChange({ ...exportOptions, selectedSlides: newSelected });
  };

  const selectAllSlides = () => {
    if (!pptxData) return;
    const allSlides = new Set(pptxData.slides.map((_, i) => i));
    onExportOptionsChange({ ...exportOptions, selectedSlides: allSlides });
  };

  const deselectAllSlides = () => {
    onExportOptionsChange({ ...exportOptions, selectedSlides: new Set() });
  };

  const toggleImageSelection = (imageId: string) => {
    const newSelected = new Set<string>(exportOptions.selectedImages || new Set<string>());
    if (newSelected.has(imageId)) {
      newSelected.delete(imageId);
    } else {
      newSelected.add(imageId);
    }
    onExportOptionsChange({ ...exportOptions, selectedImages: newSelected });
  };

  const selectAllImages = () => {
    if (!pptxData) return;
    const allImages = new Set<string>(Array.from(pptxData.media.keys()));
    onExportOptionsChange({ ...exportOptions, selectedImages: allImages });
  };

  const deselectAllImages = () => {
    onExportOptionsChange({ ...exportOptions, selectedImages: new Set<string>() });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getArtifactCount = useCallback(() => {
    if (!pptxData || exportOptions.selectedSlides.size === 0) return 0;

    let count = 0;
    const selectedCount = exportOptions.selectedSlides.size;

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
  }, [pptxData, exportOptions]);

  const previewSlide = previewSlideIndex !== null && pptxData?.slides[previewSlideIndex];

  const selectedImagesCount = exportOptions.selectedImages?.size || 0;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Drop zone or file info */}
      {!pptxData && !isLoading && (
        <CompactDropZone
          icon={Presentation}
          label="Drop PowerPoint file here or click to browse"
          buttonText="Select"
          acceptText="PPTX files"
          accept=".pptx,.ppt"
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
      {pptxData && !isLoading && (
        <>
          {/* File header */}
          <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30 shrink-0">
            <Presentation className="h-5 w-5 text-orange-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{pptxData.filename}</p>
              <p className="text-xs text-muted-foreground">
                {pptxData.slideCount} slide{pptxData.slideCount !== 1 ? "s" : ""} •{" "}
                {pptxData.media.size} image{pptxData.media.size !== 1 ? "s" : ""}
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
                onExportOptionsChange({ ...exportOptions, mode: value as PptxExportMode })
              }
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="text" id="mode-text" />
                <Label htmlFor="mode-text" className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <FileText className="h-3.5 w-3.5" /> Extract Text
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="rasterize" id="mode-raster" />
                <Label htmlFor="mode-raster" className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Layers className="h-3.5 w-3.5" /> Rasterize Slides
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="both" id="mode-both" />
                <Label htmlFor="mode-both" className="text-sm cursor-pointer">Both</Label>
              </div>
            </RadioGroup>

            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {(exportOptions.mode === "text" || exportOptions.mode === "both") && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="merge-text"
                    checked={exportOptions.mergeText}
                    onCheckedChange={(checked) =>
                      onExportOptionsChange({ ...exportOptions, mergeText: !!checked })
                    }
                  />
                  <Label htmlFor="merge-text" className="text-sm cursor-pointer">
                    Merge text into single artifact
                  </Label>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="extract-images"
                  checked={exportOptions.extractImages}
                  onCheckedChange={(checked) =>
                    onExportOptionsChange({ ...exportOptions, extractImages: !!checked })
                  }
                />
                <Label htmlFor="extract-images" className="text-sm cursor-pointer">
                  Extract embedded images
                </Label>
              </div>
            </div>
          </div>

          {/* Main scrollable content area */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-4 pr-4">
              {/* Slide selection header */}
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  Slide Selection ({exportOptions.selectedSlides.size}/{pptxData.slideCount})
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={selectAllSlides}
                  >
                    <CheckSquare className="h-3.5 w-3.5 mr-1" /> All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={deselectAllSlides}
                  >
                    <Square className="h-3.5 w-3.5 mr-1" /> None
                  </Button>
                </div>
              </div>

              {/* Slide thumbnails grid */}
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {pptxData.slides.map((slide, index) => {
                  const isSelected = exportOptions.selectedSlides.has(index);
                  const thumbnail = thumbnails.get(index);
                  const isPreviewing = previewSlideIndex === index;

                  return (
                    <div
                      key={index}
                      className={cn(
                        "relative aspect-video rounded border-2 cursor-pointer overflow-hidden transition-all",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-muted bg-muted/30 hover:border-muted-foreground/50",
                        isPreviewing && "ring-2 ring-primary ring-offset-1"
                      )}
                      onClick={() => setPreviewSlideIndex(index)}
                    >
                      {/* Thumbnail */}
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          alt={`Slide ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <Presentation className="h-6 w-6 opacity-30" />
                        </div>
                      )}

                      {/* Selection checkbox overlay */}
                      <div
                        className="absolute top-1 left-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSlideSelection(index);
                        }}
                      >
                        <Checkbox
                          checked={isSelected}
                          className="h-4 w-4 bg-background/80 border-muted-foreground/50"
                        />
                      </div>

                      {/* Slide number */}
                      <div className="absolute bottom-0 right-0 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium rounded-tl">
                        {index + 1}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Picture Gallery - Shows all extracted images */}
              {pptxData.media.size > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        Picture Gallery ({selectedImagesCount}/{pptxData.media.size})
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={selectAllImages}
                      >
                        <CheckSquare className="h-3.5 w-3.5 mr-1" /> All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={deselectAllImages}
                      >
                        <Square className="h-3.5 w-3.5 mr-1" /> None
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
                    {Array.from(pptxData.media.entries()).map(([imageId, img]) => {
                      const isSelected = exportOptions.selectedImages?.has(imageId) || false;
                      return (
                        <div 
                          key={img.id}
                          className={cn(
                            "relative aspect-square rounded border-2 overflow-hidden bg-white cursor-pointer transition-all",
                            isSelected
                              ? "border-primary"
                              : "border-muted hover:border-muted-foreground/50"
                          )}
                          onClick={() => toggleImageSelection(imageId)}
                          title={img.filename}
                        >
                          <img 
                            src={`data:${img.mimeType};base64,${img.base64}`}
                            alt={img.filename}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-1 left-1">
                            <Checkbox
                              checked={isSelected}
                              className="h-4 w-4 bg-background/80 border-muted-foreground/50"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Preview panel at bottom */}
              {previewSlide && (
                <div className="border-t pt-4 mt-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Preview: Slide {previewSlide.index + 1}
                  </div>
                  <div className="flex gap-4">
                    {/* Preview thumbnail */}
                    <div className="w-48 aspect-video rounded border bg-white overflow-hidden shrink-0">
                      {thumbnails.get(previewSlide.index) ? (
                        <img
                          src={thumbnails.get(previewSlide.index)}
                          alt={`Slide ${previewSlide.index + 1}`}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      )}
                    </div>

                    {/* Preview text content */}
                    <div className="flex-1 min-w-0">
                      {previewSlide.title && (
                        <div className="text-sm font-medium truncate mb-2">{previewSlide.title}</div>
                      )}
                      <div className="text-xs text-muted-foreground space-y-1 max-h-24 overflow-y-auto">
                        {previewSlide.textContent.length > 0 ? (
                          previewSlide.textContent.slice(0, 5).map((text, i) => (
                            <p key={i} className="line-clamp-1">{text}</p>
                          ))
                        ) : (
                          <p className="italic">No text content</p>
                        )}
                        {previewSlide.textContent.length > 5 && (
                          <p className="text-muted-foreground/50">
                            +{previewSlide.textContent.length - 5} more...
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
