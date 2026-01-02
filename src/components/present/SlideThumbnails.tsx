import { useState, useEffect, useRef } from "react";
import { toPng } from "html-to-image";
import { SlideRenderer } from "./SlideRenderer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

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

interface SlideThumbnailsProps {
  slides: Slide[];
  layouts: Layout[];
  selectedSlideIndex: number;
  onSlideChange: (index: number) => void;
  theme?: "default" | "light" | "vibrant";
}

// Component to generate a single thumbnail
function ThumbnailGenerator({ 
  slide, 
  layouts, 
  theme, 
  onCapture 
}: { 
  slide: Slide; 
  layouts: Layout[]; 
  theme: string;
  onCapture: (dataUrl: string) => void;
}) {
  const renderRef = useRef<HTMLDivElement>(null);
  const [hasCapture, setHasCapture] = useState(false);

  useEffect(() => {
    if (renderRef.current && !hasCapture) {
      // Small delay to ensure render is complete
      const timer = setTimeout(() => {
        if (renderRef.current) {
          toPng(renderRef.current, {
            cacheBust: true,
            pixelRatio: 1,
            width: 320,
            height: 180,
          })
            .then((dataUrl) => {
              onCapture(dataUrl);
              setHasCapture(true);
            })
            .catch((err) => {
              console.warn("Failed to capture thumbnail:", err);
            });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [slide, hasCapture, onCapture]);

  // Hidden offscreen renderer
  return (
    <div 
      ref={renderRef}
      className="absolute -left-[9999px] -top-[9999px]"
      style={{ width: 320, height: 180 }}
    >
      <SlideRenderer
        slide={slide}
        layouts={layouts}
        theme={theme as any}
        isPreview={true}
        fontScale={slide.fontScale || 1}
      />
    </div>
  );
}

export function SlideThumbnails({ 
  slides, 
  layouts, 
  selectedSlideIndex, 
  onSlideChange, 
  theme = "default" 
}: SlideThumbnailsProps) {
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState<Set<string>>(new Set());

  // Generate thumbnails for slides that don't have them
  const getSlideKey = (slide: Slide | null | undefined) => {
    if (!slide) return 'invalid-slide';
    const id = slide.id || 'no-id';
    const layoutId = slide.layoutId || 'no-layout';
    const contentStr = JSON.stringify(slide.content || []);
    return `${id}-${layoutId}-${contentStr.slice(0, 100)}`;
  };

  useEffect(() => {
    if (!slides || slides.length === 0) return;
    
    slides.forEach((slide) => {
      if (!slide) return;
      const key = getSlideKey(slide);
      if (key !== 'invalid-slide' && !thumbnails[key] && !generating.has(key)) {
        setGenerating(prev => new Set(prev).add(key));
      }
    });
  }, [slides, thumbnails, generating]);

  const handleCapture = (slideId: string, layoutId: string, content: any[], dataUrl: string) => {
    const contentStr = JSON.stringify(content || []);
    const key = `${slideId || 'no-id'}-${layoutId || 'no-layout'}-${contentStr.slice(0, 100)}`;
    setThumbnails(prev => ({ ...prev, [key]: dataUrl }));
    setGenerating(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  return (
    <>
      {/* Offscreen thumbnail generators */}
      {slides.map((slide) => {
        const key = getSlideKey(slide);
        if (!thumbnails[key] && generating.has(key)) {
          return (
            <ThumbnailGenerator
              key={`gen-${key}`}
              slide={slide}
              layouts={layouts}
              theme={theme}
              onCapture={(dataUrl) => handleCapture(slide.id, slide.layoutId, slide.content, dataUrl)}
            />
          );
        }
        return null;
      })}

      <ScrollArea className="h-full">
        <div className="space-y-3 p-2">
          {slides.map((slide, index) => {
            const key = getSlideKey(slide);
            const thumbnailUrl = thumbnails[key];
            const isGenerating = generating.has(key);

            return (
              <button
                key={slide.id || index}
                onClick={() => onSlideChange(index)}
                className={cn(
                  "w-full rounded-lg overflow-hidden border-2 transition-all",
                  selectedSlideIndex === index 
                    ? "border-primary ring-2 ring-primary/20" 
                    : "border-border hover:border-muted-foreground/50"
                )}
              >
                <div className="relative">
                  {/* Slide number badge */}
                  <div className="absolute top-1 left-1 z-10 bg-background/80 backdrop-blur-sm text-xs font-medium px-1.5 py-0.5 rounded">
                    {index + 1}
                  </div>
                  
                  {/* Thumbnail image or loading state */}
                  <div className="w-full aspect-video bg-muted">
                    {thumbnailUrl ? (
                      <img 
                        src={thumbnailUrl} 
                        alt={slide.title || `Slide ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : isGenerating ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                        {slide.title?.slice(0, 20) || "Slide"}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Slide title */}
                <div className="p-1.5 bg-muted/50 border-t overflow-hidden">
                  <p className="text-xs font-medium truncate text-left max-w-full">
                    {slide.title || "Untitled Slide"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </>
  );
}
