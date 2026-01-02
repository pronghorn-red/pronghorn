import { useState, useEffect, useRef, useMemo } from "react";
import { toPng } from "html-to-image";
import { SlideRenderer } from "./SlideRenderer";
import { SlideCanvasFixed } from "./SlideCanvas";
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
  /** Callback to expose the thumbnail cache for PDF export */
  onThumbnailCacheUpdate?: (cache: Record<string, string>) => void;
}

// Thumbnail dimensions - render at 2x for quality
const THUMB_WIDTH = 384;
const THUMB_HEIGHT = 216;
// Design canvas size for thumbnails
const DESIGN_WIDTH = 960;
const DESIGN_HEIGHT = 540;

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
      const timer = setTimeout(async () => {
        if (renderRef.current) {
          try {
            const bgColor = theme === 'light' ? '#ffffff' : theme === 'vibrant' ? '#1a0d26' : '#1e293b';
            const dataUrl = await toPng(renderRef.current, {
              cacheBust: true,
              pixelRatio: 1,
              width: DESIGN_WIDTH,
              height: DESIGN_HEIGHT,
              backgroundColor: bgColor,
            });
            onCapture(dataUrl);
            setHasCapture(true);
          } catch (err) {
            console.warn("Failed to capture thumbnail:", err);
            setHasCapture(true);
          }
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [slide, hasCapture, onCapture, theme]);

  // Offscreen container at design size
  return (
    <div 
      ref={renderRef}
      style={{ 
        position: 'fixed',
        left: 0,
        top: 0,
        width: DESIGN_WIDTH,
        height: DESIGN_HEIGHT,
        zIndex: -9999,
        visibility: 'visible',
        pointerEvents: 'none',
        overflow: 'hidden',
        background: theme === 'light' ? '#ffffff' : theme === 'vibrant' ? '#1a0d26' : '#1e293b',
      }}
    >
      <SlideRenderer
        slide={slide}
        layouts={layouts}
        theme={theme as any}
        fontScale={slide.fontScale || 1}
        designWidth={DESIGN_WIDTH}
        designHeight={DESIGN_HEIGHT}
      />
    </div>
  );
}

export function SlideThumbnails({ 
  slides, 
  layouts, 
  selectedSlideIndex, 
  onSlideChange, 
  theme = "default",
  onThumbnailCacheUpdate 
}: SlideThumbnailsProps) {
  const thumbnailCacheRef = useRef<Record<string, string>>({});
  const contentHashRef = useRef<Record<string, string>>({});
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState<Set<string>>(new Set());

  const getContentHash = (slide: Slide): string => {
    const contentStr = JSON.stringify({
      layoutId: slide.layoutId,
      title: slide.title,
      subtitle: slide.subtitle,
      content: slide.content,
      imageUrl: slide.imageUrl,
      fontScale: slide.fontScale,
      theme: theme,
    });
    let hash = 0;
    for (let i = 0; i < contentStr.length; i++) {
      const char = contentStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `${slide.id}-${hash}`;
  };

  useEffect(() => {
    if (!slides || slides.length === 0) return;
    
    slides.forEach((slide) => {
      if (!slide) return;
      const hash = getContentHash(slide);
      const existingHash = contentHashRef.current[slide.id];
      
      if (thumbnailCacheRef.current[hash]) {
        if (!thumbnails[hash]) {
          setThumbnails(prev => ({ ...prev, [hash]: thumbnailCacheRef.current[hash] }));
        }
        return;
      }
      
      if (existingHash !== hash && !generating.has(hash)) {
        setGenerating(prev => new Set(prev).add(hash));
        contentHashRef.current[slide.id] = hash;
      }
    });
  }, [slides, theme]);

  const handleCapture = (slide: Slide, dataUrl: string) => {
    const hash = getContentHash(slide);
    thumbnailCacheRef.current[hash] = dataUrl;
    setThumbnails(prev => ({ ...prev, [hash]: dataUrl }));
    setGenerating(prev => {
      const next = new Set(prev);
      next.delete(hash);
      return next;
    });
    // Notify parent of cache update for PDF export
    onThumbnailCacheUpdate?.(thumbnailCacheRef.current);
  };

  return (
    <>
      {/* Offscreen thumbnail generators */}
      {slides.map((slide) => {
        if (!slide) return null;
        const hash = getContentHash(slide);
        if (!thumbnails[hash] && generating.has(hash)) {
          return (
            <ThumbnailGenerator
              key={`gen-${hash}`}
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
            const hash = getContentHash(slide);
            const thumbnailUrl = thumbnails[hash];
            const isGenerating = generating.has(hash);

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
                  <div className="absolute top-1 left-1 z-10 bg-background/80 backdrop-blur-sm text-xs font-medium px-1.5 py-0.5 rounded">
                    {index + 1}
                  </div>
                  
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
