import { toPng } from "html-to-image";
import jsPDF from "jspdf";

interface Slide {
  id: string;
  order: number;
  layoutId: string;
  title: string;
  subtitle?: string;
  content: any[];
  notes?: string;
  imageUrl?: string;
  fontScale?: number;
}

export async function exportPresentationToPdf(
  presentationName: string,
  slides: Slide[],
  renderSlideToElement: (slideIndex: number) => HTMLElement | null,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  // Create PDF in 16:9 landscape (1920x1080 aspect ratio)
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [1920, 1080],
  });

  const totalSlides = slides.length;

  for (let i = 0; i < totalSlides; i++) {
    onProgress?.(i + 1, totalSlides);

    const element = renderSlideToElement(i);
    if (!element) continue;

    try {
      // Capture slide as PNG
      const dataUrl = await toPng(element, {
        width: 1920,
        height: 1080,
        pixelRatio: 2,
        backgroundColor: "#1a1f2e", // Match dark theme background
      });

      // Add page (except for first slide)
      if (i > 0) {
        pdf.addPage([1920, 1080], "landscape");
      }

      // Add image to PDF
      pdf.addImage(dataUrl, "PNG", 0, 0, 1920, 1080);
    } catch (error) {
      console.error(`Failed to capture slide ${i + 1}:`, error);
    }
  }

  // Download PDF
  const fileName = `${presentationName.replace(/\s+/g, "_")}.pdf`;
  pdf.save(fileName);
}

export async function exportSlideToPng(
  element: HTMLElement,
  fileName: string
): Promise<void> {
  try {
    const dataUrl = await toPng(element, {
      width: 1920,
      height: 1080,
      pixelRatio: 2,
    });

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error("Failed to export slide:", error);
    throw error;
  }
}
