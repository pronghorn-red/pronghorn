import { useState, useEffect, useRef } from "react";
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
import { Wand2, Loader2, Download, ImageIcon, Sparkles, Upload, Trash2 } from "lucide-react";
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
  onImageDeleted?: () => void;
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
  onImageDeleted,
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
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      if (initialPrompt) {
        setPrompt(initialPrompt);
      }
      // Always reset style and model when dialog opens so they're interactive
      setSelectedStyle(imageStyle);
      setSelectedModel(imageModel);
      setGeneratedImage(null);
    }
  }, [open, initialPrompt, imageStyle, imageModel]);

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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be less than 10MB");
      return;
    }

    setIsUploading(true);
    try {
      // Convert to base64 data URL
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setGeneratedImage(dataUrl);
        setIsUploading(false);
        toast.success("Image uploaded successfully!");
      };
      reader.onerror = () => {
        toast.error("Failed to read image file");
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload image");
      setIsUploading(false);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeleteImage = () => {
    if (onImageDeleted) {
      onImageDeleted();
    }
    setGeneratedImage(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100%-50px)] max-w-5xl h-[calc(100vh-100px)] max-h-[700px] flex flex-col p-0 z-[100]">
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

        {/* Two-column layout: controls left, preview right */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 p-6 overflow-hidden">
          {/* Left column - Controls */}
          <div className="flex flex-col space-y-4 overflow-y-auto">
            {/* Prompt input */}
            <div className="space-y-2">
              <Label>Image Prompt</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image you want to generate..."
                className="min-h-[120px]"
              />
            </div>

            {/* Style selector */}
            <div className="space-y-2">
              <Label>Style</Label>
              <Select value={selectedStyle} onValueChange={setSelectedStyle}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  {IMAGE_STYLES.map((style) => (
                    <SelectItem key={style.id} value={style.id}>
                      {style.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Model selector */}
            <div className="space-y-2">
              <Label>Model</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  {IMAGE_MODELS.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Generate button for mobile - inline */}
            <div className="md:hidden pt-2">
              <Button 
                onClick={handleGenerate} 
                disabled={isGenerating || !prompt.trim()}
                className="w-full"
              >
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
            </div>
          </div>

          {/* Right column - Preview */}
          <div className="flex flex-col space-y-3 overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
              <Label>
                {generatedImage ? "New Image" : currentImageUrl ? "Current Image" : "Preview"}
              </Label>
              <div className="flex gap-2">
                {/* Hidden file input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                </Button>
                {currentImageUrl && onImageDeleted && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteImage}
                    title="Remove image"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-muted rounded-lg overflow-hidden border flex items-center justify-center">
              {(generatedImage || currentImageUrl) ? (
                <img
                  src={generatedImage || currentImageUrl}
                  alt={generatedImage ? "New image" : "Current slide image"}
                  className={`max-w-full max-h-full object-contain ${!generatedImage && currentImageUrl ? 'opacity-50' : ''}`}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-muted-foreground p-8">
                  <ImageIcon className="h-12 w-12 mb-3 opacity-50" />
                  <p className="text-sm text-center">Enter a prompt and generate,<br />or upload an image</p>
                </div>
              )}
            </div>
            {generatedImage && (
              <p className="text-xs text-muted-foreground text-center">
                Ready to use
              </p>
            )}
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
