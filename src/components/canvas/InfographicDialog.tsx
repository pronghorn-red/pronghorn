import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download, FileText, Trash2, RefreshCw, ImagePlus, X, Menu, Save } from "lucide-react";
import { toast } from "sonner";
import { ProjectSelector, type ProjectSelectionResult } from "@/components/project/ProjectSelector";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import JSZip from "jszip";
import { useRealtimeArtifacts } from "@/hooks/useRealtimeArtifacts";

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
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [loadingImageIds, setLoadingImageIds] = useState<Set<string>>(new Set());
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [selectedContent, setSelectedContent] = useState<ProjectSelectionResult | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedGenerationType, setSelectedGenerationType] = useState<string>("");
  const [selectedStyle, setSelectedStyle] = useState<string>("");
  const [graphicStyles, setGraphicStyles] = useState<GraphicStyles | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<GeneratedImage | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSavingArtifact, setIsSavingArtifact] = useState<string | null>(null);
  
  const { addArtifact } = useRealtimeArtifacts(projectId, shareToken, true);

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

    // Create placeholder image immediately
    const placeholderId = crypto.randomUUID();
    const placeholderImage: GeneratedImage = {
      id: placeholderId,
      imageUrl: '', // Empty URL indicates loading
      generationType: selectedGenerationType,
      style: selectedStyle,
      customPrompt,
      timestamp: Date.now()
    };

    // Add placeholder to images and track as loading
    setGeneratedImages(prev => [...prev, placeholderImage]);
    setLoadingImageIds(prev => new Set(prev).add(placeholderId));

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
        // Update placeholder with real image
        setGeneratedImages(prev => prev.map(img => 
          img.id === placeholderId 
            ? { ...img, imageUrl: data.imageUrl }
            : img
        ));
        toast.success("Visual generated successfully!");
      } else {
        throw new Error('No image URL returned');
      }
    } catch (error) {
      console.error('Error generating visual:', error);
      toast.error(error instanceof Error ? error.message : "Failed to generate visual");
      
      // Remove placeholder on error
      setGeneratedImages(prev => prev.filter(img => img.id !== placeholderId));
    } finally {
      // Remove from loading set
      setLoadingImageIds(prev => {
        const next = new Set(prev);
        next.delete(placeholderId);
        return next;
      });
    }
  };

  const regenerateImage = async (image: GeneratedImage) => {
    // Mark this image as loading
    setLoadingImageIds(prev => new Set(prev).add(image.id));

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
      setLoadingImageIds(prev => {
        const next = new Set(prev);
        next.delete(image.id);
        return next;
      });
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

  const saveImageAsArtifact = async (image: GeneratedImage) => {
    setIsSavingArtifact(image.id);
    try {
      const styleLabel = availableStyles.find(s => s.id === image.style)?.label || image.style;
      const typeLabel = graphicStyles?.generationTypes.find(t => t.id === image.generationType)?.label || image.generationType;
      const content = image.customPrompt || `Generated ${typeLabel} - ${styleLabel}`;
      
      const fileName = `${image.id}-${Date.now()}.png`;
      
      // Use edge function to upload with proper token validation
      const { data, error } = await supabase.functions.invoke('upload-artifact-image', {
        body: {
          projectId,
          shareToken,
          imageData: image.imageUrl,
          fileName,
          content,
          sourceType: 'infographic',
          sourceId: image.id
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      toast.success("Image saved as artifact");
    } catch (error: any) {
      console.error("Error saving image as artifact:", error);
      toast.error(error.message || "Failed to save image as artifact");
    } finally {
      setIsSavingArtifact(null);
    }
  };

  const saveAllImagesAsArtifacts = async () => {
    if (generatedImages.length === 0) {
      toast.error("No images to save");
      return;
    }

    setIsSavingArtifact('all');
    let successCount = 0;
    
    try {
      for (const image of generatedImages) {
        try {
          const imgStyleLabel = availableStyles.find(s => s.id === image.style)?.label || image.style;
          const imgTypeLabel = graphicStyles?.generationTypes.find(t => t.id === image.generationType)?.label || image.generationType;
          const imgContent = image.customPrompt || `Generated ${imgTypeLabel} - ${imgStyleLabel}`;
          const imgFileName = `${image.id}-${Date.now()}.png`;
          
          // Use edge function to upload with proper token validation
          const { data, error } = await supabase.functions.invoke('upload-artifact-image', {
            body: {
              projectId,
              shareToken,
              imageData: image.imageUrl,
              fileName: imgFileName,
              content: imgContent,
              sourceType: 'infographic',
              sourceId: image.id
            }
          });

          if (error) throw error;
          if (data.error) throw new Error(data.error);
          successCount++;
        } catch (err) {
          console.error(`Error saving image ${image.id}:`, err);
        }
      }
      
      toast.success(`Saved ${successCount} of ${generatedImages.length} images as artifacts`);
    } finally {
      setIsSavingArtifact(null);
    }
  };

  const currentGenerationType = graphicStyles?.generationTypes.find(t => t.id === selectedGenerationType);
  const availableStyles = currentGenerationType?.styles || [];

  const sideMenuContent = (
    <>
      <div className="p-4 space-y-6 pb-6">
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
                          onClick={() => {
                            setSelectedStyle(style.id);
                            setMobileMenuOpen(false);
                          }}
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
      </div>
    </>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] w-[90vw] h-[90vh] p-0 overflow-y-auto md:overflow-hidden">
          <div className="flex flex-col h-full min-h-0 overflow-hidden">
            {/* Mobile Menu Button */}
            <div className="md:hidden flex items-center gap-2 p-4 border-b flex-shrink-0">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Menu className="w-4 h-4 mr-2" />
                    Options
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[280px] p-0">
                  <SheetHeader className="p-6 border-b">
                    <SheetTitle>Visual Generator</SheetTitle>
                  </SheetHeader>
                  <ScrollArea className="h-[calc(100vh-80px)]">
                    {sideMenuContent}
                  </ScrollArea>
                </SheetContent>
              </Sheet>
              <div className="flex-1">
                <h3 className="text-sm font-semibold">Visual Generator</h3>
              </div>
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* Side Menu - Desktop Only */}
              <div className="hidden md:flex w-64 border-r bg-muted/30 flex-col h-full min-h-0 overflow-hidden">
                <DialogHeader className="p-6 border-b flex-shrink-0">
                  <DialogTitle>Visual Generator</DialogTitle>
                  <DialogDescription className="text-xs">
                    Create stunning visuals
                  </DialogDescription>
                </DialogHeader>
                
                <ScrollArea className="flex-1 overflow-y-auto">
                  {sideMenuContent}
                </ScrollArea>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 flex flex-col min-h-0">
              <div className="p-6 border-b flex-shrink-0">
                <h3 className="text-lg font-semibold leading-none">Generated Visuals</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {generatedImages.length === 0 
                    ? "Your generated images will appear here" 
                    : `${generatedImages.length} visual${generatedImages.length !== 1 ? 's' : ''} generated`}
                </p>
              </div>

              {/* Custom Instructions - Full Width */}
              <div className="p-6 border-b space-y-2 flex-shrink-0">
                <Label className="text-sm font-semibold">Custom Instructions</Label>
                <Textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Add specific details about what to visualize..."
                  className="text-sm min-h-20 resize-none"
                />
              </div>

              <ScrollArea className="flex-1 overflow-y-auto">
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
                      {generatedImages.map((image) => {
                        const isLoading = loadingImageIds.has(image.id);
                        return (
                        <div key={image.id} className="border rounded-lg overflow-hidden bg-card">
                          <div 
                            className="aspect-video relative bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => !isLoading && setFullScreenImage(image)}
                          >
                            {isLoading ? (
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="text-center space-y-2">
                                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                                  <p className="text-xs text-muted-foreground">Generating...</p>
                                </div>
                              </div>
                            ) : (
                              <img 
                                src={image.imageUrl} 
                                alt="Generated visual" 
                                className="w-full h-full object-contain"
                              />
                            )}
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
                              onClick={() => saveImageAsArtifact(image)}
                              disabled={isSavingArtifact === image.id || isLoading}
                              variant="default"
                              size="sm"
                              className="flex-1"
                            >
                              <Save className="w-3 h-3 mr-2" />
                              {isSavingArtifact === image.id ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              onClick={() => regenerateImage(image)}
                              disabled={isLoading}
                              variant="outline"
                              size="sm"
                            >
                              <RefreshCw className="w-3 h-3" />
                            </Button>
                            <Button
                              onClick={() => downloadSingleImage(image)}
                              disabled={isLoading}
                              variant="outline"
                              size="sm"
                            >
                              <Download className="w-3 h-3" />
                            </Button>
                            <Button
                              onClick={() => deleteImage(image.id)}
                              disabled={isLoading}
                              variant="outline"
                              size="sm"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      );
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Bottom Action Buttons */}
              <div className="p-6 border-t bg-muted/30 flex justify-end gap-2 flex-shrink-0 flex-wrap">
              {generatedImages.length > 0 && (
                <>
                  <Button
                    onClick={saveAllImagesAsArtifacts}
                    disabled={isSavingArtifact === 'all'}
                    variant="default"
                    size="sm"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {isSavingArtifact === 'all' ? 'Saving...' : `Save All as Artifacts (${generatedImages.length})`}
                  </Button>
                  <Button
                    onClick={downloadAllAsZip}
                    variant="outline"
                    size="sm"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download All ({generatedImages.length})
                  </Button>
                </>
              )}
              <Button
                onClick={generateInfographic}
                disabled={!selectedContent}
                size="sm"
              >
                <ImagePlus className="w-4 h-4 mr-2" />
                Generate
              </Button>
              </div>
            </div>
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

      {/* Full Screen Image Viewer */}
      <Dialog open={!!fullScreenImage} onOpenChange={() => setFullScreenImage(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh] p-0">
          <div className="relative w-full h-full flex flex-col bg-background">
            {/* Top Menu */}
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
              <div className="flex items-center gap-2">
                {fullScreenImage && (
                  <>
                    <Badge variant="secondary" className="text-xs">
                      {graphicStyles?.generationTypes.find(t => t.id === fullScreenImage.generationType)?.label}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {currentGenerationType?.styles.find(s => s.id === fullScreenImage.style)?.label}
                    </Badge>
                  </>
                )}
              </div>
              <Button
                onClick={() => setFullScreenImage(null)}
                variant="ghost"
                size="icon"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Image */}
            <div className="flex-1 flex items-center justify-center p-4 bg-muted/30 overflow-auto">
              {fullScreenImage && (
                <img 
                  src={fullScreenImage.imageUrl} 
                  alt="Generated visual" 
                  className="max-w-full max-h-full object-contain"
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
