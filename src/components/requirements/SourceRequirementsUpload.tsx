import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdmin } from "@/contexts/AdminContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SourceRequirementsUploadProps {
  requirementId: string;
  requirementTitle: string;
}

export function SourceRequirementsUpload({
  requirementId,
  requirementTitle,
}: SourceRequirementsUploadProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<any[]>([]);
  const { isAdmin } = useAdmin();

  useEffect(() => {
    if (open) {
      loadFiles();
    }
  }, [open, requirementId]);

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
        title="Upload source requirements"
      >
        <Upload className="h-3 w-3" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Source Requirements</DialogTitle>
            <DialogDescription>{requirementTitle}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <input
                type="file"
                onChange={handleUpload}
                disabled={uploading || !isAdmin}
                className="hidden"
                id={`file-upload-${requirementId}`}
                accept=".pdf,.doc,.docx,.txt"
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
              <div className="space-y-2">
                <p className="text-sm font-medium">Uploaded Files</p>
                {files.map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center gap-2 p-2 border rounded-lg"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm flex-1">{file.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
