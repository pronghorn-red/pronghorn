import { toPng } from "html-to-image";
import type { PptxSlide, PptxImage } from "./parsePptx";
import { SLIDE_WIDTH, SLIDE_HEIGHT } from "./parsePptx";

// ============================================================================
// PPTX Slide Renderer - Renders slides to HTML and rasterizes to PNG
// ============================================================================

export interface RasterizeOptions {
  width?: number;
  height?: number;
  pixelRatio?: number;
  backgroundColor?: string;
}

/**
 * Create an HTML element for a shape
 */
function createShapeElement(
  shape: PptxSlide["shapes"][0],
  media: Map<string, PptxImage>,
  scale: number
): HTMLElement {
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.left = `${shape.x * scale}px`;
  el.style.top = `${shape.y * scale}px`;
  el.style.width = `${shape.width * scale}px`;
  el.style.height = `${shape.height * scale}px`;
  el.style.overflow = "hidden";

  if (shape.type === "image" && shape.imageRef) {
    const img = media.get(shape.imageRef);
    if (img) {
      const imgEl = document.createElement("img");
      imgEl.src = `data:${img.mimeType};base64,${img.base64}`;
      imgEl.style.width = "100%";
      imgEl.style.height = "100%";
      imgEl.style.objectFit = "contain";
      el.appendChild(imgEl);
    }
  } else if (shape.type === "text" && shape.text) {
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.padding = `${4 * scale}px`;
    el.style.boxSizing = "border-box";
    el.style.wordBreak = "break-word";
    el.style.textAlign = "center";

    if (shape.fill) {
      el.style.backgroundColor = shape.fill;
    }

    const textEl = document.createElement("span");
    textEl.textContent = shape.text;
    textEl.style.fontFamily = "Calibri, Arial, sans-serif";
    textEl.style.fontSize = shape.fontSize
      ? `${shape.fontSize * scale}px`
      : `${14 * scale}px`;
    textEl.style.color = shape.fontColor || "#000000";
    textEl.style.fontWeight = shape.bold ? "bold" : "normal";
    textEl.style.fontStyle = shape.italic ? "italic" : "normal";
    textEl.style.lineHeight = "1.2";

    el.appendChild(textEl);
  } else if (shape.type === "shape") {
    if (shape.fill) {
      el.style.backgroundColor = shape.fill;
    } else {
      el.style.backgroundColor = "#E7E6E6";
    }
    el.style.borderRadius = `${4 * scale}px`;
  }

  return el;
}

/**
 * Check if any shapes are "renderable" (have non-zero dimensions or text)
 */
function hasRenderableShapes(shapes: PptxSlide["shapes"]): boolean {
  return shapes.some(shape => 
    (shape.width > 0 && shape.height > 0) || 
    (shape.type === "text" && shape.text && shape.text.trim().length > 0)
  );
}

/**
 * Render a slide to an HTML element (off-screen)
 */
export function renderSlideToHtml(
  slide: PptxSlide,
  media: Map<string, PptxImage>,
  options: { width?: number; height?: number } = {}
): HTMLDivElement {
  const width = options.width || SLIDE_WIDTH;
  const height = options.height || SLIDE_HEIGHT;
  const scale = width / SLIDE_WIDTH;

  const container = document.createElement("div");
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.position = "relative";
  container.style.backgroundColor = "#FFFFFF";
  container.style.overflow = "hidden";
  container.style.fontFamily = "Calibri, Arial, sans-serif";

  console.log(`[PPTX Renderer] Rendering slide ${slide.index + 1} with ${slide.shapes.length} shapes`);

  // Check if we have renderable shapes
  const renderableShapes = slide.shapes.filter(shape => 
    (shape.width > 0 && shape.height > 0) || 
    (shape.type === "text" && shape.text && shape.text.trim().length > 0)
  );

  console.log(`[PPTX Renderer] Renderable shapes: ${renderableShapes.length}`);

  // Render shapes in order (background to foreground)
  let shapesRendered = 0;
  for (const shape of slide.shapes) {
    // Skip shapes with zero dimensions and no text
    if (shape.width === 0 && shape.height === 0 && (!shape.text || shape.text.trim().length === 0)) {
      console.log(`[PPTX Renderer] Skipping zero-dimension shape without text`);
      continue;
    }
    
    const shapeEl = createShapeElement(shape, media, scale);
    container.appendChild(shapeEl);
    shapesRendered++;
  }

  console.log(`[PPTX Renderer] Shapes rendered: ${shapesRendered}`);

  // If no shapes rendered OR all shapes had zero dimensions, show placeholder with text content
  if (shapesRendered === 0 && slide.textContent.length > 0) {
    console.log(`[PPTX Renderer] Using text fallback with ${slide.textContent.length} text items`);
    const textContainer = document.createElement("div");
    textContainer.style.padding = `${20 * scale}px`;
    textContainer.style.fontSize = `${16 * scale}px`;
    textContainer.style.color = "#333";
    textContainer.style.fontFamily = "Calibri, Arial, sans-serif";
    textContainer.style.lineHeight = "1.5";
    textContainer.innerHTML = slide.textContent
      .map((t) => `<p style="margin: ${8 * scale}px 0;">${escapeHtml(t)}</p>`)
      .join("");
    container.appendChild(textContainer);
  }

  // Add slide number watermark
  const slideNum = document.createElement("div");
  slideNum.style.position = "absolute";
  slideNum.style.bottom = `${8 * scale}px`;
  slideNum.style.right = `${12 * scale}px`;
  slideNum.style.fontSize = `${10 * scale}px`;
  slideNum.style.color = "#999";
  slideNum.style.fontFamily = "Calibri, Arial, sans-serif";
  slideNum.textContent = `${slide.index + 1}`;
  container.appendChild(slideNum);

  console.log(`[PPTX Renderer] Container children: ${container.children.length}`);

  return container;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Wait for all images in an element to load
 */
async function waitForImages(container: HTMLElement): Promise<void> {
  const images = container.querySelectorAll("img");
  const promises = Array.from(images).map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve(); // Don't fail if image fails
      // Also add timeout to prevent hanging
      setTimeout(resolve, 2000);
    });
  });
  await Promise.all(promises);
}

/**
 * Rasterize an HTML element to a PNG blob
 */
export async function rasterizeElement(
  element: HTMLElement,
  options: RasterizeOptions = {}
): Promise<Blob> {
  const {
    width = SLIDE_WIDTH,
    height = SLIDE_HEIGHT,
    pixelRatio = 2,
    backgroundColor = "#FFFFFF",
  } = options;

  // Add element to DOM temporarily (required for html-to-image)
  // Use visibility instead of offscreen positioning for more reliable capture
  element.style.position = "fixed";
  element.style.left = "0";
  element.style.top = "0";
  element.style.zIndex = "-9999";
  element.style.opacity = "1";
  element.style.visibility = "visible";
  document.body.appendChild(element);

  // Debug: log the HTML content
  console.log("[PPTX Rasterizer] HTML to capture:", element.innerHTML.substring(0, 500));
  console.log("[PPTX Rasterizer] Element dimensions:", element.offsetWidth, "x", element.offsetHeight);

  try {
    // Wait for all images to load before capturing
    await waitForImages(element);
    
    // Small delay to ensure rendering is complete
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const dataUrl = await toPng(element, {
      width,
      height,
      pixelRatio,
      backgroundColor,
      cacheBust: true,
      style: {
        transform: "none",
        visibility: "visible",
        opacity: "1",
      },
    });

    // Convert data URL to Blob
    const response = await fetch(dataUrl);
    return response.blob();
  } finally {
    document.body.removeChild(element);
  }
}

/**
 * Rasterize a slide to a PNG blob
 */
export async function rasterizeSlide(
  slide: PptxSlide,
  media: Map<string, PptxImage>,
  options: RasterizeOptions = {}
): Promise<Blob> {
  const width = options.width || SLIDE_WIDTH;
  const height = options.height || SLIDE_HEIGHT;

  const element = renderSlideToHtml(slide, media, { width, height });
  return rasterizeElement(element, { ...options, width, height });
}

/**
 * Generate a thumbnail for a slide (smaller size for preview)
 */
export async function generateSlideThumbnail(
  slide: PptxSlide,
  media: Map<string, PptxImage>,
  size: { width: number; height: number } = { width: 192, height: 108 }
): Promise<string> {
  try {
    const blob = await rasterizeSlide(slide, media, {
      width: size.width,
      height: size.height,
      pixelRatio: 2,
    });

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn(`Failed to generate thumbnail for slide ${slide.index + 1}:`, error);
    return "";
  }
}

/**
 * Rasterize multiple slides and return as blobs
 */
export async function rasterizeSlides(
  slides: PptxSlide[],
  media: Map<string, PptxImage>,
  options: RasterizeOptions = {},
  onProgress?: (current: number, total: number) => void
): Promise<{ slide: PptxSlide; blob: Blob }[]> {
  const results: { slide: PptxSlide; blob: Blob }[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    onProgress?.(i + 1, slides.length);

    try {
      const blob = await rasterizeSlide(slide, media, options);
      results.push({ slide, blob });
    } catch (error) {
      console.warn(`Failed to rasterize slide ${slide.index + 1}:`, error);
    }
  }

  return results;
}
