import { useState } from "react";
import { SlideRenderer } from "./SlideRenderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

export function SlidePreview({ 
  slides, 
  layouts, 
  selectedSlideIndex, 
  onSlideChange, 
  theme = "default",
  externalFullscreen = false,
  fontScale = 1
}: SlidePreviewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  
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

  if (!currentSlide) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No slides available
      </div>
    );
  }

  // External fullscreen mode - just render the slide, no controls
  if (externalFullscreen) {
    return (
      <div className="h-full w-full">
        <SlideRenderer
          slide={currentSlide}
          layouts={layouts}
          theme={theme}
          isPreview={false}
          isFullscreen={true}
          fontScale={currentSlide.fontScale || fontScale}
          className="h-full w-full"
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
          {currentSlide.notes && (
            <Button
              variant={showNotes ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowNotes(!showNotes)}
            >
              <StickyNote className="h-4 w-4 mr-1" />
              Notes
            </Button>
          )}
          
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

        {/* Speaker notes panel */}
        {showNotes && currentSlide.notes && (
          <Card className="w-1/3">
            <CardContent className="p-4">
              <h4 className="text-sm font-semibold mb-2 text-muted-foreground">
                Speaker Notes
              </h4>
              <p className="text-sm leading-relaxed">
                {currentSlide.notes}
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
    </div>
  );
}
