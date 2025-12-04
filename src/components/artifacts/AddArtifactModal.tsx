import React, { useState, useRef, useEffect } from "react";
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
  Image, FileSpreadsheet, FileText, PenLine, FileIcon, 
  Presentation, Loader2, Upload 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ArtifactImageGallery, ImageFile } from "./ArtifactImageGallery";
import { ArtifactTextFileList, TextFile } from "./ArtifactTextFileList";
import { ArtifactExcelViewer } from "./ArtifactExcelViewer";
import { ArtifactDocxPlaceholder } from "./ArtifactDocxPlaceholder";
import { ArtifactPdfPlaceholder } from "./ArtifactPdfPlaceholder";
import { ArtifactPptxPlaceholder } from "./ArtifactPptxPlaceholder";
import { ArtifactUniversalUpload } from "./ArtifactUniversalUpload";
import { ExcelData, formatExcelDataAsJson, parseExcelFile } from "@/utils/parseExcel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type TabType = "manual" | "upload" | "images" | "excel" | "text" | "docx" | "pdf" | "pptx";

interface AddArtifactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  shareToken: string | null;
  onArtifactsCreated: () => void;
}

export function AddArtifactModal({
  open,
  onOpenChange,
  projectId,
  shareToken,
  onArtifactsCreated,
}: AddArtifactModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("manual");
  const [isCreating, setIsCreating] = useState(false);
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

  // Phase 2 file states
  const [docxFiles, setDocxFiles] = useState<File[]>([]);
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [pptxFiles, setPptxFiles] = useState<File[]>([]);

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

  const getTotalCount = () => {
    let count = 0;
    count += selectedImagesCount;
    count += selectedTextFilesCount;
    // Excel count depends on merge setting
    if (excelRowsCount > 0) {
      count += excelMergeAsOne ? 1 : excelRowsCount;
    }
    if (manualContent.trim()) count += 1;
    // Phase 2 files not yet processable
    return count;
  };

  const totalCount = getTotalCount();

  const tabs: { id: TabType; label: string; icon: React.ReactNode; count?: number; disabled?: boolean }[] = [
    { id: "manual", label: "Manual Entry", icon: <PenLine className="h-4 w-4" />, count: manualContent.trim() ? 1 : 0 },
    { id: "upload", label: "Upload", icon: <Upload className="h-4 w-4" /> },
    { id: "images", label: "Images", icon: <Image className="h-4 w-4" />, count: selectedImagesCount },
    { id: "excel", label: "Excel", icon: <FileSpreadsheet className="h-4 w-4" />, count: excelRowsCount > 0 ? (excelMergeAsOne ? 1 : excelRowsCount) : 0 },
    { id: "text", label: "Text Files", icon: <FileText className="h-4 w-4" />, count: selectedTextFilesCount },
    { id: "docx", label: "Word", icon: <FileText className="h-4 w-4" />, count: docxFiles.length },
    { id: "pdf", label: "PDF", icon: <FileIcon className="h-4 w-4" />, count: pdfFiles.length },
    { id: "pptx", label: "PowerPoint", icon: <Presentation className="h-4 w-4" />, count: pptxFiles.length },
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
    setDocxFiles(prev => [...prev, ...files]);
  };

  const handleUniversalPdfAdded = (files: File[]) => {
    setPdfFiles(prev => [...prev, ...files]);
  };

  const handleUniversalPptxAdded = (files: File[]) => {
    setPptxFiles(prev => [...prev, ...files]);
  };

  const handleCreateArtifacts = async () => {
    if (totalCount === 0) return;

    setIsCreating(true);
    let successCount = 0;
    let errorCount = 0;

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

          const { error } = await supabase.functions.invoke("upload-artifact-image", {
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
            const { error } = await supabase.rpc("insert_artifact_with_token", {
              p_project_id: projectId,
              p_token: shareToken || null,
              p_content: content,
              p_source_type: "excel",
            });
            if (error) throw error;
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
                
                const { error } = await supabase.rpc("insert_artifact_with_token", {
                  p_project_id: projectId,
                  p_token: shareToken || null,
                  p_content: content,
                  p_source_type: "excel-row",
                });
                if (error) throw error;
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
          const { error } = await supabase.rpc("insert_artifact_with_token", {
            p_project_id: projectId,
            p_token: shareToken || null,
            p_content: file.content,
            p_source_type: file.file.name.split('.').pop() || "text",
          });
          if (error) throw error;
          successCount++;
        } catch (err) {
          console.error("Failed to create text artifact:", err);
          errorCount++;
        }
      }

      // Create manual entry artifact
      if (manualContent.trim()) {
        try {
          const { error } = await supabase.rpc("insert_artifact_with_token", {
            p_project_id: projectId,
            p_token: shareToken || null,
            p_content: manualContent.trim(),
            p_source_type: "manual",
          });
          if (error) throw error;
          successCount++;
        } catch (err) {
          console.error("Failed to create manual artifact:", err);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Created ${successCount} artifact${successCount !== 1 ? 's' : ''}`);
        onArtifactsCreated();
        resetState();
        onOpenChange(false);
      }

      if (errorCount > 0) {
        toast.error(`Failed to create ${errorCount} artifact${errorCount !== 1 ? 's' : ''}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const resetState = () => {
    setImages([]);
    setExcelData(null);
    setExcelSelectedRows(new Map());
    setExcelMergeAsOne(true);
    setTextFiles([]);
    setManualContent("");
    setDocxFiles([]);
    setPdfFiles([]);
    setPptxFiles([]);
    setActiveTab("manual");
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] md:max-w-[90vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle>Add New Artifacts</DialogTitle>
          <DialogDescription>
            Create reusable knowledge blocks from various file types
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar */}
          <div className="w-48 border-r bg-muted/30 flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {tabs.slice(0, 5).map(tab => (
                  <Button
                    key={tab.id}
                    variant={activeTab === tab.id ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start gap-2",
                      activeTab === tab.id && "bg-secondary"
                    )}
                    onClick={() => setActiveTab(tab.id)}
                    disabled={tab.disabled}
                  >
                    {tab.icon}
                    <span className="flex-1 text-left">{tab.label}</span>
                    {(tab.count ?? 0) > 0 && (
                      <Badge variant="default" className="h-5 px-1.5">
                        {tab.count}
                      </Badge>
                    )}
                  </Button>
                ))}

                <Separator className="my-2" />
                
                <div className="px-2 py-1 text-xs text-muted-foreground font-medium">
                  Coming Soon
                </div>

                {tabs.slice(5).map(tab => (
                  <Button
                    key={tab.id}
                    variant={activeTab === tab.id ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start gap-2",
                      activeTab === tab.id && "bg-secondary"
                    )}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.icon}
                    <span className="flex-1 text-left">{tab.label}</span>
                    {(tab.count ?? 0) > 0 && (
                      <Badge variant="secondary" className="h-5 px-1.5">
                        {tab.count}
                      </Badge>
                    )}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 p-4 overflow-hidden flex flex-col">
              {activeTab === "manual" && (
                <div className="h-full flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground">
                    Enter or paste content manually to create an artifact.
                  </p>
                  <Textarea
                    ref={textareaRef}
                    value={manualContent}
                    onChange={(e) => setManualContent(e.target.value)}
                    placeholder="Enter artifact content..."
                    className="flex-1 min-h-[300px] font-mono text-sm"
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
                    images: images.length,
                    excel: excelData ? 1 : 0,
                    textFiles: textFiles.length,
                    docx: docxFiles.length,
                    pdf: pdfFiles.length,
                    pptx: pptxFiles.length,
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
              {activeTab === "docx" && (
                <ArtifactDocxPlaceholder
                  files={docxFiles}
                  onFilesChange={setDocxFiles}
                />
              )}
              {activeTab === "pdf" && (
                <ArtifactPdfPlaceholder
                  files={pdfFiles}
                  onFilesChange={setPdfFiles}
                />
              )}
              {activeTab === "pptx" && (
                <ArtifactPptxPlaceholder
                  files={pptxFiles}
                  onFilesChange={setPptxFiles}
                />
              )}
            </div>

            {/* Footer */}
            <div className="border-t p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {totalCount === 0 ? (
                    "No items ready to create"
                  ) : (
                    <>
                      Ready to create: {" "}
                      {selectedImagesCount > 0 && `${selectedImagesCount} image${selectedImagesCount !== 1 ? 's' : ''}`}
                      {selectedImagesCount > 0 && (excelRowsCount > 0 || selectedTextFilesCount > 0 || manualContent.trim()) && ", "}
                      {excelRowsCount > 0 && (excelMergeAsOne ? `1 excel (${excelRowsCount} rows)` : `${excelRowsCount} excel rows`)}
                      {excelRowsCount > 0 && (selectedTextFilesCount > 0 || manualContent.trim()) && ", "}
                      {selectedTextFilesCount > 0 && `${selectedTextFilesCount} text file${selectedTextFilesCount !== 1 ? 's' : ''}`}
                      {selectedTextFilesCount > 0 && manualContent.trim() && ", "}
                      {manualContent.trim() && "1 manual entry"}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={handleCreateArtifacts}
                    disabled={totalCount === 0 || isCreating}
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      `Create ${totalCount} Artifact${totalCount !== 1 ? 's' : ''}`
                    )}
                  </Button>
                  <Button variant="outline" onClick={handleClose}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}