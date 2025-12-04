import React, { useState } from "react";
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
  Presentation, Loader2 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ArtifactImageGallery, ImageFile } from "./ArtifactImageGallery";
import { ArtifactTextFileList, TextFile } from "./ArtifactTextFileList";
import { ArtifactExcelViewer } from "./ArtifactExcelViewer";
import { ArtifactDocxPlaceholder } from "./ArtifactDocxPlaceholder";
import { ArtifactPdfPlaceholder } from "./ArtifactPdfPlaceholder";
import { ArtifactPptxPlaceholder } from "./ArtifactPptxPlaceholder";
import { ExcelData, formatExcelDataAsJson } from "@/utils/parseExcel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type TabType = "images" | "excel" | "text" | "manual" | "docx" | "pdf" | "pptx";

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
  const [activeTab, setActiveTab] = useState<TabType>("images");
  const [isCreating, setIsCreating] = useState(false);

  // Image state
  const [images, setImages] = useState<ImageFile[]>([]);

  // Excel state
  const [excelData, setExcelData] = useState<ExcelData | null>(null);
  const [excelSelectedRows, setExcelSelectedRows] = useState<Map<string, Set<number>>>(new Map());

  // Text files state
  const [textFiles, setTextFiles] = useState<TextFile[]>([]);

  // Manual entry state
  const [manualContent, setManualContent] = useState("");

  const selectedImagesCount = images.filter(i => i.selected).length;
  const selectedTextFilesCount = textFiles.filter(f => f.selected).length;
  const excelRowsCount = Array.from(excelSelectedRows.values()).reduce((sum, set) => sum + set.size, 0);

  const getTotalCount = () => {
    let count = 0;
    count += selectedImagesCount;
    count += selectedTextFilesCount;
    if (excelRowsCount > 0) count += 1; // Excel becomes one artifact
    if (manualContent.trim()) count += 1;
    return count;
  };

  const totalCount = getTotalCount();

  const tabs: { id: TabType; label: string; icon: React.ReactNode; count?: number; disabled?: boolean }[] = [
    { id: "images", label: "Images", icon: <Image className="h-4 w-4" />, count: selectedImagesCount },
    { id: "excel", label: "Excel", icon: <FileSpreadsheet className="h-4 w-4" />, count: excelRowsCount > 0 ? 1 : 0 },
    { id: "text", label: "Text Files", icon: <FileText className="h-4 w-4" />, count: selectedTextFilesCount },
    { id: "manual", label: "Manual Entry", icon: <PenLine className="h-4 w-4" />, count: manualContent.trim() ? 1 : 0 },
    { id: "docx", label: "Word", icon: <FileText className="h-4 w-4" />, disabled: true },
    { id: "pdf", label: "PDF", icon: <FileIcon className="h-4 w-4" />, disabled: true },
    { id: "pptx", label: "PowerPoint", icon: <Presentation className="h-4 w-4" />, disabled: true },
  ];

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

      // Create Excel artifact
      if (excelRowsCount > 0 && excelData) {
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
    setTextFiles([]);
    setManualContent("");
    setActiveTab("images");
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
                {tabs.slice(0, 4).map(tab => (
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
                  Phase 2
                </div>

                {tabs.slice(4).map(tab => (
                  <Button
                    key={tab.id}
                    variant={activeTab === tab.id ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start gap-2 opacity-60",
                      activeTab === tab.id && "bg-secondary"
                    )}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.icon}
                    <span className="flex-1 text-left">{tab.label}</span>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 p-4 overflow-hidden">
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
                />
              )}
              {activeTab === "text" && (
                <ArtifactTextFileList
                  files={textFiles}
                  onFilesChange={setTextFiles}
                />
              )}
              {activeTab === "manual" && (
                <div className="h-full flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground">
                    Enter or paste content manually to create an artifact.
                  </p>
                  <Textarea
                    value={manualContent}
                    onChange={(e) => setManualContent(e.target.value)}
                    placeholder="Enter artifact content..."
                    className="flex-1 min-h-[300px] font-mono text-sm"
                  />
                </div>
              )}
              {activeTab === "docx" && <ArtifactDocxPlaceholder />}
              {activeTab === "pdf" && <ArtifactPdfPlaceholder />}
              {activeTab === "pptx" && <ArtifactPptxPlaceholder />}
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
                      {excelRowsCount > 0 && `1 excel (${excelRowsCount} rows)`}
                      {excelRowsCount > 0 && (selectedTextFilesCount > 0 || manualContent.trim()) && ", "}
                      {selectedTextFilesCount > 0 && `${selectedTextFilesCount} text file${selectedTextFilesCount !== 1 ? 's' : ''}`}
                      {selectedTextFilesCount > 0 && manualContent.trim() && ", "}
                      {manualContent.trim() && "1 manual entry"}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
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
                        Creating...
                      </>
                    ) : (
                      `Create ${totalCount} Artifact${totalCount !== 1 ? 's' : ''}`
                    )}
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
