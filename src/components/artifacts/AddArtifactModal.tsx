import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Image, FileSpreadsheet, FileText, PenLine, FileIcon, 
  Presentation, Loader2, Upload, PanelLeftClose, PanelLeft, ScanEye
} from "lucide-react";
import { VisualRecognitionImportDialog, RasterizedImage } from "./VisualRecognitionImportDialog";
import { cn } from "@/lib/utils";
import { ArtifactImageGallery, ImageFile } from "./ArtifactImageGallery";
import { ArtifactTextFileList, TextFile } from "./ArtifactTextFileList";
import { ArtifactExcelViewer } from "./ArtifactExcelViewer";
import { ArtifactDocxViewer, type DocxData, type DocxExportOptions } from "./ArtifactDocxViewer";
import { ArtifactPdfPlaceholder, type PdfData, type PdfExportOptions } from "./ArtifactPdfPlaceholder";
import { ArtifactPptxViewer, PptxExportOptions } from "./ArtifactPptxViewer";
import { rasterizeSelectedPages } from "@/utils/parsePdf";
import { ArtifactUniversalUpload } from "./ArtifactUniversalUpload";
import { ExcelData, formatExcelDataAsJson, parseExcelFile } from "@/utils/parseExcel";
import { PptxData, getAllText, getTextPerSlide } from "@/utils/parsePptx";
import { rasterizeSlide } from "@/utils/renderPptxSlide";
import { getTextContent, rasterizeDocx } from "@/utils/parseDocx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type TabType = "manual" | "upload" | "images" | "excel" | "text" | "pptx" | "docx" | "pdf";

interface AddArtifactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  shareToken: string | null;
  onArtifactsCreated: () => void;
  addArtifact: (content: string, sourceType?: string, sourceId?: string, imageUrl?: string) => Promise<any>;
  broadcastRefresh: (action?: string, id?: string) => void;
}

// Helper to generate a unique provenance ID
const generateProvenanceId = (filename: string): string => {
  return `${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}-${Date.now()}`;
};

export function AddArtifactModal({
  open,
  onOpenChange,
  projectId,
  shareToken,
  onArtifactsCreated,
  addArtifact,
  broadcastRefresh,
}: AddArtifactModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("manual");
  const [isCreating, setIsCreating] = useState(false);
  const [creatingMessage, setCreatingMessage] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Image state
  const [images, setImages] = useState<ImageFile[]>([]);

  // Excel state
  const [excelData, setExcelData] = useState<ExcelData | null>(null);
  const [excelSelectedRows, setExcelSelectedRows] = useState<Map<string, Set<number>>>(new Map());
  const [excelMergeAsOne, setExcelMergeAsOne] = useState(true);

  // Text files state
  const [textFiles, setTextFiles] = useState<TextFile[]>([]);

  // Manual entry state
  const [manualContent, setManualContent] = useState("");

  // PPTX state
  const [pptxData, setPptxData] = useState<PptxData | null>(null);
  const [pptxExportOptions, setPptxExportOptions] = useState<PptxExportOptions>({
    mode: "text",
    mergeText: true,
    extractImages: true,
    selectedSlides: new Set(),
    selectedImages: new Set(),
  });

  // DOCX state
  const [docxData, setDocxData] = useState<DocxData | null>(null);
  const [docxExportOptions, setDocxExportOptions] = useState<DocxExportOptions>({
    mode: "text",
    outputFormat: "markdown",
    extractImages: true,
    selectedImages: new Set(),
    selectedRasterPages: new Set(),
    rasterizedPageCount: 0,
  });

  // PDF state
  const [pdfData, setPdfData] = useState<PdfData | null>(null);
  const [pdfExportOptions, setPdfExportOptions] = useState<PdfExportOptions>({
    mode: "text",
    mergeText: true,
    extractImages: true,
    selectedPages: new Set(),
    selectedImages: new Set(),
  });

  // Auto-collapse sidebar on small screens
  useEffect(() => {
    const checkScreenSize = () => {
      setSidebarCollapsed(window.innerWidth < 640);
    };
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // Auto-focus textarea when modal opens with manual tab active
  useEffect(() => {
    if (open && activeTab === "manual") {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [open, activeTab]);

  const selectedImagesCount = images.filter(i => i.selected).length;
  const selectedTextFilesCount = textFiles.filter(f => f.selected).length;
  const excelRowsCount = Array.from(excelSelectedRows.values()).reduce((sum, set) => sum + set.size, 0);

  // Calculate PPTX artifact count
  const getPptxCount = useCallback(() => {
    if (!pptxData || pptxExportOptions.selectedSlides.size === 0) return 0;

    let count = 0;
    const selectedCount = pptxExportOptions.selectedSlides.size;

    if (pptxExportOptions.mode === "text" || pptxExportOptions.mode === "both") {
      count += pptxExportOptions.mergeText ? 1 : selectedCount;
    }
    if (pptxExportOptions.mode === "rasterize" || pptxExportOptions.mode === "both") {
      count += selectedCount;
    }
    if (pptxExportOptions.extractImages && pptxExportOptions.selectedImages) {
      count += pptxExportOptions.selectedImages.size;
    }

    return count;
  }, [pptxData, pptxExportOptions]);

  const pptxCount = getPptxCount();

  // Calculate PDF artifact count
  const getPdfCount = useCallback(() => {
    if (!pdfData || pdfExportOptions.selectedPages.size === 0) return 0;
    let count = 0;
    const selectedCount = pdfExportOptions.selectedPages.size;
    if (pdfExportOptions.mode === "text" || pdfExportOptions.mode === "both") {
      count += pdfExportOptions.mergeText ? 1 : selectedCount;
    }
    if (pdfExportOptions.mode === "rasterize" || pdfExportOptions.mode === "both") {
      count += selectedCount;
    }
    if (pdfExportOptions.extractImages && pdfExportOptions.selectedImages) {
      count += pdfExportOptions.selectedImages.size;
    }
    return count;
  }, [pdfData, pdfExportOptions]);

  const pdfCount = getPdfCount();

  // Calculate DOCX artifact count
  const getDocxCount = useCallback(() => {
    if (!docxData) return 0;
    let count = 0;
    if (docxExportOptions.mode === "text" || docxExportOptions.mode === "both") {
      count += 1;
    }
    if (docxExportOptions.mode === "rasterize" || docxExportOptions.mode === "both") {
      count += docxExportOptions.selectedRasterPages.size;
    }
    if (docxExportOptions.extractImages) {
      count += docxExportOptions.selectedImages.size;
    }
    return count;
  }, [docxData, docxExportOptions]);

  const docxCount = getDocxCount();

  const getTotalCount = () => {
    let count = 0;
    count += selectedImagesCount;
    count += selectedTextFilesCount;
    // Excel count depends on merge setting
    if (excelRowsCount > 0) {
      count += excelMergeAsOne ? 1 : excelRowsCount;
    }
    if (manualContent.trim()) count += 1;
    // PPTX count
    count += pptxCount;
    // PDF count
    count += pdfCount;
    // DOCX count
    count += docxCount;
    return count;
  };

  const totalCount = getTotalCount();

  const tabs: { id: TabType; label: string; icon: React.ReactNode; count?: number; disabled?: boolean }[] = [
    { id: "manual", label: "Manual Entry", icon: <PenLine className="h-4 w-4" />, count: manualContent.trim() ? 1 : 0 },
    { id: "upload", label: "Upload", icon: <Upload className="h-4 w-4" /> },
    { id: "images", label: "Images", icon: <Image className="h-4 w-4" />, count: selectedImagesCount },
    { id: "excel", label: "Excel", icon: <FileSpreadsheet className="h-4 w-4" />, count: excelRowsCount > 0 ? (excelMergeAsOne ? 1 : excelRowsCount) : 0 },
    { id: "text", label: "Text Files", icon: <FileText className="h-4 w-4" />, count: selectedTextFilesCount },
    { id: "pptx", label: "PowerPoint", icon: <Presentation className="h-4 w-4" />, count: pptxCount },
    { id: "pdf", label: "PDF", icon: <FileIcon className="h-4 w-4" />, count: pdfCount },
    { id: "docx", label: "Word", icon: <FileText className="h-4 w-4" />, count: docxCount },
  ];

  // Handlers for universal upload
  const handleUniversalImagesAdded = (files: File[]) => {
    const newImages: ImageFile[] = files.map(file => ({
      id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      preview: URL.createObjectURL(file),
      selected: true,
    }));
    setImages(prev => [...prev, ...newImages]);
  };

  const handleUniversalExcelAdded = async (file: File) => {
    try {
      const data = await parseExcelFile(file);
      setExcelData(data);
    } catch (error) {
      console.error("Error parsing Excel file:", error);
      toast.error("Failed to parse Excel file");
    }
  };

  const handleUniversalTextFilesAdded = async (files: File[]) => {
    const newTextFiles: TextFile[] = await Promise.all(
      files.map(async file => ({
        id: `txt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        content: await file.text(),
        selected: true,
        expanded: false,
      }))
    );
    setTextFiles(prev => [...prev, ...newTextFiles]);
  };

  const handleUniversalDocxAdded = (files: File[]) => {
    // DOCX files are now handled by the viewer component - switch to DOCX tab
    if (files.length > 0) {
      setActiveTab("docx");
    }
  };

  const handleUniversalPdfAdded = (files: File[]) => {
    // PDF files are now handled by the viewer component - switch to PDF tab
    if (files.length > 0) {
      setActiveTab("pdf");
    }
  };

  const handleUniversalPptxAdded = (files: File[]) => {
    // Note: PPTX files are now handled by the viewer component
    // This handler is kept for the universal upload to switch tabs
    if (files.length > 0) {
      setActiveTab("pptx");
    }
  };

  // Helper to process visual recognition on rasterized artifacts
  const processVisualRecognition = async (
    artifactIds: string[], 
    model: string
  ): Promise<{ successful: number; failed: number }> => {
    if (artifactIds.length === 0) return { successful: 0, failed: 0 };
    
    setCreatingMessage(`Applying Visual Recognition (${artifactIds.length} pages)...`);
    
    try {
      const response = await fetch(
        `https://obkzdksfayygnrzdqoam.supabase.co/functions/v1/visual-recognition`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ia3pka3NmYXl5Z25yemRxb2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MTA4MzcsImV4cCI6MjA3ODk4NjgzN30.xOKphCiEilzPTo9EGHNJqAJfruM_bijI9PN3BQBF-z8`,
          },
          body: JSON.stringify({
            artifactIds,
            projectId,
            shareToken,
            model,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to process visual recognition");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result = { successful: 0, failed: 0 };

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'progress') {
                setCreatingMessage(`Visual Recognition: ${parsed.processed}/${parsed.total} pages...`);
              } else if (parsed.type === 'complete') {
                result = { successful: parsed.successful, failed: parsed.failed };
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

      return result;
    } catch (error) {
      console.error("Visual recognition error:", error);
      return { successful: 0, failed: artifactIds.length };
    }
  };

  const handleCreateArtifacts = async () => {
    if (totalCount === 0) return;

    setIsCreating(true);
    setCreatingMessage("Creating artifacts...");
    let successCount = 0;
    let errorCount = 0;
    
    // Track rasterized artifact IDs for visual recognition
    const pptxRasterizedIds: string[] = [];
    const pdfRasterizedIds: string[] = [];
    const docxRasterizedIds: string[] = [];

    try {
      // Create image artifacts
      for (const img of images.filter(i => i.selected)) {
        try {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string;
              const base64Data = result.split(',')[1];
              resolve(base64Data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(img.file);
          });

          const { data, error } = await supabase.functions.invoke("upload-artifact-image", {
            body: {
              projectId,
              shareToken,
              imageData: base64,
              fileName: img.file.name,
              content: `Image: ${img.file.name}`,
              sourceType: "upload",
            },
          });

          if (error) throw error;
          // Broadcast after successful image upload since edge function creates artifact directly
          broadcastRefresh('insert', data?.artifact?.id);
          successCount++;
        } catch (err) {
          console.error("Failed to create image artifact:", err);
          errorCount++;
        }
      }

      // Create Excel artifact(s)
      if (excelRowsCount > 0 && excelData) {
        if (excelMergeAsOne) {
          // Single merged artifact
          try {
            const content = formatExcelDataAsJson(excelData.sheets, excelSelectedRows);
            await addArtifact(content, "excel");
            successCount++;
          } catch (err) {
            console.error("Failed to create Excel artifact:", err);
            errorCount++;
          }
        } else {
          // Separate artifacts per row
          for (const [sheetName, rowIndices] of excelSelectedRows.entries()) {
            const sheet = excelData.sheets.find(s => s.name === sheetName);
            if (!sheet) continue;
            
            for (const rowIndex of rowIndices) {
              try {
                const row = sheet.rows[rowIndex];
                const rowData: Record<string, string> = {};
                sheet.headers.forEach((header, idx) => {
                  rowData[header || `Column ${idx + 1}`] = row[idx] || "";
                });
                
                const content = JSON.stringify({
                  sheet: sheetName,
                  row: rowIndex + 1,
                  data: rowData
                }, null, 2);
                
                await addArtifact(content, "excel-row");
                successCount++;
              } catch (err) {
                console.error("Failed to create Excel row artifact:", err);
                errorCount++;
              }
            }
          }
        }
      }

      // Create text file artifacts
      for (const file of textFiles.filter(f => f.selected)) {
        try {
          await addArtifact(file.content, file.file.name.split('.').pop() || "text");
          successCount++;
        } catch (err) {
          console.error("Failed to create text artifact:", err);
          errorCount++;
        }
      }

      // Create manual entry artifact
      if (manualContent.trim()) {
        try {
          await addArtifact(manualContent.trim(), "manual");
          successCount++;
        } catch (err) {
          console.error("Failed to create manual artifact:", err);
          errorCount++;
        }
      }

      // Create PPTX artifacts
      if (pptxData && pptxExportOptions.selectedSlides.size > 0) {
        const selectedSlideIndices = Array.from(pptxExportOptions.selectedSlides).sort((a, b) => a - b);
        const selectedSlides = selectedSlideIndices.map((idx) => pptxData.slides[idx]).filter(Boolean);
        const totalSlides = pptxData.slides.length;
        const provenanceId = generateProvenanceId(pptxData.filename);

        // Text extraction
        if (pptxExportOptions.mode === "text" || pptxExportOptions.mode === "both") {
          if (pptxExportOptions.mergeText) {
            // Single merged text artifact
            try {
              const mergedText = selectedSlides
                .map((slide, i) => {
                  const slideHeader = `--- Slide ${slide.index + 1}${slide.title ? `: ${slide.title}` : ""} ---`;
                  return `${slideHeader}\n${slide.mergedText}`;
                })
                .join("\n\n");
              await addArtifact(mergedText, "pptx-text");
              successCount++;
            } catch (err) {
              console.error("Failed to create merged PPTX text artifact:", err);
              errorCount++;
            }
          } else {
            // Separate text artifact per slide
            for (const slide of selectedSlides) {
              try {
                const slideContent = `# Slide ${slide.index + 1}${slide.title ? `: ${slide.title}` : ""}\n\n${slide.mergedText}`;
                await addArtifact(slideContent, "pptx-slide-text");
                successCount++;
              } catch (err) {
                console.error(`Failed to create text artifact for slide ${slide.index + 1}:`, err);
                errorCount++;
              }
            }
          }
        }

        // Rasterize slides - REVERSED for correct display order
        if (pptxExportOptions.mode === "rasterize" || pptxExportOptions.mode === "both") {
          const reversedSlides = [...selectedSlides].reverse();
          for (const slide of reversedSlides) {
            try {
              const blob = await rasterizeSlide(slide, pptxData.media, {
                width: 1920,
                height: 1080,
                pixelRatio: 1,
              });

              // Convert blob to base64
              const reader = new FileReader();
              const base64 = await new Promise<string>((resolve, reject) => {
                reader.onload = () => {
                  const result = reader.result as string;
                  const base64Data = result.split(",")[1];
                  resolve(base64Data);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });

              const { data, error } = await supabase.functions.invoke("upload-artifact-image", {
                body: {
                  projectId,
                  shareToken,
                  imageData: base64,
                  fileName: `${pptxData.filename.replace(/\.pptx?$/i, "")}_slide${slide.index + 1}.png`,
                  content: `Slide ${slide.index + 1}${slide.title ? `: ${slide.title}` : ""}\n\n${slide.mergedText}`,
                  sourceType: "pptx-rasterized",
                  title: `${pptxData.filename} - Slide ${slide.index + 1}`,
                  provenanceId,
                  provenancePath: pptxData.filename,
                  provenancePage: slide.index + 1,
                  provenanceTotalPages: totalSlides,
                },
              });

              if (error) throw error;
              // Track for visual recognition
              if (data?.artifact?.id) {
                pptxRasterizedIds.push(data.artifact.id);
              }
              broadcastRefresh("insert", data?.artifact?.id);
              successCount++;
            } catch (err) {
              console.error(`Failed to rasterize slide ${slide.index + 1}:`, err);
              errorCount++;
            }
          }
        }

        // Extract selected embedded images
        if (pptxExportOptions.extractImages && pptxExportOptions.selectedImages) {
          for (const imageId of pptxExportOptions.selectedImages) {
            const img = pptxData.media.get(imageId);
            if (!img) continue;

            try {
              const { data, error } = await supabase.functions.invoke("upload-artifact-image", {
                body: {
                  projectId,
                  shareToken,
                  imageData: img.base64,
                  fileName: img.filename,
                  content: `Embedded image from ${pptxData.filename}: ${img.filename}`,
                  sourceType: "pptx-image",
                },
              });

              if (error) throw error;
              broadcastRefresh("insert", data?.artifact?.id);
              successCount++;
            } catch (err) {
              console.error(`Failed to create artifact for image ${img.filename}:`, err);
              errorCount++;
            }
          }
        }
      }

      // Create PDF artifacts
      if (pdfData && pdfExportOptions.selectedPages.size > 0) {
        const selectedPageIndices = Array.from(pdfExportOptions.selectedPages).sort((a, b) => a - b);
        const totalPages = pdfData.pageCount;
        const provenanceId = generateProvenanceId(pdfData.filename);

        // Text extraction
        if (pdfExportOptions.mode === "text" || pdfExportOptions.mode === "both") {
          if (pdfExportOptions.mergeText) {
            // Single merged text artifact
            try {
              const mergedText = selectedPageIndices
                .map((pageIdx) => {
                  const pageText = pdfData.pagesText[pageIdx] || "";
                  return `--- Page ${pageIdx + 1} ---\n${pageText}`;
                })
                .join("\n\n");
              await addArtifact(mergedText, "pdf-text");
              successCount++;
            } catch (err) {
              console.error("Failed to create merged PDF text artifact:", err);
              errorCount++;
            }
          } else {
            // Separate text artifact per page
            for (const pageIdx of selectedPageIndices) {
              try {
                const pageText = pdfData.pagesText[pageIdx] || "";
                const pageContent = `# Page ${pageIdx + 1}\n\n${pageText}`;
                await addArtifact(pageContent, "pdf-page-text");
                successCount++;
              } catch (err) {
                console.error(`Failed to create text artifact for page ${pageIdx + 1}:`, err);
                errorCount++;
              }
            }
          }
        }

        // Rasterize pages - REVERSED for correct display order
        if (pdfExportOptions.mode === "rasterize" || pdfExportOptions.mode === "both") {
          try {
            // Rasterize all selected pages at high resolution
            const rasterizedPages = await rasterizeSelectedPages(
              pdfData.arrayBuffer,
              selectedPageIndices,
              2.5 // High resolution for export
            );

            // Reverse the array for correct insertion order
            const reversedPages = [...rasterizedPages].reverse();
            
            for (const result of reversedPages) {
              if (!result.success || !result.dataUrl) {
                console.error(`Failed to rasterize page ${result.pageNumber}:`, result.error);
                errorCount++;
                continue;
              }

              try {
                // Extract base64 from data URL
                const base64Data = result.dataUrl.split(",")[1];

                const { data, error } = await supabase.functions.invoke("upload-artifact-image", {
                  body: {
                    projectId,
                    shareToken,
                    imageData: base64Data,
                    fileName: `${pdfData.filename.replace(/\.pdf$/i, "")}_page${result.pageNumber}.png`,
                    content: `Page ${result.pageNumber}\n\n${pdfData.pagesText[result.pageIndex] || ""}`,
                    sourceType: "pdf-rasterized",
                    title: `${pdfData.filename} - Page ${result.pageNumber}`,
                    provenanceId,
                    provenancePath: pdfData.filename,
                    provenancePage: result.pageNumber,
                    provenanceTotalPages: totalPages,
                  },
                });

                if (error) throw error;
                // Track for visual recognition
                if (data?.artifact?.id) {
                  pdfRasterizedIds.push(data.artifact.id);
                }
                broadcastRefresh("insert", data?.artifact?.id);
                successCount++;
              } catch (err) {
                console.error(`Failed to upload rasterized page ${result.pageNumber}:`, err);
                errorCount++;
              }
            }
          } catch (err) {
            console.error("Failed to rasterize PDF pages:", err);
            errorCount++;
          }
        }

        // Extract selected embedded images
        if (pdfExportOptions.extractImages && pdfExportOptions.selectedImages) {
          for (const imageId of pdfExportOptions.selectedImages) {
            const img = pdfData.embeddedImages.get(imageId);
            if (!img) continue;

            try {
              // Extract base64 from data URL
              const base64Data = img.dataUrl.split(",")[1];

              const { data, error } = await supabase.functions.invoke("upload-artifact-image", {
                body: {
                  projectId,
                  shareToken,
                  imageData: base64Data,
                  fileName: `${pdfData.filename.replace(/\.pdf$/i, "")}_image_${imageId}.png`,
                  content: `Embedded image from ${pdfData.filename} (Page ${img.pageIndex + 1})`,
                  sourceType: "pdf-image",
                },
              });

              if (error) throw error;
              broadcastRefresh("insert", data?.artifact?.id);
              successCount++;
            } catch (err) {
              console.error(`Failed to create artifact for PDF image ${imageId}:`, err);
              errorCount++;
            }
          }
        }
      }

      // Create DOCX artifacts
      if (docxData) {
        const totalPages = docxExportOptions.rasterizedPageCount || 1;
        const provenanceId = generateProvenanceId(docxData.filename);

        // Text extraction
        if (docxExportOptions.mode === "text" || docxExportOptions.mode === "both") {
          try {
            const textContent = getTextContent(docxData, docxExportOptions.outputFormat);
            const sourceType = docxExportOptions.outputFormat === "markdown" ? "docx-markdown" :
                               docxExportOptions.outputFormat === "html" ? "docx-html" : "docx-text";
            await addArtifact(textContent, sourceType);
            successCount++;
          } catch (err) {
            console.error("Failed to create DOCX text artifact:", err);
            errorCount++;
          }
        }

        // Rasterize document (only selected pages) - REVERSED for correct display order
        if (docxExportOptions.mode === "rasterize" || docxExportOptions.mode === "both") {
          if (docxExportOptions.selectedRasterPages.size > 0) {
            try {
              // Get sorted array of selected page indices
              const selectedIndices = Array.from(docxExportOptions.selectedRasterPages).sort((a, b) => a - b);
              
              let pages: string[];
              
              // Use cached pages if available (from preview), otherwise rasterize
              if (docxExportOptions.cachedRasterizedPages?.length) {
                // Extract only selected pages from cache
                pages = selectedIndices
                  .map(idx => docxExportOptions.cachedRasterizedPages![idx])
                  .filter(Boolean);
              } else {
                // No cache available, need to rasterize
                pages = await rasterizeDocx(docxData.arrayBuffer, { 
                  width: 816, 
                  scale: 2,
                  selectedPages: selectedIndices
                });
              }
              
              // Create array with original indices for provenance, then reverse for correct display order
              const pagesWithIndices = pages.map((page, i) => ({
                page,
                originalIndex: selectedIndices[i]
              })).reverse();
              
              for (const { page, originalIndex } of pagesWithIndices) {
                const dataUrl = page;
                const base64Data = dataUrl.split(",")[1];

                const { data, error } = await supabase.functions.invoke("upload-artifact-image", {
                  body: {
                    projectId,
                    shareToken,
                    imageData: base64Data,
                    fileName: `${docxData.filename.replace(/\.docx?$/i, "")}_page${originalIndex + 1}.png`,
                    content: `Page ${originalIndex + 1} of ${docxData.filename}`,
                    sourceType: "docx-rasterized",
                    title: `${docxData.filename} - Page ${originalIndex + 1}`,
                    provenanceId,
                    provenancePath: docxData.filename,
                    provenancePage: originalIndex + 1,
                    provenanceTotalPages: totalPages,
                  },
                });

                if (error) throw error;
                // Track for visual recognition
                if (data?.artifact?.id) {
                  docxRasterizedIds.push(data.artifact.id);
                }
                broadcastRefresh("insert", data?.artifact?.id);
                successCount++;
              }
            } catch (err) {
              console.error("Failed to rasterize DOCX:", err);
              errorCount++;
            }
          }
        }

        // Extract selected embedded images
        if (docxExportOptions.extractImages && docxExportOptions.selectedImages.size > 0) {
          for (const imageId of docxExportOptions.selectedImages) {
            const img = docxData.embeddedImages.get(imageId);
            if (!img) continue;

            try {
              const { data, error } = await supabase.functions.invoke("upload-artifact-image", {
                body: {
                  projectId,
                  shareToken,
                  imageData: img.base64,
                  fileName: `${docxData.filename.replace(/\.docx?$/i, "")}_${img.filename}`,
                  content: `Embedded image from ${docxData.filename}: ${img.filename}`,
                  sourceType: "docx-image",
                },
              });

              if (error) throw error;
              broadcastRefresh("insert", data?.artifact?.id);
              successCount++;
            } catch (err) {
              console.error(`Failed to create artifact for DOCX image ${img.filename}:`, err);
              errorCount++;
            }
          }
        }
      }

      // Apply Visual Recognition if enabled for any rasterized artifacts
      let vrSuccessCount = 0;
      let vrErrorCount = 0;

      // PPTX Visual Recognition
      if (pptxExportOptions.visualRecognition && pptxRasterizedIds.length > 0) {
        const vrResult = await processVisualRecognition(
          pptxRasterizedIds, 
          pptxExportOptions.visualRecognitionModel || 'gemini-2.5-flash'
        );
        vrSuccessCount += vrResult.successful;
        vrErrorCount += vrResult.failed;
      }

      // PDF Visual Recognition
      if (pdfExportOptions.visualRecognition && pdfRasterizedIds.length > 0) {
        const vrResult = await processVisualRecognition(
          pdfRasterizedIds, 
          pdfExportOptions.visualRecognitionModel || 'gemini-2.5-flash'
        );
        vrSuccessCount += vrResult.successful;
        vrErrorCount += vrResult.failed;
      }

      // DOCX Visual Recognition
      if (docxExportOptions.visualRecognition && docxRasterizedIds.length > 0) {
        const vrResult = await processVisualRecognition(
          docxRasterizedIds, 
          docxExportOptions.visualRecognitionModel || 'gemini-2.5-flash'
        );
        vrSuccessCount += vrResult.successful;
        vrErrorCount += vrResult.failed;
      }

      setCreatingMessage("");

      if (successCount > 0) {
        let message = `Created ${successCount} artifact${successCount !== 1 ? 's' : ''}`;
        if (vrSuccessCount > 0) {
          message += ` (${vrSuccessCount} with OCR)`;
        }
        toast.success(message);
        onArtifactsCreated();
        resetState();
        onOpenChange(false);
      }

      if (errorCount > 0) {
        toast.error(`Failed to create ${errorCount} artifact${errorCount !== 1 ? 's' : ''}`);
      }
      if (vrErrorCount > 0) {
        toast.warning(`Visual recognition failed for ${vrErrorCount} artifact${vrErrorCount !== 1 ? 's' : ''}`);
      }
    } finally {
      setIsCreating(false);
      setCreatingMessage("");
    }
  };

  const resetState = () => {
    setImages([]);
    setExcelData(null);
    setExcelSelectedRows(new Map());
    setExcelMergeAsOne(true);
    setTextFiles([]);
    setManualContent("");
    setPptxData(null);
    setPptxExportOptions({
      mode: "text",
      mergeText: true,
      extractImages: true,
      selectedSlides: new Set(),
      selectedImages: new Set(),
    });
    setDocxData(null);
    setDocxExportOptions({
      mode: "text",
      outputFormat: "markdown",
      extractImages: true,
      selectedImages: new Set(),
      selectedRasterPages: new Set(),
      rasterizedPageCount: 0,
    });
    setPdfData(null);
    setPdfExportOptions({
      mode: "text",
      mergeText: true,
      extractImages: true,
      selectedPages: new Set(),
      selectedImages: new Set(),
    });
    setActiveTab("manual");
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const renderSidebarButton = (tab: typeof tabs[0], isComingSoon: boolean = false) => {
    const button = (
      <Button
        key={tab.id}
        variant={activeTab === tab.id ? "secondary" : "ghost"}
        className={cn(
          "w-full gap-2",
          sidebarCollapsed ? "justify-center px-2" : "justify-start",
          activeTab === tab.id && "bg-secondary"
        )}
        onClick={() => setActiveTab(tab.id)}
        disabled={tab.disabled}
      >
        {tab.icon}
        {!sidebarCollapsed && (
          <>
            <span className="flex-1 text-left truncate">{tab.label}</span>
            {(tab.count ?? 0) > 0 && (
              <Badge variant={isComingSoon ? "secondary" : "default"} className="h-5 px-1.5">
                {tab.count}
              </Badge>
            )}
          </>
        )}
        {sidebarCollapsed && (tab.count ?? 0) > 0 && (
          <Badge 
            variant={isComingSoon ? "secondary" : "default"} 
            className="absolute -top-1 -right-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center"
          >
            {tab.count}
          </Badge>
        )}
      </Button>
    );

    if (sidebarCollapsed) {
      return (
        <TooltipProvider key={tab.id}>
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right">
              <p>{tab.label}</p>
              {(tab.count ?? 0) > 0 && <p className="text-muted-foreground text-xs">{tab.count} selected</p>}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return button;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-4 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Add Artifacts</DialogTitle>
              <DialogDescription className="sr-only">
                Add artifacts to the project using various methods
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {totalCount > 0 && (
                <Badge variant="outline" className="text-sm">
                  {totalCount} item{totalCount !== 1 ? 's' : ''} selected
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar */}
          <div className={cn(
            "border-r flex flex-col shrink-0 transition-all duration-200",
            sidebarCollapsed ? "w-14" : "w-48"
          )}>
            <div className="p-2 border-b flex justify-end">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              >
                {sidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {tabs.map((tab) => renderSidebarButton(tab))}
              </div>
            </ScrollArea>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-4">
                {activeTab === "manual" && (
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      Enter text, markdown, or structured content manually.
                    </div>
                    <Textarea
                      ref={textareaRef}
                      placeholder="Enter artifact content..."
                      value={manualContent}
                      onChange={(e) => setManualContent(e.target.value)}
                      className="min-h-[300px] font-mono text-sm"
                    />
                  </div>
                )}

                {activeTab === "upload" && (
                  <ArtifactUniversalUpload
                    onImagesAdded={handleUniversalImagesAdded}
                    onExcelAdded={handleUniversalExcelAdded}
                    onTextFilesAdded={handleUniversalTextFilesAdded}
                    onDocxFilesAdded={handleUniversalDocxAdded}
                    onPdfFilesAdded={handleUniversalPdfAdded}
                    onPptxFilesAdded={handleUniversalPptxAdded}
                    counts={{
                      images: images.filter(i => i.selected).length,
                      excel: excelData ? Array.from(excelSelectedRows.values()).reduce((a, b) => a + b.size, 0) : 0,
                      textFiles: textFiles.filter(t => t.selected).length,
                      docx: docxData ? 1 : 0,
                      pdf: pdfData ? pdfExportOptions.selectedPages.size : 0,
                      pptx: pptxData ? pptxExportOptions.selectedSlides.size : 0,
                    }}
                  />
                )}

                {activeTab === "images" && (
                  <ArtifactImageGallery
                    images={images}
                    onImagesChange={setImages}
                  />
                )}

                {activeTab === "excel" && (
                  <ArtifactExcelViewer
                    excelData={excelData}
                    onExcelDataChange={setExcelData}
                    selectedRows={excelSelectedRows}
                    onSelectedRowsChange={setExcelSelectedRows}
                    mergeAsOne={excelMergeAsOne}
                    onMergeAsOneChange={setExcelMergeAsOne}
                  />
                )}

                {activeTab === "text" && (
                  <ArtifactTextFileList
                    files={textFiles}
                    onFilesChange={setTextFiles}
                  />
                )}

                {activeTab === "pptx" && (
                  <ArtifactPptxViewer
                    pptxData={pptxData}
                    onPptxDataChange={setPptxData}
                    exportOptions={pptxExportOptions}
                    onExportOptionsChange={setPptxExportOptions}
                  />
                )}

                {activeTab === "pdf" && (
                  <ArtifactPdfPlaceholder
                    pdfData={pdfData}
                    onPdfDataChange={setPdfData}
                    exportOptions={pdfExportOptions}
                    onExportOptionsChange={setPdfExportOptions}
                  />
                )}

                {activeTab === "docx" && (
                  <ArtifactDocxViewer
                    docxData={docxData}
                    onDocxDataChange={setDocxData}
                    exportOptions={docxExportOptions}
                    onExportOptionsChange={setDocxExportOptions}
                  />
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <Separator />
            <div className="p-4 flex items-center justify-between gap-4 shrink-0 bg-background">
              <p className="text-sm text-muted-foreground">
                {totalCount === 0 
                  ? "Select content to add as artifacts" 
                  : `${totalCount} artifact${totalCount !== 1 ? 's' : ''} will be created`}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateArtifacts} 
                  disabled={totalCount === 0 || isCreating}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {creatingMessage || "Creating..."}
                    </>
                  ) : (
                    <>Add {totalCount > 0 ? totalCount : ''} Artifact{totalCount !== 1 ? 's' : ''}</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
