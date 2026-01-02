import { useState, useEffect } from "react";
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
import { Wand2, Loader2, Download, ImageIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const IMAGE_MODELS = [
  { id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image (Recommended)', description: 'Fast image generation' },
  { id: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview', description: 'Next-gen image generation' },
];

export const IMAGE_STYLES = [
  { id: 'photorealistic', label: 'Photorealistic', prompt: 'photorealistic, high detail, professional photography, realistic lighting' },
  { id: 'illustrated', label: 'Illustrated', prompt: 'digital illustration, clean vector art, modern design, artistic' },
  { id: 'abstract', label: 'Abstract', prompt: 'abstract art, geometric shapes, flowing colors, conceptual visualization' },
  { id: 'cartoon', label: 'Cartoon', prompt: 'cartoon style, bold outlines, vibrant colors, friendly illustration' },
  { id: 'whiteboard', label: 'Whiteboard', prompt: 'clean whiteboard sketch, hand-drawn diagram, simple lines, minimal color, business diagram' },
  { id: 'infographic', label: 'Infographic', prompt: 'infographic style, data visualization, clean icons, modern flat design' },
];

interface SlideImageGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImageGenerated: (imageUrl: string) => void;
  initialPrompt?: string;
  currentImageUrl?: string;
  projectContext?: string;
  imageStyle?: string;
  imageModel?: string;
}

export function SlideImageGenerator({
  open,
  onOpenChange,
  onImageGenerated,
  initialPrompt = "",
  currentImageUrl,
  projectContext,
  imageStyle = "photorealistic",
  imageModel = IMAGE_MODELS[0].id,
}: SlideImageGeneratorProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [selectedModel, setSelectedModel] = useState(imageModel);
  const [selectedStyle, setSelectedStyle] = useState(imageStyle);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  
  // Update prompt when dialog opens with new initial prompt
  useEffect(() => {
    if (open && initialPrompt) {
      setPrompt(initialPrompt);
    }
  }, [open, initialPrompt]);

  // Get the style prompt suffix
  const getStylePrompt = () => {
    const style = IMAGE_STYLES.find(s => s.id === selectedStyle);
    return style?.prompt || "";
  };

  const buildFullPrompt = () => {
    const stylePrompt = getStylePrompt();
    const contextPrefix = projectContext 
      ? `Context: This image is for a presentation about "${projectContext}". ` 
      : "";
    
    return `${contextPrefix}Professional presentation slide visual: ${prompt}. Style: ${stylePrompt}. 16:9 aspect ratio, clean, modern, high quality.`;
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    setIsGenerating(true);
    setGeneratedImage(null);

    try {
      const fullPrompt = buildFullPrompt();
      console.log("Generating image with prompt:", fullPrompt);
      
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
            prompt: fullPrompt,
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

  const handleClose = () => {
    onOpenChange(false);
    setGeneratedImage(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100%-50px)] h-[calc(100vh-50px)] max-w-none max-h-none flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Generate Slide Image
          </DialogTitle>
          <DialogDescription>
            Create an AI-generated image for this slide
            {projectContext && (
              <span className="block mt-1 text-xs text-primary">
                <Sparkles className="inline h-3 w-3 mr-1" />
                Using project context for relevant imagery
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4 max-w-2xl mx-auto">
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

            {/* Model and Style selectors in a row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Style</Label>
                <Select value={selectedStyle} onValueChange={setSelectedStyle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMAGE_STYLES.map((style) => (
                      <SelectItem key={style.id} value={style.id}>
                        {style.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
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
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
          {generatedImage ? (
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
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>
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
