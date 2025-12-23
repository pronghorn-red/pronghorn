import { useState } from "react";
import { Upload, Sparkles, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BuildBookCoverUploadProps {
  currentUrl: string | null;
  onUrlChange: (url: string | null) => void;
}

export function BuildBookCoverUpload({ currentUrl, onUrlChange }: BuildBookCoverUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `build-book-covers/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("attachments")
        .getPublicUrl(fileName);

      onUrlChange(publicUrl);
      toast.success("Cover image uploaded");
    } catch (error: any) {
      toast.error("Failed to upload image: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerateImage = async () => {
    setIsGenerating(true);
    try {
      // This would integrate with your image generation edge function
      // For now, we'll show a placeholder message
      toast.info("AI image generation coming soon!");
    } catch (error: any) {
      toast.error("Failed to generate image: " + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemove = () => {
    onUrlChange(null);
  };

  return (
    <div className="space-y-3">
      {currentUrl ? (
        <div className="relative rounded-lg overflow-hidden border">
          <img
            src={currentUrl}
            alt="Cover preview"
            className="w-full aspect-[16/9] object-cover"
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-8 w-8"
            onClick={handleRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-4 bg-muted/30">
          <ImageIcon className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">
            Upload an image or generate one with AI
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="file"
          id="cover-upload"
          className="hidden"
          accept="image/*"
          onChange={handleFileUpload}
        />
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => document.getElementById("cover-upload")?.click()}
          disabled={isUploading}
        >
          <Upload className="h-4 w-4 mr-2" />
          {isUploading ? "Uploading..." : "Upload Image"}
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleGenerateImage}
          disabled={isGenerating}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {isGenerating ? "Generating..." : "Generate with AI"}
        </Button>
      </div>
    </div>
  );
}
