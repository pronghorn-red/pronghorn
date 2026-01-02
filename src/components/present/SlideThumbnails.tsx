import { SlideRenderer } from "./SlideRenderer";
import { ScrollArea } from "@/components/ui/scroll-area";
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

export function SlideThumbnails({ 
  slides, 
  layouts, 
  selectedSlideIndex, 
  onSlideChange, 
  theme = "default" 
}: SlideThumbnailsProps) {
  return (
    <ScrollArea className="h-[calc(100vh-400px)]">
      <div className="space-y-3 p-2">
        {slides.map((slide, index) => (
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
              
              {/* Thumbnail render */}
              <div className="w-full">
                <SlideRenderer
                  slide={slide}
                  layouts={layouts}
                  theme={theme}
                  isPreview={true}
                />
              </div>
            </div>
            
            {/* Slide title */}
            <div className="p-1.5 bg-muted/50 border-t">
              <p className="text-xs font-medium truncate text-left">
                {slide.title || "Untitled Slide"}
              </p>
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
