import { useState } from "react";
import { Upload, Sparkles, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BuildBookCoverUploadProps {
  currentUrl: string | null;
  onUrlChange: (url: string | null) => void;
  bookName?: string;
  bookDescription?: string;
}

export function BuildBookCoverUpload({ 
  currentUrl, 
  onUrlChange, 
  bookName = "Build Book",
  bookDescription = "" 
}: BuildBookCoverUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");

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
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("build-book-covers")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("build-book-covers")
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
      // Build the prompt for cover image generation
      const basePrompt = `Create a professional, visually striking cover image for a technical build book titled "${bookName}".`;
      const descPrompt = bookDescription ? ` The book covers: ${bookDescription}.` : "";
      const stylePrompt = " Use a modern, clean design with abstract geometric shapes, subtle gradients, and professional typography. The image should be suitable as a book cover or documentation header. Aspect ratio 16:9.";
      const userPrompt = customPrompt ? ` Additional requirements: ${customPrompt}` : "";
      
      const fullPrompt = basePrompt + descPrompt + stylePrompt + userPrompt;

      const { data, error } = await supabase.functions.invoke("generate-image", {
        body: {
          selectedContent: {
            projectMetadata: {
              name: bookName,
              description: bookDescription,
            },
          },
          generationType: "infographic",
          style: "modern",
          customPrompt: fullPrompt,
        },
      });

      if (error) throw error;

      if (data.imageUrl) {
        // The response is a base64 data URL, we need to upload it to storage
        const base64Data = data.imageUrl.split(",")[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "image/png" });

        const fileName = `generated-${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage
          .from("build-book-covers")
          .upload(fileName, blob);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("build-book-covers")
          .getPublicUrl(fileName);

        onUrlChange(publicUrl);
        toast.success("Cover image generated and saved");
        setShowGenerateDialog(false);
        setCustomPrompt("");
      } else {
        throw new Error("No image generated");
      }
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
          onClick={() => setShowGenerateDialog(true)}
          disabled={isGenerating}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Generate with AI
        </Button>
      </div>

      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Cover Image</DialogTitle>
            <DialogDescription>
              AI will create a professional cover image based on your build book details.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Book Name</Label>
              <p className="text-sm text-muted-foreground">{bookName || "Untitled Build Book"}</p>
            </div>
            
            {bookDescription && (
              <div className="space-y-2">
                <Label>Description Preview</Label>
                <p className="text-sm text-muted-foreground line-clamp-3">{bookDescription}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="custom-prompt">Additional Instructions (optional)</Label>
              <Input
                id="custom-prompt"
                placeholder="e.g., Use blue color scheme, include cloud icons..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerateImage} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
