import { useState } from "react";
import { SlideRenderer } from "./SlideRenderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, StickyNote, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LayoutSelector } from "./LayoutSelector";
import { FontScaleControl } from "./FontScaleControl";
import { SlideNotesEditor } from "./SlideNotesEditor";
import { SlideImageGenerator } from "./SlideImageGenerator";

interface SlideContent {
  regionId: string;
  type: string;
  data: any;
}

interface Slide {
  id: string;
  order: number;
  layoutId: string;
  title: string;
  subtitle?: string;
  content: SlideContent[];
  notes?: string;
  imageUrl?: string;
  fontScale?: number;
}

interface Layout {
  id: string;
  name: string;
  description: string;
  category: string;
  regions: any[];
}

interface SlidePreviewProps {
  slides: Slide[];
  layouts: Layout[];
  selectedSlideIndex: number;
  onSlideChange: (index: number) => void;
  theme?: "default" | "light" | "vibrant";
  externalFullscreen?: boolean;
  fontScale?: number;
  // New props for editing capabilities
  onUpdateSlide?: (index: number, updates: Partial<Slide>) => void;
  projectContext?: string;
  imageStyle?: string;
  imageModel?: string;
}

export function SlidePreview({ 
  slides, 
  layouts, 
  selectedSlideIndex, 
  onSlideChange, 
  theme = "default",
  externalFullscreen = false,
  fontScale = 1,
  onUpdateSlide,
  projectContext,
  imageStyle,
  imageModel,
}: SlidePreviewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [isImageGeneratorOpen, setIsImageGeneratorOpen] = useState(false);
  const [showControls, setShowControls] = useState(false);
  
  // Use external fullscreen if provided
  const effectiveFullscreen = externalFullscreen || isFullscreen;

  const currentSlide = slides[selectedSlideIndex];
  const canGoPrev = selectedSlideIndex > 0;
  const canGoNext = selectedSlideIndex < slides.length - 1;

  const handlePrev = () => {
    if (canGoPrev) onSlideChange(selectedSlideIndex - 1);
  };

  const handleNext = () => {
    if (canGoNext) onSlideChange(selectedSlideIndex + 1);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" && canGoPrev) handlePrev();
    if (e.key === "ArrowRight" && canGoNext) handleNext();
    if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
  };

  // Handle layout change - optimistic update
  const handleLayoutChange = (layoutId: string) => {
    if (onUpdateSlide) {
      onUpdateSlide(selectedSlideIndex, { layoutId });
    }
  };

  // Handle font scale change - optimistic update
  const handleFontScaleChange = (newFontScale: number) => {
    if (onUpdateSlide) {
      onUpdateSlide(selectedSlideIndex, { fontScale: newFontScale });
    }
  };

  // Handle notes save
  const handleSaveNotes = (notes: string) => {
    if (onUpdateSlide) {
      onUpdateSlide(selectedSlideIndex, { notes });
    }
  };

  // Handle image generation
  const handleImageGenerated = (imageUrl: string) => {
    if (onUpdateSlide && currentSlide) {
      // Update the slide's image content
      const updatedContent = [...(currentSlide.content || [])];
      const imageIndex = updatedContent.findIndex(c => c.type === "image" || c.regionId === "image" || c.regionId === "diagram");
      
      if (imageIndex >= 0) {
        updatedContent[imageIndex] = {
          ...updatedContent[imageIndex],
          data: { url: imageUrl, imageUrl },
        };
      } else {
        updatedContent.push({
          regionId: "image",
          type: "image",
          data: { url: imageUrl, imageUrl },
        });
      }
      
      onUpdateSlide(selectedSlideIndex, { content: updatedContent, imageUrl });
    }
  };

  // Check if current layout supports images
  const layoutSupportsImage = currentSlide && ["image-left", "image-right", "architecture", "title-cover"].includes(currentSlide.layoutId);

  // Get current image URL
  const getCurrentImageUrl = () => {
    if (!currentSlide) return undefined;
    const imageContent = currentSlide.content?.find(c => c.type === "image" || c.regionId === "image" || c.regionId === "diagram");
    return imageContent?.data?.url || imageContent?.data?.imageUrl || currentSlide.imageUrl;
  };

  if (!currentSlide) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No slides available
      </div>
    );
  }

  // External fullscreen mode - render with controls overlay and notes panel
  if (externalFullscreen) {
    return (
      <div 
        className="h-full w-full relative flex"
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
      >
        {/* Main slide area */}
        <div className={cn(
          "flex-1 relative transition-all",
          showNotes && "w-2/3"
        )}>
          <SlideRenderer
            slide={currentSlide}
            layouts={layouts}
            theme={theme}
            isPreview={false}
            isFullscreen={true}
            fontScale={currentSlide.fontScale || fontScale}
            className="h-full w-full"
          />
          
          {/* Floating controls overlay in fullscreen */}
          {showControls && onUpdateSlide && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 p-3 bg-background/90 backdrop-blur-sm rounded-lg border shadow-lg z-20">
              <LayoutSelector 
                value={currentSlide.layoutId} 
                onChange={handleLayoutChange} 
              />
              <FontScaleControl 
                value={currentSlide.fontScale || 1} 
                onChange={handleFontScaleChange} 
              />
              {layoutSupportsImage && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setIsImageGeneratorOpen(true)}
                >
                  <ImageIcon className="h-3.5 w-3.5 mr-1" />
                  Image
                </Button>
              )}
              <Button
                variant={showNotes ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowNotes(!showNotes)}
              >
                <StickyNote className="h-3.5 w-3.5 mr-1" />
                Notes
              </Button>
            </div>
          )}
        </div>

        {/* Notes panel in fullscreen */}
        {showNotes && onUpdateSlide && (
          <div className="w-1/3 border-l bg-background/95 backdrop-blur-sm p-4 overflow-y-auto">
            <SlideNotesEditor
              notes={currentSlide.notes || ""}
              onSave={handleSaveNotes}
            />
          </div>
        )}
        
        {/* Image generator dialog */}
        <SlideImageGenerator
          open={isImageGeneratorOpen}
          onOpenChange={setIsImageGeneratorOpen}
          onImageGenerated={handleImageGenerated}
          currentImageUrl={getCurrentImageUrl()}
          projectContext={projectContext}
          imageStyle={imageStyle}
          imageModel={imageModel}
        />
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "flex flex-col",
        effectiveFullscreen ? "fixed inset-0 z-50 bg-background" : "h-full"
      )}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Controls bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrev}
            disabled={!canGoPrev}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <span className="text-sm font-medium min-w-16 text-center">
            {selectedSlideIndex + 1} / {slides.length}
          </span>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={!canGoNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {layoutSupportsImage && onUpdateSlide && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsImageGeneratorOpen(true)}
            >
              <ImageIcon className="h-4 w-4 mr-1" />
              {getCurrentImageUrl() ? "Replace Image" : "Add Image"}
            </Button>
          )}
          
          <Button
            variant={showNotes ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowNotes(!showNotes)}
          >
            <StickyNote className="h-4 w-4 mr-1" />
            Notes
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {effectiveFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Main slide area */}
      <div className={cn(
        "flex-1 flex gap-4",
        effectiveFullscreen ? "h-[calc(100dvh-60px)] overflow-hidden" : "min-h-0 overflow-hidden"
      )}>
        <div className={cn(
          "flex-1",
          showNotes && currentSlide.notes && "w-2/3",
          effectiveFullscreen && "h-full"
        )}>
          {effectiveFullscreen ? (
            <SlideRenderer
              slide={currentSlide}
              layouts={layouts}
              theme={theme}
              isPreview={false}
              isFullscreen={true}
              fontScale={currentSlide.fontScale || fontScale}
              className="h-full w-full"
            />
          ) : (
            <Card className="h-full overflow-hidden">
              <CardContent className="p-0 h-full flex items-center justify-center bg-muted/20">
                <div className="w-full max-w-4xl">
                  <SlideRenderer
                    slide={currentSlide}
                    layouts={layouts}
                    theme={theme}
                    isPreview={false}
                    isFullscreen={false}
                    fontScale={currentSlide.fontScale || fontScale}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Speaker notes panel - always show when toggled, even if no notes yet */}
        {showNotes && onUpdateSlide && (
          <Card className="w-1/3 shrink-0">
            <CardContent className="p-4">
              <SlideNotesEditor
                notes={currentSlide.notes || ""}
                onSave={handleSaveNotes}
              />
            </CardContent>
          </Card>
        )}
        
        {/* Readonly notes when no update handler */}
        {showNotes && !onUpdateSlide && (
          <Card className="w-1/3 shrink-0">
            <CardContent className="p-4">
              <h4 className="text-sm font-semibold mb-2 text-muted-foreground">
                Speaker Notes
              </h4>
              <p className="text-sm leading-relaxed">
                {currentSlide.notes || "No notes for this slide."}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Layout info */}
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Layout: {currentSlide.layoutId}</span>
        <span>{currentSlide.content?.length || 0} content blocks</span>
      </div>
      
      {/* Image generator dialog */}
      <SlideImageGenerator
        open={isImageGeneratorOpen}
        onOpenChange={setIsImageGeneratorOpen}
        onImageGenerated={handleImageGenerated}
        currentImageUrl={getCurrentImageUrl()}
        projectContext={projectContext}
        imageStyle={imageStyle}
        imageModel={imageModel}
      />
    </div>
  );
}
