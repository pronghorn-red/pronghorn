import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download, FileText, Trash2, RefreshCw, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { ProjectSelector, type ProjectSelectionResult } from "@/components/project/ProjectSelector";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import JSZip from "jszip";

interface GeneratedImage {
  id: string;
  imageUrl: string;
  generationType: string;
  style: string;
  customPrompt: string;
  timestamp: number;
}

interface GenerationType {
  id: string;
  label: string;
  description: string;
  styles: StyleOption[];
}

interface StyleOption {
  id: string;
  label: string;
  description: string;
  prompt: string;
}

interface GraphicStyles {
  generationTypes: GenerationType[];
}

interface InfographicDialogProps {
  projectId: string;
  shareToken: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InfographicDialog({ projectId, shareToken, open, onOpenChange }: InfographicDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [selectedContent, setSelectedContent] = useState<ProjectSelectionResult | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedGenerationType, setSelectedGenerationType] = useState<string>("");
  const [selectedStyle, setSelectedStyle] = useState<string>("");
  const [graphicStyles, setGraphicStyles] = useState<GraphicStyles | null>(null);

  useEffect(() => {
    // Load graphic styles from JSON
    fetch('/data/graphicStyles.json')
      .then(res => res.json())
      .then(data => {
        setGraphicStyles(data);
        if (data.generationTypes.length > 0) {
          setSelectedGenerationType(data.generationTypes[0].id);
          if (data.generationTypes[0].styles.length > 0) {
            setSelectedStyle(data.generationTypes[0].styles[0].id);
          }
        }
      })
      .catch(err => {
        console.error('Failed to load graphic styles:', err);
        toast.error('Failed to load style options');
      });
  }, []);

  const handleContentSelected = (selection: ProjectSelectionResult) => {
    setSelectedContent(selection);
    setShowProjectSelector(false);
  };

  const generateInfographic = async () => {
    if (!selectedContent) {
      toast.error("Please select content first");
      return;
    }

    if (!graphicStyles) {
      toast.error("Style options not loaded");
      return;
    }

    setIsGenerating(true);

    try {
      console.log('Generating with selected content and style');
      
      const selectedType = graphicStyles.generationTypes.find(t => t.id === selectedGenerationType);
      const selectedStyleObj = selectedType?.styles.find(s => s.id === selectedStyle);

      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          selectedContent,
          generationType: selectedGenerationType,
          style: selectedStyle,
          stylePrompt: selectedStyleObj?.prompt || "",
          customPrompt
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.imageUrl) {
        const newImage: GeneratedImage = {
          id: crypto.randomUUID(),
          imageUrl: data.imageUrl,
          generationType: selectedGenerationType,
          style: selectedStyle,
          customPrompt,
          timestamp: Date.now()
        };
        setGeneratedImages(prev => [...prev, newImage]);
        toast.success("Visual generated successfully!");
      } else {
        throw new Error('No image URL returned');
      }
    } catch (error) {
      console.error('Error generating visual:', error);
      toast.error(error instanceof Error ? error.message : "Failed to generate visual");
    } finally {
      setIsGenerating(false);
    }
  };

  const regenerateImage = async (image: GeneratedImage) => {
    setIsGenerating(true);

    try {
      const selectedType = graphicStyles?.generationTypes.find(t => t.id === image.generationType);
      const selectedStyleObj = selectedType?.styles.find(s => s.id === image.style);

      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          selectedContent,
          generationType: image.generationType,
          style: image.style,
          stylePrompt: selectedStyleObj?.prompt || "",
          customPrompt: image.customPrompt
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.imageUrl) {
        setGeneratedImages(prev => prev.map(img => 
          img.id === image.id 
            ? { ...img, imageUrl: data.imageUrl, timestamp: Date.now() }
            : img
        ));
        toast.success("Visual regenerated successfully!");
      }
    } catch (error) {
      console.error('Error regenerating visual:', error);
      toast.error(error instanceof Error ? error.message : "Failed to regenerate visual");
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteImage = (imageId: string) => {
    setGeneratedImages(prev => prev.filter(img => img.id !== imageId));
    toast.success("Image deleted");
  };

  const getTotalSelectedCount = () => {
    if (!selectedContent) return 0;
    return (
      (selectedContent.projectMetadata ? 1 : 0) +
      selectedContent.artifacts.length +
      selectedContent.chatSessions.length +
      selectedContent.requirements.length +
      selectedContent.standards.length +
      selectedContent.techStacks.length +
      selectedContent.canvasNodes.length +
      selectedContent.canvasEdges.length +
      selectedContent.canvasLayers.length
    );
  };

  const downloadSingleImage = async (image: GeneratedImage) => {
    try {
      const response = await fetch(image.imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `visual-${image.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Image downloaded");
    } catch (error) {
      toast.error("Failed to download image");
    }
  };

  const downloadAllAsZip = async () => {
    if (generatedImages.length === 0) {
      toast.error("No images to download");
      return;
    }

    try {
      const zip = new JSZip();
      
      for (let i = 0; i < generatedImages.length; i++) {
        const image = generatedImages[i];
        const response = await fetch(image.imageUrl);
        const blob = await response.blob();
        zip.file(`visual-${i + 1}-${image.style}.png`, blob);
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `visuals-${projectId}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("All images downloaded as ZIP");
    } catch (error) {
      toast.error("Failed to create ZIP file");
    }
  };

  const currentGenerationType = graphicStyles?.generationTypes.find(t => t.id === selectedGenerationType);
  const availableStyles = currentGenerationType?.styles || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] w-[90vw] h-[90vh] p-0">
        <div className="flex flex-col md:flex-row h-full">
          {/* Side Menu */}
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r bg-muted/30">
            <DialogHeader className="p-6 border-b">
              <DialogTitle>Visual Generator</DialogTitle>
              <DialogDescription className="text-xs">
                Create stunning visuals
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="h-[calc(100%-5rem)]">
              <div className="p-4 space-y-6">
                {/* Content Selection */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Content</Label>
                  {!selectedContent ? (
                    <Button 
                      onClick={() => setShowProjectSelector(true)} 
                      variant="outline" 
                      size="sm"
                      className="w-full justify-start"
                    >
                      <FileText className="w-3 h-3 mr-2" />
                      Select Content
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="bg-background rounded-lg p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">Selected</span>
                          <Badge variant="secondary" className="text-xs">{getTotalSelectedCount()}</Badge>
                        </div>
                      </div>
                      <Button 
                        onClick={() => setShowProjectSelector(true)} 
                        variant="ghost" 
                        size="sm"
                        className="w-full justify-start text-xs"
                      >
                        Change
                      </Button>
                    </div>
                  )}
                </div>

                {/* Generation Type */}
                {graphicStyles && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Type</Label>
                    <div className="space-y-1">
                      {graphicStyles.generationTypes.map(type => (
                        <Button
                          key={type.id}
                          onClick={() => {
                            setSelectedGenerationType(type.id);
                            if (type.styles.length > 0) {
                              setSelectedStyle(type.styles[0].id);
                            }
                          }}
                          variant={selectedGenerationType === type.id ? "default" : "ghost"}
                          size="sm"
                          className="w-full justify-start text-xs"
                        >
                          {type.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Style Selection */}
                {availableStyles.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Style</Label>
                    <div className="space-y-1">
                      {availableStyles.map(style => (
                        <Button
                          key={style.id}
                          onClick={() => setSelectedStyle(style.id)}
                          variant={selectedStyle === style.id ? "default" : "ghost"}
                          size="sm"
                          className="w-full justify-start text-xs"
                          title={style.description}
                        >
                          {style.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Prompt */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Custom Instructions</Label>
                  <Textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Add specific details about what to visualize..."
                    className="text-xs min-h-20 resize-none"
                  />
                </div>

                {/* Generate Button */}
                <Button
                  onClick={generateInfographic}
                  disabled={!selectedContent || isGenerating}
                  className="w-full"
                  size="sm"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <ImagePlus className="w-3 h-3 mr-2" />
                      Generate
                    </>
                  )}
                </Button>

                {/* Download All */}
                {generatedImages.length > 0 && (
                  <Button
                    onClick={downloadAllAsZip}
                    variant="outline"
                    className="w-full"
                    size="sm"
                  >
                    <Download className="w-3 h-3 mr-2" />
                    Download All ({generatedImages.length})
                  </Button>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">Generated Visuals</h3>
              <p className="text-sm text-muted-foreground">
                {generatedImages.length === 0 
                  ? "Your generated images will appear here" 
                  : `${generatedImages.length} visual${generatedImages.length !== 1 ? 's' : ''} generated`}
              </p>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6">
                {generatedImages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center space-y-4">
                    <ImagePlus className="w-16 h-16 text-muted-foreground/50" />
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        No visuals generated yet
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Select content and a style, then click Generate to create your first visual
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {generatedImages.map((image) => (
                      <div key={image.id} className="border rounded-lg overflow-hidden bg-card">
                        <div className="aspect-video relative bg-muted">
                          <img 
                            src={image.imageUrl} 
                            alt="Generated visual" 
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="p-4 space-y-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              {graphicStyles?.generationTypes.find(t => t.id === image.generationType)?.label}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {availableStyles.find(s => s.id === image.style)?.label}
                            </Badge>
                          </div>
                          {image.customPrompt && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {image.customPrompt}
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              onClick={() => regenerateImage(image)}
                              disabled={isGenerating}
                              variant="outline"
                              size="sm"
                              className="flex-1"
                            >
                              <RefreshCw className="w-3 h-3 mr-2" />
                              Regenerate
                            </Button>
                            <Button
                              onClick={() => downloadSingleImage(image)}
                              variant="outline"
                              size="sm"
                            >
                              <Download className="w-3 h-3" />
                            </Button>
                            <Button
                              onClick={() => deleteImage(image.id)}
                              variant="outline"
                              size="sm"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>

      <ProjectSelector
        projectId={projectId}
        shareToken={shareToken}
        open={showProjectSelector}
        onClose={() => setShowProjectSelector(false)}
        onConfirm={handleContentSelected}
      />
    </Dialog>
  );
}
