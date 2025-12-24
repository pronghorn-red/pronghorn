import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Wand2, Loader2, Download, RefreshCw, Sparkles, Eraser, Palette, Layers, Type, Grid2x2, Grid3x3, Square, RectangleHorizontal, RectangleVertical } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Artifact {
  id: string;
  content: string;
  ai_title?: string | null;
  image_url?: string | null;
  provenance_id?: string | null;
  provenance_page?: number | null;
  provenance_total_pages?: number | null;
}

interface EnhanceImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifacts: Artifact[];
  projectId: string;
  shareToken: string | null;
  onComplete: () => void;
}

type OutputMode = 'add' | 'replace';
type AspectRatio = '1:1' | '16:9' | '9:16' | '4:5';

const ASPECT_RATIO_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1344, height: 768 },
  '9:16': { width: 768, height: 1344 },
  '4:5': { width: 1024, height: 1280 },
};

const PRESET_PROMPTS = [
  { label: "Enhance Quality", icon: Sparkles, prompt: "Enhance the image quality, improve clarity, and make colors more vibrant" },
  { label: "Remove Background", icon: Eraser, prompt: "Remove the background and make it transparent" },
  { label: "Artistic Style", icon: Palette, prompt: "Apply an artistic painting style to this image" },
  { label: "Merge Images", icon: Layers, prompt: "Merge these images into a cohesive composition" },
  { label: "Add Text", icon: Type, prompt: "Add professional title text overlay to this image" },
];

const CREATE_PRESETS = [
  { label: "Landscape", icon: Palette, prompt: "Create a beautiful scenic landscape with mountains, a lake, and sunset sky" },
  { label: "Abstract Art", icon: Sparkles, prompt: "Create an abstract art piece with vibrant colors and flowing shapes" },
  { label: "Portrait", icon: Type, prompt: "Create a professional portrait illustration" },
];

export function EnhanceImageDialog({
  open,
  onOpenChange,
  artifacts,
  projectId,
  shareToken,
  onComplete,
}: EnhanceImageDialogProps) {
  const [selectedArtifacts, setSelectedArtifacts] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState("");
  const [outputMode, setOutputMode] = useState<OutputMode>('add');
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [compactView, setCompactView] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');

  // Filter only artifacts with images
  const imageArtifacts = artifacts.filter(a => !!a.image_url);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedArtifacts(new Set());
      setPrompt("");
      setOutputMode('add');
      setGeneratedImage(null);
      setIsProcessing(false);
      setIsSaving(false);
      setAspectRatio('16:9');
    }
  }, [open]);

  // Generate a transparent PNG canvas with specified dimensions
  const generateTransparentCanvas = (ratio: AspectRatio): { base64: string; mimeType: string } => {
    const { width, height } = ASPECT_RATIO_DIMENSIONS[ratio];
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    // Leave canvas transparent - don't fill anything
    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1];
    return { base64, mimeType: "image/png" };
  };

  const handleSelectAll = () => {
    if (selectedArtifacts.size === imageArtifacts.length) {
      setSelectedArtifacts(new Set());
    } else {
      setSelectedArtifacts(new Set(imageArtifacts.map(a => a.id)));
    }
  };

  const handleToggleArtifact = (id: string) => {
    const newSelected = new Set(selectedArtifacts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedArtifacts(newSelected);
  };

  const handlePresetClick = (presetPrompt: string) => {
    setPrompt(presetPrompt);
  };

  const getArtifactTitle = (artifact: Artifact) => {
    if (artifact.ai_title) return artifact.ai_title;
    if (artifact.provenance_page && artifact.provenance_total_pages) {
      return `Page ${artifact.provenance_page} of ${artifact.provenance_total_pages}`;
    }
    return "Untitled";
  };

  const fetchImageAsBase64 = async (url: string): Promise<{ base64: string; mimeType: string }> => {
    const response = await fetch(url);
    const blob = await response.blob();
    const mimeType = blob.type || 'image/png';
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        // Extract base64 data without the data URL prefix
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleEnhance = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    setIsProcessing(true);
    setGeneratedImage(null);

    try {
      // Fetch all selected images as base64 (if any selected)
      const selectedImages = imageArtifacts.filter(a => selectedArtifacts.has(a.id));
      const images = await Promise.all(
        selectedImages.map(async (artifact) => {
          const { base64, mimeType } = await fetchImageAsBase64(artifact.image_url!);
          return { base64, mimeType };
        })
      );

      // Add transparent canvas for aspect ratio control (skip for 16:9 landscape - Nano Banana default)
      let finalPrompt = prompt.trim();
      if (aspectRatio !== '16:9') {
        const transparentCanvas = generateTransparentCanvas(aspectRatio);
        images.push(transparentCanvas);
        finalPrompt = `${prompt.trim()}. Use the last image as the reference for the final aspect ratio and dimensions.`;
      }

      console.log(`Sending ${images.length} images to enhance-image function`);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enhance-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            images,
            prompt: finalPrompt,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to enhance image");
      }

      const data = await response.json();
      setGeneratedImage(data.imageUrl);
      toast.success(selectedArtifacts.size > 0 ? "Image enhanced successfully!" : "Image created successfully!");

    } catch (error) {
      console.error("Enhance image error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to enhance image");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveImage = async () => {
    if (!generatedImage) return;

    setIsSaving(true);

    try {
      // Upload the generated image (uploadOnly mode - we create the artifact separately)
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-artifact-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            imageData: generatedImage,
            projectId,
            shareToken,
            fileName: `${selectedArtifacts.size > 0 ? 'enhanced' : 'generated'}-${Date.now()}.png`,
            uploadOnly: true,  // Skip artifact creation in upload function
            content: prompt,   // Include prompt as fallback content
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to upload image");
      }

      const { url: uploadedUrl } = await response.json();

      if (outputMode === 'replace' && selectedArtifacts.size === 1) {
        // Replace the selected artifact's image
        const artifactId = Array.from(selectedArtifacts)[0];
        const { error } = await supabase.rpc("update_artifact_with_token", {
          p_id: artifactId,
          p_token: shareToken || null,
          p_image_url: uploadedUrl,
        });

        if (error) throw error;
        toast.success("Artifact image replaced successfully!");
      } else {
        // Add as new artifact
        const { error } = await supabase.rpc("insert_artifact_with_token", {
          p_project_id: projectId,
          p_token: shareToken || null,
          p_content: prompt,
          p_image_url: uploadedUrl,
          p_ai_title: selectedArtifacts.size > 0 ? "Enhanced Image" : "Generated Image",
        });

        if (error) throw error;
        toast.success("New artifact created successfully!");
      }

      onComplete();
      onOpenChange(false);

    } catch (error) {
      console.error("Save image error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save image");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (!generatedImage) return;
    
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `enhanced-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isCreating = selectedArtifacts.size === 0;
  const actionLabel = isCreating ? "Create" : "Enhance";
  const activePresets = isCreating ? CREATE_PRESETS : PRESET_PROMPTS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] h-[90vh] max-w-none flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Create/Enhance Image
          </DialogTitle>
          <DialogDescription>
            {isCreating 
              ? "Enter a prompt to create a new AI-generated image"
              : "Select images and apply AI-powered enhancements using Gemini"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-auto">
          {!generatedImage ? (
            <>
              {/* Image Selection (Optional) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Select Images (optional - leave empty to create from text)</Label>
                  <div className="flex items-center gap-2">
                    <Toggle
                      pressed={compactView}
                      onPressedChange={setCompactView}
                      size="sm"
                      aria-label="Toggle compact view"
                      className="gap-1"
                    >
                      {compactView ? <Grid2x2 className="h-3.5 w-3.5" /> : <Grid3x3 className="h-3.5 w-3.5" />}
                      <span className="text-xs">{compactView ? "Small" : "Large"}</span>
                    </Toggle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectAll}
                      disabled={isProcessing}
                    >
                      {selectedArtifacts.size === imageArtifacts.length ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                </div>

                {imageArtifacts.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground border rounded-md text-sm">
                    No image artifacts available. Enter a prompt below to create a new image.
                  </div>
                ) : (
                  <ScrollArea className="h-[300px] border rounded-md p-2">
                    {compactView ? (
                      /* Masonry layout for compact view */
                      <div className="columns-2 sm:columns-4 md:columns-6 gap-2">
                        {imageArtifacts.map((artifact) => (
                          <div
                            key={artifact.id}
                            onClick={() => !isProcessing && handleToggleArtifact(artifact.id)}
                            className={`relative cursor-pointer rounded-md overflow-hidden border-2 transition-all mb-2 break-inside-avoid ${
                              selectedArtifacts.has(artifact.id)
                                ? "border-primary ring-2 ring-primary/20"
                                : "border-transparent hover:border-muted-foreground/30"
                            }`}
                          >
                            <img
                              src={artifact.image_url!}
                              alt={getArtifactTitle(artifact)}
                              className="w-full h-auto"
                            />
                            <div className="absolute top-1 left-1">
                              <Checkbox
                                checked={selectedArtifacts.has(artifact.id)}
                                disabled={isProcessing}
                                className="bg-background/80"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* Grid layout for large view */
                      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
                        {imageArtifacts.map((artifact) => (
                          <div
                            key={artifact.id}
                            onClick={() => !isProcessing && handleToggleArtifact(artifact.id)}
                            className={`relative cursor-pointer rounded-md overflow-hidden border-2 transition-all ${
                              selectedArtifacts.has(artifact.id)
                                ? "border-primary ring-2 ring-primary/20"
                                : "border-transparent hover:border-muted-foreground/30"
                            }`}
                          >
                            <img
                              src={artifact.image_url!}
                              alt={getArtifactTitle(artifact)}
                              className="w-full h-auto"
                            />
                            <div className="absolute top-1 left-1">
                              <Checkbox
                                checked={selectedArtifacts.has(artifact.id)}
                                disabled={isProcessing}
                                className="bg-background/80"
                              />
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-background/80 px-1 py-0.5">
                              <p className="text-xs truncate">{getArtifactTitle(artifact)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                )}
              </div>

              {/* Preset Prompts - Dynamic based on mode */}
              <div className="space-y-2">
                <Label>Quick Presets {isCreating ? "(Create)" : "(Enhance)"}</Label>
                <div className="flex flex-wrap gap-2">
                  {activePresets.map((preset) => (
                    <Button
                      key={preset.label}
                      variant="outline"
                      size="sm"
                      onClick={() => handlePresetClick(preset.prompt)}
                      disabled={isProcessing}
                      className="gap-1"
                    >
                      <preset.icon className="h-3 w-3" />
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>


              {/* Prompt Input */}
              <div className="space-y-2">
                <Label>{isCreating ? "Creation Prompt" : "Enhancement Prompt"}</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={isCreating 
                    ? "Describe the image you want to create..."
                    : "Describe how you want to enhance or modify the image(s)..."}
                  className="min-h-[100px]"
                  disabled={isProcessing}
                />
              </div>

              {/* Output Mode - Only show when images selected */}
              {selectedArtifacts.size > 0 && (
                <div className="space-y-2">
                  <Label>Output Mode</Label>
                  <RadioGroup
                    value={outputMode}
                    onValueChange={(v) => setOutputMode(v as OutputMode)}
                    disabled={isProcessing}
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="add" id="add" />
                      <Label htmlFor="add" className="cursor-pointer">Add as new artifact</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="replace"
                        id="replace"
                        disabled={selectedArtifacts.size !== 1}
                      />
                      <Label
                        htmlFor="replace"
                        className={`cursor-pointer ${selectedArtifacts.size !== 1 ? "text-muted-foreground" : ""}`}
                      >
                        Replace selected artifact
                        {selectedArtifacts.size !== 1 && (
                          <span className="text-xs ml-1">(select 1 image)</span>
                        )}
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </>
          ) : (
            /* Generated Image Preview */
            <div className="space-y-4 flex-1 flex flex-col">
              <div className="flex-1 border rounded-lg overflow-hidden flex items-center justify-center bg-muted">
                <img
                  src={generatedImage}
                  alt="Generated image"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setGeneratedImage(null)}
                  disabled={isSaving}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
                <Button variant="outline" onClick={handleDownload} disabled={isSaving}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex-1 flex items-center">
            <ToggleGroup
              type="single"
              value={aspectRatio}
              onValueChange={(value) => value && setAspectRatio(value as AspectRatio)}
              size="sm"
              className="justify-start"
              disabled={isProcessing || isSaving}
            >
              <ToggleGroupItem value="16:9" aria-label="Landscape" className="gap-1 h-8 px-2">
                <RectangleHorizontal className="h-3.5 w-3.5" />
                <span className="text-xs hidden sm:inline">Landscape</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="1:1" aria-label="Square" className="gap-1 h-8 px-2">
                <Square className="h-3.5 w-3.5" />
                <span className="text-xs hidden sm:inline">Square</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="9:16" aria-label="Portrait" className="gap-1 h-8 px-2">
                <RectangleVertical className="h-3.5 w-3.5" />
                <span className="text-xs hidden sm:inline">Portrait</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="4:5" aria-label="4:5" className="gap-1 h-8 px-2">
                <RectangleVertical className="h-3.5 w-3.5" />
                <span className="text-xs">4:5</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isProcessing || isSaving}
            >
              Cancel
            </Button>
            {!generatedImage ? (
              <Button
                onClick={handleEnhance}
                disabled={isProcessing || !prompt.trim()}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isCreating ? "Creating..." : "Enhancing..."}
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    {actionLabel} {selectedArtifacts.size > 0 ? `(${selectedArtifacts.size})` : ""}
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={handleSaveImage} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {outputMode === 'replace' ? 'Replace Artifact' : 'Add to Artifacts'}
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
