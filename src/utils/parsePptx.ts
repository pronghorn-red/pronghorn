import JSZip from "jszip";

// ============================================================================
// PPTX Parser - Extracts text, images, and shape data from PowerPoint files
// ============================================================================

export interface PptxImage {
  id: string;
  filename: string;
  base64: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface PptxShape {
  type: "text" | "image" | "shape" | "chart";
  x: number;        // Position in pixels (converted from EMUs)
  y: number;
  width: number;
  height: number;
  text?: string;
  fill?: string;    // Background color (hex)
  imageRef?: string; // Reference to image in media
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface PptxSlide {
  index: number;
  title?: string;
  textContent: string[];        // All text runs from the slide
  mergedText: string;           // Concatenated text
  images: PptxImage[];          // Images referenced on this slide
  shapes: PptxShape[];          // Basic shape info for rendering
  notes?: string;               // Speaker notes
}

export interface PptxData {
  filename: string;
  slideCount: number;
  slides: PptxSlide[];
  media: Map<string, PptxImage>;  // All embedded media
  metadata: {
    title?: string;
    author?: string;
    created?: string;
  };
}

// EMU (English Metric Units) to pixels conversion
// 1 inch = 914400 EMUs, and we assume 96 DPI for screen
const EMU_TO_PX = 96 / 914400;

// Standard slide dimensions (16:9 aspect ratio at 96 DPI)
export const SLIDE_WIDTH = 960;
export const SLIDE_HEIGHT = 540;

// XML Namespaces used in PPTX
const NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
};

/**
 * Get MIME type from filename extension
 */
function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() || "";
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    tiff: "image/tiff",
    tif: "image/tiff",
    wmf: "image/x-wmf",
    emf: "image/x-emf",
    svg: "image/svg+xml",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Parse EMU value to pixels
 */
function emuToPx(emu: string | number): number {
  const value = typeof emu === "string" ? parseInt(emu, 10) : emu;
  if (isNaN(value)) return 0;
  return Math.round(value * EMU_TO_PX);
}

/**
 * Extract text from XML using getElementsByTagNameNS
 */
function extractTextFromXml(doc: Document): string[] {
  const texts: string[] = [];
  const textNodes = doc.getElementsByTagNameNS(NS.a, "t");
  
  for (let i = 0; i < textNodes.length; i++) {
    const text = textNodes[i].textContent?.trim();
    if (text) {
      texts.push(text);
    }
  }
  
  return texts;
}

/**
 * Parse color from PPTX XML (simplified)
 */
function parseColor(element: Element | null): string | undefined {
  if (!element) return undefined;
  
  // Try to find srgbClr (direct RGB color)
  const srgbClr = element.getElementsByTagNameNS(NS.a, "srgbClr")[0];
  if (srgbClr) {
    const val = srgbClr.getAttribute("val");
    if (val) return `#${val}`;
  }
  
  // Try schemeClr (theme color) - return a default
  const schemeClr = element.getElementsByTagNameNS(NS.a, "schemeClr")[0];
  if (schemeClr) {
    const val = schemeClr.getAttribute("val");
    // Map common scheme colors to hex
    const schemeMap: Record<string, string> = {
      tx1: "#000000",
      tx2: "#44546A",
      bg1: "#FFFFFF",
      bg2: "#E7E6E6",
      accent1: "#4472C4",
      accent2: "#ED7D31",
      accent3: "#A5A5A5",
      accent4: "#FFC000",
      accent5: "#5B9BD5",
      accent6: "#70AD47",
    };
    if (val && schemeMap[val]) return schemeMap[val];
  }
  
  return undefined;
}

/**
 * Parse relationships XML to map rId to target paths
 */
function parseRelationships(relsXml: string): Record<string, string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(relsXml, "application/xml");
  const rels: Record<string, string> = {};
  
  const relationships = doc.getElementsByTagName("Relationship");
  for (let i = 0; i < relationships.length; i++) {
    const rel = relationships[i];
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (id && target) {
      // Normalize the target path
      const normalizedTarget = target.replace(/^\.\.\//, "ppt/").replace(/^\//, "");
      rels[id] = normalizedTarget;
    }
  }
  
  return rels;
}

/**
 * Helper to find xfrm element with fallback for different namespaces
 */
function findXfrm(element: Element): { x: number; y: number; width: number; height: number } | null {
  // Try standard namespace first
  let xfrm = element.getElementsByTagNameNS(NS.a, "xfrm")[0];
  
  // Fallback: try querySelector without namespace
  if (!xfrm) {
    xfrm = element.querySelector("xfrm") as Element;
  }
  
  if (!xfrm) return null;
  
  // Try to get offset and extent
  let off = xfrm.getElementsByTagNameNS(NS.a, "off")[0];
  let ext = xfrm.getElementsByTagNameNS(NS.a, "ext")[0];
  
  // Fallback without namespace
  if (!off) off = xfrm.querySelector("off") as Element;
  if (!ext) ext = xfrm.querySelector("ext") as Element;
  
  // If still not found, return null
  if (!off || !ext) return null;
  
  const x = emuToPx(off.getAttribute("x") || "0");
  const y = emuToPx(off.getAttribute("y") || "0");
  const width = emuToPx(ext.getAttribute("cx") || "0");
  const height = emuToPx(ext.getAttribute("cy") || "0");
  
  return { x, y, width, height };
}

/**
 * Extract shapes from slide XML
 */
function extractShapesFromXml(doc: Document, rels: Record<string, string>): PptxShape[] {
  const shapes: PptxShape[] = [];
  
  // Find all sp (shape) elements
  const spElements = doc.getElementsByTagNameNS(NS.p, "sp");
  console.log(`[PPTX Parser] Found ${spElements.length} shape elements`);
  
  for (let i = 0; i < spElements.length; i++) {
    const sp = spElements[i];
    
    // Get transform (position and size) with fallback
    const transform = findXfrm(sp);
    
    // Extract text content regardless of transform
    const textContent: string[] = [];
    const textNodes = sp.getElementsByTagNameNS(NS.a, "t");
    for (let j = 0; j < textNodes.length; j++) {
      const text = textNodes[j].textContent?.trim();
      if (text) textContent.push(text);
    }
    
    // Skip if no transform AND no text
    if (!transform && textContent.length === 0) continue;
    
    // Use default dimensions if transform missing but we have text
    const x = transform?.x ?? 50;
    const y = transform?.y ?? 50 + i * 60;
    const width = transform?.width ?? SLIDE_WIDTH - 100;
    const height = transform?.height ?? 50;
    
    console.log(`[PPTX Parser] Shape ${i}: x=${x}, y=${y}, w=${width}, h=${height}, text="${textContent.join(" ").substring(0, 30)}..."`);
    
    // Get fill color
    const solidFill = sp.getElementsByTagNameNS(NS.a, "solidFill")[0];
    const fill = parseColor(solidFill);
    
    // Get font properties from first run
    const rPr = sp.getElementsByTagNameNS(NS.a, "rPr")[0];
    let fontSize: number | undefined;
    let fontColor: string | undefined;
    let bold = false;
    let italic = false;
    
    if (rPr) {
      const sz = rPr.getAttribute("sz");
      if (sz) fontSize = parseInt(sz, 10) / 100; // sz is in hundredths of a point
      
      bold = rPr.getAttribute("b") === "1";
      italic = rPr.getAttribute("i") === "1";
      
      const solidFillRpr = rPr.getElementsByTagNameNS(NS.a, "solidFill")[0];
      fontColor = parseColor(solidFillRpr);
    }
    
    shapes.push({
      type: "text",
      x,
      y,
      width,
      height,
      text: textContent.join(" "),
      fill,
      fontSize,
      fontColor,
      bold,
      italic,
    });
  }
  
  // Find all pic (picture) elements
  const picElements = doc.getElementsByTagNameNS(NS.p, "pic");
  console.log(`[PPTX Parser] Found ${picElements.length} picture elements`);
  
  for (let i = 0; i < picElements.length; i++) {
    const pic = picElements[i];
    
    // Get transform with fallback
    const transform = findXfrm(pic);
    if (!transform) continue;
    
    const { x, y, width, height } = transform;
    
    // Get image reference
    const blip = pic.getElementsByTagNameNS(NS.a, "blip")[0];
    let imageRef: string | undefined;
    
    if (blip) {
      const embedId = blip.getAttributeNS(NS.r, "embed");
      if (embedId && rels[embedId]) {
        // Extract just the filename from the path
        imageRef = rels[embedId].split("/").pop();
      }
    }
    
    shapes.push({
      type: "image",
      x,
      y,
      width,
      height,
      imageRef,
    });
  }
  
  console.log(`[PPTX Parser] Total shapes extracted: ${shapes.length}`);
  return shapes;
}

/**
 * Extract all media files from the PPTX
 */
async function extractMedia(zip: JSZip): Promise<Map<string, PptxImage>> {
  const media = new Map<string, PptxImage>();
  
  const mediaFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith("ppt/media/") && !zip.files[name].dir
  );
  
  for (const filePath of mediaFiles) {
    const file = zip.file(filePath);
    if (file) {
      try {
        const base64 = await file.async("base64");
        const filename = filePath.split("/").pop() || "";
        const mimeType = getMimeType(filename);
        
        media.set(filename, {
          id: filename,
          filename,
          base64,
          mimeType,
        });
      } catch (error) {
        console.warn(`Failed to extract media file: ${filePath}`, error);
      }
    }
  }
  
  return media;
}

/**
 * Extract metadata from core.xml
 */
async function extractMetadata(zip: JSZip): Promise<PptxData["metadata"]> {
  const metadata: PptxData["metadata"] = {};
  
  try {
    const coreFile = zip.file("docProps/core.xml");
    if (coreFile) {
      const coreXml = await coreFile.async("string");
      const parser = new DOMParser();
      const doc = parser.parseFromString(coreXml, "application/xml");
      
      // Extract common metadata fields
      const titleEl = doc.getElementsByTagName("dc:title")[0];
      if (titleEl?.textContent) metadata.title = titleEl.textContent;
      
      const creatorEl = doc.getElementsByTagName("dc:creator")[0];
      if (creatorEl?.textContent) metadata.author = creatorEl.textContent;
      
      const createdEl = doc.getElementsByTagName("dcterms:created")[0];
      if (createdEl?.textContent) metadata.created = createdEl.textContent;
    }
  } catch (error) {
    console.warn("Failed to extract metadata:", error);
  }
  
  return metadata;
}

/**
 * Get slide count from presentation.xml
 */
async function getSlideCount(zip: JSZip): Promise<number> {
  const slideFiles = Object.keys(zip.files).filter(
    (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)
  );
  return slideFiles.length;
}

/**
 * Parse a single slide
 */
async function parseSlide(
  zip: JSZip,
  slideIndex: number,
  media: Map<string, PptxImage>
): Promise<PptxSlide> {
  const slidePath = `ppt/slides/slide${slideIndex + 1}.xml`;
  const relsPath = `ppt/slides/_rels/slide${slideIndex + 1}.xml.rels`;
  
  const slideFile = zip.file(slidePath);
  if (!slideFile) {
    throw new Error(`Slide not found: ${slidePath}`);
  }
  
  const slideXml = await slideFile.async("string");
  const parser = new DOMParser();
  const doc = parser.parseFromString(slideXml, "application/xml");
  
  // Parse relationships for this slide
  let rels: Record<string, string> = {};
  const relsFile = zip.file(relsPath);
  if (relsFile) {
    const relsXml = await relsFile.async("string");
    rels = parseRelationships(relsXml);
  }
  
  // Extract text content
  const textContent = extractTextFromXml(doc);
  
  // Extract shapes
  const shapes = extractShapesFromXml(doc, rels);
  
  // Find images used in this slide
  const slideImages: PptxImage[] = [];
  for (const shape of shapes) {
    if (shape.type === "image" && shape.imageRef) {
      const img = media.get(shape.imageRef);
      if (img) {
        slideImages.push(img);
      }
    }
  }
  
  // Try to find slide title (usually first text in title placeholder)
  let title: string | undefined;
  const titleShapes = doc.querySelectorAll('[type="title"], [type="ctrTitle"]');
  if (titleShapes.length > 0) {
    const titleTexts = titleShapes[0].getElementsByTagNameNS(NS.a, "t");
    if (titleTexts.length > 0) {
      title = titleTexts[0].textContent || undefined;
    }
  }
  // Fallback: use first text as title
  if (!title && textContent.length > 0) {
    title = textContent[0];
  }
  
  return {
    index: slideIndex,
    title,
    textContent,
    mergedText: textContent.join("\n"),
    images: slideImages,
    shapes,
  };
}

/**
 * Main entry point - parse a PPTX file
 */
export async function parsePptxFile(file: File): Promise<PptxData> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  // Extract metadata
  const metadata = await extractMetadata(zip);
  
  // Extract all media
  const media = await extractMedia(zip);
  
  // Get slide count
  const slideCount = await getSlideCount(zip);
  
  // Parse each slide
  const slides: PptxSlide[] = [];
  for (let i = 0; i < slideCount; i++) {
    try {
      const slide = await parseSlide(zip, i, media);
      slides.push(slide);
    } catch (error) {
      console.warn(`Failed to parse slide ${i + 1}:`, error);
      // Add a placeholder slide
      slides.push({
        index: i,
        title: `Slide ${i + 1} (Error)`,
        textContent: [],
        mergedText: "",
        images: [],
        shapes: [],
      });
    }
  }
  
  return {
    filename: file.name,
    slideCount,
    slides,
    media,
    metadata,
  };
}

/**
 * Get all text from a PPTX as a single merged string
 */
export function getAllText(data: PptxData, separator = "\n\n"): string {
  return data.slides
    .map((slide, idx) => {
      const slideHeader = `--- Slide ${idx + 1}${slide.title ? `: ${slide.title}` : ""} ---`;
      return `${slideHeader}\n${slide.mergedText}`;
    })
    .join(separator);
}

/**
 * Get text per slide as separate strings
 */
export function getTextPerSlide(data: PptxData): { index: number; title: string; text: string }[] {
  return data.slides.map((slide) => ({
    index: slide.index,
    title: slide.title || `Slide ${slide.index + 1}`,
    text: slide.mergedText,
  }));
}
