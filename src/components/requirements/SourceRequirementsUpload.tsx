import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X, Download, Eye, Edit2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdmin } from "@/contexts/AdminContext";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SourceRequirementsUploadProps {
  requirementId: string;
  requirementTitle: string;
  onUploadComplete?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SourceRequirementsUpload({
  requirementId,
  requirementTitle,
  onUploadComplete,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: SourceRequirementsUploadProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [activeTab, setActiveTab] = useState("files");
  const { isAdmin } = useAdmin();

  // Use external open state if provided, otherwise use internal state
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;

  useEffect(() => {
    if (open) {
      loadFiles();
    } else {
      // Reset state when closing
      setSelectedFile(null);
      setFileContent("");
      setIsEditing(false);
      setEditedContent("");
      setActiveTab("files");
    }
  }, [open, requirementId]);

  useEffect(() => {
    if (selectedFile) {
      loadFileContent(selectedFile);
      setActiveTab("preview");
    }
  }, [selectedFile]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    
    if (!isAdmin) {
      toast.error("Admin access required to upload files");
      return;
    }

    const file = e.target.files[0];
    setUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${requirementId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("requirement-sources")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("requirement-sources")
        .getPublicUrl(fileName);

      // Store file reference in metadata (we'd need a table for this)
      toast.success("File uploaded successfully");
      loadFiles();
      onUploadComplete?.();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload file");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const loadFiles = async () => {
    try {
      const { data, error } = await supabase.storage
        .from("requirement-sources")
        .list(requirementId);

      if (error) throw error;
      setFiles(data || []);
    } catch (error) {
      console.error("Error loading files:", error);
    }
  };

  const handleDownload = async (fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("requirement-sources")
        .download(`${requirementId}/${fileName}`);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Download error:", error);
      toast.error(error.message || "Failed to download file");
    }
  };

  const handleDelete = async (fileName: string) => {
    if (!isAdmin) {
      toast.error("Admin access required to delete files");
      return;
    }

    try {
      const { error } = await supabase.storage
        .from("requirement-sources")
        .remove([`${requirementId}/${fileName}`]);

      if (error) throw error;
      toast.success("File deleted");
      loadFiles();
      onUploadComplete?.();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast.error(error.message || "Failed to delete file");
    }
  };

  const loadFileContent = async (fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("requirement-sources")
        .download(`${requirementId}/${fileName}`);

      if (error) throw error;

      // Check if it's a text file
      const text = await data.text();
      setFileContent(text);
      setEditedContent(text);
    } catch (error: any) {
      console.error("Error loading file content:", error);
      setFileContent("Unable to preview this file type. Click download to view it.");
    }
  };

  const handleSaveContent = async () => {
    if (!selectedFile || !isAdmin) return;

    try {
      const blob = new Blob([editedContent], { type: "text/plain" });
      const file = new File([blob], selectedFile, { type: "text/plain" });

      const { error } = await supabase.storage
        .from("requirement-sources")
        .update(`${requirementId}/${selectedFile}`, file);

      if (error) throw error;

      setFileContent(editedContent);
      setIsEditing(false);
      toast.success("File updated successfully");
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error(error.message || "Failed to save file");
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={files.length > 0 ? `View ${files.length} attached ${files.length === 1 ? 'file' : 'files'}` : "Upload source requirements"}
      >
        <Upload className="h-3 w-3" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Source Requirements</DialogTitle>
            <DialogDescription>{requirementTitle}</DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="preview" disabled={!selectedFile}>
                Preview {selectedFile && `- ${selectedFile}`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="files" className="space-y-4">
              <div>
                <input
                  type="file"
                  onChange={handleUpload}
                  disabled={uploading || !isAdmin}
                  className="hidden"
                  id={`file-upload-${requirementId}`}
                  accept=".pdf,.doc,.docx,.txt,.md"
                />
                <label htmlFor={`file-upload-${requirementId}`}>
                  <Button
                    variant="outline"
                    disabled={uploading || !isAdmin}
                    className="w-full"
                    asChild
                  >
                    <span>
                      <Upload className="h-4 w-4 mr-2" />
                      {uploading ? "Uploading..." : "Upload Document"}
                    </span>
                  </Button>
                </label>
                {!isAdmin && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Admin access required to upload files
                  </p>
                )}
              </div>

              {files.length > 0 && (
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Uploaded Files</p>
                    {files.map((file) => (
                      <div
                        key={file.name}
                        className={`flex items-center gap-2 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${
                          selectedFile === file.name ? "bg-muted border-primary" : ""
                        }`}
                        onClick={() => setSelectedFile(file.name)}
                      >
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm flex-1 truncate">{file.name}</span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFile(file.name);
                            }}
                            title="Preview file"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(file.name);
                            }}
                            title="Download file"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(file.name);
                              }}
                              title="Delete file"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>

            <TabsContent value="preview" className="space-y-4">
              {selectedFile && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">{selectedFile}</h3>
                    <div className="flex gap-2">
                      {!isEditing && isAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsEditing(true)}
                        >
                          <Edit2 className="h-3 w-3 mr-2" />
                          Edit
                        </Button>
                      )}
                      {isEditing && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsEditing(false);
                              setEditedContent(fileContent);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button size="sm" onClick={handleSaveContent}>
                            <Save className="h-3 w-3 mr-2" />
                            Save
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <Textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      className="min-h-[400px] font-mono text-sm"
                    />
                  ) : (
                    <ScrollArea className="h-[400px] w-full border rounded-lg p-4">
                      <pre className="text-sm whitespace-pre-wrap font-mono">
                        {fileContent}
                      </pre>
                    </ScrollArea>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
