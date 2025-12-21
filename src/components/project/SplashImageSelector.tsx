import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, ImageIcon, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Artifact {
  id: string;
  content: string;
  ai_title: string | null;
  image_url: string | null;
}

interface SplashImageSelectorProps {
  projectId: string;
  shareToken: string | null;
  currentImageUrl: string | null;
  artifacts: Artifact[];
  onImageSelect: (url: string | null) => void;
}

export function SplashImageSelector({
  projectId,
  shareToken,
  currentImageUrl,
  artifacts,
  onImageSelect,
}: SplashImageSelectorProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter artifacts to only show those with image_url
  const imageArtifacts = artifacts.filter((a) => a.image_url);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setIsUploading(true);

    try {
      // Upload to storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${projectId}/splash-${Date.now()}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("project-images")
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        // If bucket doesn't exist, create it
        if (uploadError.message.includes("not found")) {
          toast.error("Storage bucket not configured. Please contact support.");
          return;
        }
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("project-images")
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;
      setPreviewUrl(publicUrl);
      onImageSelect(publicUrl);
      toast.success("Image uploaded successfully");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload image");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleArtifactSelect = (imageUrl: string) => {
    setPreviewUrl(imageUrl);
    onImageSelect(imageUrl);
  };

  const handleClear = () => {
    setPreviewUrl(null);
    onImageSelect(null);
  };

  return (
    <div className="space-y-4">
      {/* Preview */}
      {previewUrl && (
        <div className="relative rounded-lg overflow-hidden border border-border">
          <img
            src={previewUrl}
            alt="Project cover"
            className="w-full h-48 object-cover"
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="artifacts" className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            From Artifacts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Choose Image
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Max 5MB. Recommended: 1200x630px for best display
          </p>
        </TabsContent>

        <TabsContent value="artifacts">
          {imageArtifacts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No image artifacts found</p>
              <p className="text-xs mt-1">
                Upload images to Artifacts to use them here
              </p>
            </div>
          ) : (
            <ScrollArea className="h-48">
              <div className="grid grid-cols-3 gap-2 p-1">
                {imageArtifacts.map((artifact) => (
                  <button
                    key={artifact.id}
                    onClick={() => handleArtifactSelect(artifact.image_url!)}
                    className={cn(
                      "relative aspect-video rounded-md overflow-hidden border-2 transition-all hover:opacity-80",
                      previewUrl === artifact.image_url
                        ? "border-primary ring-2 ring-primary/20"
                        : "border-border"
                    )}
                  >
                    <img
                      src={artifact.image_url!}
                      alt={artifact.ai_title || "Artifact"}
                      className="w-full h-full object-cover"
                    />
                    {previewUrl === artifact.image_url && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <Check className="h-6 w-6 text-primary" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
