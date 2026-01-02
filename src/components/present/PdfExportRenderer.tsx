import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { toPng, toJpeg } from "html-to-image";
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
  /** Optional pre-generated thumbnail cache - key is slide hash, value is dataUrl */
  thumbnailCache?: Record<string, string>;
  onComplete: () => void;
  onError: (error: Error) => void;
}

export interface PdfExportRendererRef {
  startExport: () => void;
}

// Use same design size as thumbnails for consistency
const DESIGN_WIDTH = 960;
const DESIGN_HEIGHT = 540;
// PDF output size (2x design for quality)
const PDF_WIDTH = 1920;
const PDF_HEIGHT = 1080;

export const PdfExportRenderer = forwardRef<PdfExportRendererRef, PdfExportRendererProps>(
  ({ slides, layouts, presentationName, theme = "default", thumbnailCache, onComplete, onError }, ref) => {
    const [isExporting, setIsExporting] = useState(false);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(-1);
    const renderRef = useRef<HTMLDivElement>(null);
    const capturedImagesRef = useRef<string[]>([]);

    useImperativeHandle(ref, () => ({
      startExport: () => {
        console.log("Starting PDF export with", slides.length, "slides");
        capturedImagesRef.current = [];
        setCurrentSlideIndex(-1);
        // Small delay to ensure state reset, then start
        setTimeout(() => {
          setIsExporting(true);
          setCurrentSlideIndex(0);
        }, 100);
      },
    }));

    // Get background color based on theme
    const getBgColor = () => {
      return theme === "light" ? "#ffffff" : theme === "vibrant" ? "#1a0d26" : "#1e293b";
    };

    // Generate content hash for cache lookup (same logic as SlideThumbnails)
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

    // Capture current slide when index changes
    useEffect(() => {
      if (!isExporting || currentSlideIndex < 0 || currentSlideIndex >= slides.length) return;

      const captureSlide = async () => {
        const currentSlide = slides[currentSlideIndex];
        const hash = getContentHash(currentSlide);
        
        toast.info(`Capturing slide ${currentSlideIndex + 1}/${slides.length}...`, { id: "pdf-progress" });

        // Check if we have a cached thumbnail
        if (thumbnailCache && thumbnailCache[hash]) {
          console.log(`Using cached thumbnail for slide ${currentSlideIndex + 1}`);
          capturedImagesRef.current.push(thumbnailCache[hash]);
          
          // Move to next slide or finish
          if (currentSlideIndex < slides.length - 1) {
            setCurrentSlideIndex((prev) => prev + 1);
          } else {
            generatePdf(capturedImagesRef.current);
          }
          return;
        }

        // Wait for render to complete (same delay as thumbnail generator)
        await new Promise((resolve) => setTimeout(resolve, 800));

        if (!renderRef.current) {
          console.error("Render ref not available at slide", currentSlideIndex);
          // Try again after a short delay
          await new Promise((resolve) => setTimeout(resolve, 500));
          if (!renderRef.current) {
            onError(new Error("Render ref not available"));
            setIsExporting(false);
            return;
          }
        }

        try {
          // Use JPEG for smaller file size (same approach as thumbnails but with JPEG)
          const dataUrl = await toJpeg(renderRef.current, {
            cacheBust: true,
            pixelRatio: 1,
            width: DESIGN_WIDTH,
            height: DESIGN_HEIGHT,
            backgroundColor: getBgColor(),
            quality: 0.92,
          });

          capturedImagesRef.current.push(dataUrl);
          
          // Move to next slide or finish
          if (currentSlideIndex < slides.length - 1) {
            setCurrentSlideIndex((prev) => prev + 1);
          } else {
            // All slides captured, generate PDF
            generatePdf(capturedImagesRef.current);
          }
        } catch (error) {
          console.error(`Failed to capture slide ${currentSlideIndex + 1}:`, error);
          onError(error as Error);
          setIsExporting(false);
        }
      };

      captureSlide();
    }, [currentSlideIndex, isExporting, slides.length, theme, thumbnailCache]);

    const generatePdf = async (images: string[]) => {
      try {
        toast.info("Generating PDF...", { id: "pdf-progress" });

        // Create PDF at output resolution
        const pdf = new jsPDF({
          orientation: "landscape",
          unit: "px",
          format: [PDF_WIDTH, PDF_HEIGHT],
        });

        for (let i = 0; i < images.length; i++) {
          if (i > 0) {
            pdf.addPage([PDF_WIDTH, PDF_HEIGHT], "landscape");
          }
          // Scale the captured image to fill PDF page
          pdf.addImage(images[i], "JPEG", 0, 0, PDF_WIDTH, PDF_HEIGHT);
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
        capturedImagesRef.current = [];
      }
    };

    const bgColor = getBgColor();
    const shouldRenderSlide = isExporting && currentSlideIndex >= 0 && currentSlideIndex < slides.length;
    const currentSlide = shouldRenderSlide ? slides[currentSlideIndex] : null;
    
    // Check if we need to render (skip if using cached thumbnail)
    const needsRender = currentSlide && (!thumbnailCache || !thumbnailCache[getContentHash(currentSlide)]);

    // Always render container (for ref), but only show content when needed
    return (
      <div
        ref={renderRef}
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
          zIndex: -9999,
          visibility: needsRender ? "visible" : "hidden",
          pointerEvents: "none",
          overflow: "hidden",
          backgroundColor: bgColor,
        }}
      >
        {currentSlide && needsRender && (
          <SlideRenderer
            slide={currentSlide}
            layouts={layouts}
            theme={theme}
            fontScale={currentSlide.fontScale || 1}
            designWidth={DESIGN_WIDTH}
            designHeight={DESIGN_HEIGHT}
          />
        )}
      </div>
    );
  }
);

PdfExportRenderer.displayName = "PdfExportRenderer";
