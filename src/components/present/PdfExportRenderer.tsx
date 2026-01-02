import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { SlideRenderer } from "./SlideRenderer";
import { toast } from "sonner";

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

interface PdfExportRendererProps {
  slides: Slide[];
  layouts: Layout[];
  presentationName: string;
  theme?: "default" | "light" | "vibrant";
  onComplete: () => void;
  onError: (error: Error) => void;
}

export interface PdfExportRendererRef {
  startExport: () => void;
}

export const PdfExportRenderer = forwardRef<PdfExportRendererRef, PdfExportRendererProps>(
  ({ slides, layouts, presentationName, theme = "default", onComplete, onError }, ref) => {
    const [isExporting, setIsExporting] = useState(false);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(-1);
    const [capturedImages, setCapturedImages] = useState<string[]>([]);
    const renderRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      startExport: () => {
        setIsExporting(true);
        setCapturedImages([]);
        setCurrentSlideIndex(0);
      },
    }));

    // Capture current slide when index changes
    useEffect(() => {
      if (!isExporting || currentSlideIndex < 0 || currentSlideIndex >= slides.length) return;

      const captureSlide = async () => {
        // Wait for render to complete - longer delay like parseDocx.ts approach
        await new Promise((resolve) => setTimeout(resolve, 800));

        if (!renderRef.current) {
          console.error("Render ref not available");
          return;
        }

        try {
          toast.info(`Capturing slide ${currentSlideIndex + 1}/${slides.length}...`, { id: "pdf-progress" });

          const bgColor = theme === "light" ? "#ffffff" : theme === "vibrant" ? "#1a0d26" : "#1e293b";
          
          const dataUrl = await toPng(renderRef.current, {
            cacheBust: true,
            pixelRatio: 2,
            width: 1920,
            height: 1080,
            backgroundColor: bgColor,
          });

          setCapturedImages((prev) => [...prev, dataUrl]);
          
          // Move to next slide or finish
          if (currentSlideIndex < slides.length - 1) {
            setCurrentSlideIndex((prev) => prev + 1);
          } else {
            // All slides captured, generate PDF
            generatePdf([...capturedImages, dataUrl]);
          }
        } catch (error) {
          console.error(`Failed to capture slide ${currentSlideIndex + 1}:`, error);
          onError(error as Error);
          setIsExporting(false);
        }
      };

      captureSlide();
    }, [currentSlideIndex, isExporting, slides.length, theme]);

    const generatePdf = async (images: string[]) => {
      try {
        toast.info("Generating PDF...", { id: "pdf-progress" });

        const pdf = new jsPDF({
          orientation: "landscape",
          unit: "px",
          format: [1920, 1080],
        });

        for (let i = 0; i < images.length; i++) {
          if (i > 0) {
            pdf.addPage([1920, 1080], "landscape");
          }
          pdf.addImage(images[i], "PNG", 0, 0, 1920, 1080);
        }

        const fileName = `${presentationName.replace(/\s+/g, "_")}.pdf`;
        pdf.save(fileName);

        toast.success("PDF exported successfully!", { id: "pdf-progress" });
        onComplete();
      } catch (error) {
        console.error("PDF generation error:", error);
        onError(error as Error);
      } finally {
        setIsExporting(false);
        setCurrentSlideIndex(-1);
        setCapturedImages([]);
      }
    };

    if (!isExporting || currentSlideIndex < 0 || currentSlideIndex >= slides.length) {
      return null;
    }

    const currentSlide = slides[currentSlideIndex];
    
    // Get background color based on theme
    const bgColor = theme === "light" ? "#ffffff" : theme === "vibrant" ? "#1a0d26" : "#1e293b";

    // Use fixed positioning with visibility:visible (not opacity:0)
    // This is the proven approach from parseDocx.ts that works with html-to-image
    return (
      <div
        ref={renderRef}
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
          zIndex: -9999,
          visibility: "visible",
          pointerEvents: "none",
          overflow: "hidden",
          backgroundColor: bgColor,
        }}
      >
        <SlideRenderer
          slide={currentSlide}
          layouts={layouts}
          theme={theme}
          isPreview={false}
          isFullscreen={false}
          fontScale={currentSlide.fontScale || 1}
          className="w-full h-full"
        />
      </div>
    );
  }
);

PdfExportRenderer.displayName = "PdfExportRenderer";
