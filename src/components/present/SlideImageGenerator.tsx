import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wand2, Loader2, Download, ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface SlideImageGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImageGenerated: (imageUrl: string) => void;
  initialPrompt?: string;
  currentImageUrl?: string;
}

const IMAGE_MODELS = [
  { id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image (Recommended)', description: 'Fast image generation' },
  { id: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview', description: 'Next-gen image generation' },
];

export function SlideImageGenerator({
  open,
  onOpenChange,
  onImageGenerated,
  initialPrompt = "",
  currentImageUrl,
}: SlideImageGeneratorProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [selectedModel, setSelectedModel] = useState(IMAGE_MODELS[0].id);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    setIsGenerating(true);
    setGeneratedImage(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enhance-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            images: [],
            prompt: `Professional presentation slide visual: ${prompt}. 16:9 aspect ratio, clean, modern, high quality.`,
            model: selectedModel,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate image");
      }

      const data = await response.json();
      setGeneratedImage(data.imageUrl);
      toast.success("Image generated successfully!");
    } catch (error) {
      console.error("Image generation error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate image");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUseImage = () => {
    if (generatedImage) {
      onImageGenerated(generatedImage);
      onOpenChange(false);
      setGeneratedImage(null);
      setPrompt("");
    }
  };

  const handleDownload = () => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `slide-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Generate Slide Image
          </DialogTitle>
          <DialogDescription>
            Create an AI-generated image for this slide
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current image preview */}
          {currentImageUrl && !generatedImage && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Current Image</Label>
              <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                <img
                  src={currentImageUrl}
                  alt="Current slide image"
                  className="w-full h-full object-cover opacity-50"
                />
              </div>
            </div>
          )}

          {/* Generated image preview */}
          {generatedImage && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Generated Image</Label>
              <div className="aspect-video bg-muted rounded-lg overflow-hidden border-2 border-primary">
                <img
                  src={generatedImage}
                  alt="Generated slide image"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}

          {/* Prompt input */}
          <div className="space-y-2">
            <Label>Image Prompt</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate..."
              className="min-h-[100px]"
            />
          </div>

          {/* Model selector */}
          <div className="space-y-2">
            <Label>Model</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_MODELS.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <div className="flex flex-col">
                      <span>{model.label}</span>
                      <span className="text-xs text-muted-foreground">{model.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {generatedImage && (
            <>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button variant="outline" onClick={() => setGeneratedImage(null)}>
                <ImageIcon className="h-4 w-4 mr-2" />
                Generate New
              </Button>
              <Button onClick={handleUseImage}>
                Use This Image
              </Button>
            </>
          )}
          {!generatedImage && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}>
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Generate
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
