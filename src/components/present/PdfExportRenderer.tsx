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

// PDF export at full HD resolution
const PDF_WIDTH = 1920;
const PDF_HEIGHT = 1080;

export const PdfExportRenderer = forwardRef<PdfExportRendererRef, PdfExportRendererProps>(
  ({ slides, layouts, presentationName, theme = "default", onComplete, onError }, ref) => {
    const [isExporting, setIsExporting] = useState(false);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(-1);
    const renderRef = useRef<HTMLDivElement>(null);
    const capturedImagesRef = useRef<string[]>([]);
    const isMountedRef = useRef(false);

    useEffect(() => {
      isMountedRef.current = true;
      return () => { isMountedRef.current = false; };
    }, []);

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

    // Capture current slide when index changes
    useEffect(() => {
      if (!isExporting || currentSlideIndex < 0 || currentSlideIndex >= slides.length) return;

      const captureSlide = async () => {
        // Wait for render to complete
        await new Promise((resolve) => setTimeout(resolve, 1000));

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
          toast.info(`Capturing slide ${currentSlideIndex + 1}/${slides.length}...`, { id: "pdf-progress" });

          const bgColor = theme === "light" ? "#ffffff" : theme === "vibrant" ? "#1a0d26" : "#1e293b";
          
          const dataUrl = await toPng(renderRef.current, {
            cacheBust: true,
            pixelRatio: 1,
            width: PDF_WIDTH,
            height: PDF_HEIGHT,
            backgroundColor: bgColor,
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
    }, [currentSlideIndex, isExporting, slides.length, theme]);

    const generatePdf = async (images: string[]) => {
      try {
        toast.info("Generating PDF...", { id: "pdf-progress" });

        const pdf = new jsPDF({
          orientation: "landscape",
          unit: "px",
          format: [PDF_WIDTH, PDF_HEIGHT],
        });

        for (let i = 0; i < images.length; i++) {
          if (i > 0) {
            pdf.addPage([PDF_WIDTH, PDF_HEIGHT], "landscape");
          }
          pdf.addImage(images[i], "PNG", 0, 0, PDF_WIDTH, PDF_HEIGHT);
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

    const bgColor = theme === "light" ? "#ffffff" : theme === "vibrant" ? "#1a0d26" : "#1e293b";
    const shouldRenderSlide = isExporting && currentSlideIndex >= 0 && currentSlideIndex < slides.length;
    const currentSlide = shouldRenderSlide ? slides[currentSlideIndex] : null;

    // Always render container (for ref), but only show content when exporting
    return (
      <div
        ref={renderRef}
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: PDF_WIDTH,
          height: PDF_HEIGHT,
          zIndex: -9999,
          visibility: shouldRenderSlide ? "visible" : "hidden",
          pointerEvents: "none",
          overflow: "hidden",
          backgroundColor: bgColor,
        }}
      >
        {currentSlide && (
          <SlideRenderer
            slide={currentSlide}
            layouts={layouts}
            theme={theme}
            fontScale={currentSlide.fontScale || 1}
            designWidth={PDF_WIDTH}
            designHeight={PDF_HEIGHT}
          />
        )}
      </div>
    );
  }
);

PdfExportRenderer.displayName = "PdfExportRenderer";
