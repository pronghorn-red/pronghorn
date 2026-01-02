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

// Component to generate a single thumbnail - renders offscreen then captures
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
      // Wait for render to complete
      const timer = setTimeout(() => {
        if (renderRef.current) {
          toPng(renderRef.current, {
            cacheBust: true,
            pixelRatio: 2,
            width: 384,
            height: 216,
            backgroundColor: theme === 'light' ? '#ffffff' : '#1e293b',
          })
            .then((dataUrl) => {
              onCapture(dataUrl);
              setHasCapture(true);
            })
            .catch((err) => {
              console.warn("Failed to capture thumbnail:", err);
              setHasCapture(true);
            });
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [slide, hasCapture, onCapture, theme]);

  // Offscreen container - use fixed positioning to keep in DOM but invisible
  // Note: absolute positioning outside viewport can cause rendering issues in some browsers
  return (
    <div 
      ref={renderRef}
      style={{ 
        position: 'fixed',
        left: 0,
        top: 0,
        width: 384,
        height: 216,
        zIndex: -9999,
        pointerEvents: 'none',
        opacity: 0,
      }}
    >
      <SlideRenderer
        slide={slide}
        layouts={layouts}
        theme={theme as any}
        isPreview={true}
        isFullscreen={false}
        fontScale={slide.fontScale || 1}
        className="w-full h-full"
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
    const title = slide.title || '';
    // Use a simpler key that won't cause issues with large content
    return `${id}-${layoutId}-${title.slice(0, 30)}`;
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

  const handleCapture = (slide: Slide, dataUrl: string) => {
    const key = getSlideKey(slide);
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
        if (!slide) return null;
        const key = getSlideKey(slide);
        if (key !== 'invalid-slide' && !thumbnails[key] && generating.has(key)) {
          return (
            <ThumbnailGenerator
              key={`gen-${key}`}
              slide={slide}
              layouts={layouts}
              theme={theme}
              onCapture={(dataUrl) => handleCapture(slide, dataUrl)}
            />
          );
        }
        return null;
      })}

      <ScrollArea className="h-full">
        <div className="space-y-3 p-2">
          {slides.map((slide, index) => {
            if (!slide) return null;
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
                  
                  {/* 16:9 aspect ratio thumbnail */}
                  <div className="w-full aspect-video bg-muted">
                    {thumbnailUrl ? (
                      <img 
                        src={thumbnailUrl} 
                        alt={slide.title || `Slide ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : isGenerating ? (
                      <div className="w-full h-full flex items-center justify-center bg-slate-800">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground bg-slate-800">
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
