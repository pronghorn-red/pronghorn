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

// Rich text formatting for individual text runs
export interface PptxTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;    // in points
  fontColor?: string;   // hex color
  fontFamily?: string;
}

// Paragraph with multiple runs and formatting
export interface PptxParagraph {
  runs: PptxTextRun[];
  alignment?: 'left' | 'center' | 'right' | 'justify';
  bulletType?: 'none' | 'bullet' | 'number';
  bulletChar?: string;
  level?: number;       // indentation level (0-8)
  spaceBefore?: number; // spacing in points
  spaceAfter?: number;
}

export interface PptxShape {
  type: "text" | "image" | "shape" | "chart";
  x: number;        // Position in pixels (converted from EMUs)
  y: number;
  width: number;
  height: number;
  text?: string;    // Backward compat: concatenated text
  paragraphs?: PptxParagraph[];  // Rich text paragraphs
  fill?: string;    // Background color (hex)
  imageRef?: string; // Reference to image in media
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  placeholderType?: 'title' | 'ctrTitle' | 'subTitle' | 'body' | 'ftr' | 'dt' | 'sldNum' | 'pic' | 'other';
}

export interface PptxSlide {
  index: number;
  title?: string;
  textContent: string[];        // All text runs from the slide
  mergedText: string;           // Concatenated text
  images: PptxImage[];          // Images referenced on this slide
  shapes: PptxShape[];          // Basic shape info for rendering
  notes?: string;               // Speaker notes
  backgroundColor?: string;     // Slide background color (hex)
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
 * Parse EMU value to points (for font sizes)
 */
function emuToPoints(emu: string | number): number {
  const value = typeof emu === "string" ? parseInt(emu, 10) : emu;
  if (isNaN(value)) return 0;
  // 1 point = 12700 EMUs
  return Math.round(value / 12700);
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

// Theme colors cache - will be populated when parsing starts
let themeColors: Record<string, string> = {};

// Color map from slide master - maps scheme colors like 'bg1' to theme colors like 'lt1'
let colorMap: Record<string, string> = {};

/**
 * Parse ALL theme files to extract color values
 * Iterates through ppt/theme/theme*.xml files
 */
async function parseThemeColors(zip: JSZip): Promise<Record<string, string>> {
  const colors: Record<string, string> = {};
  const parser = new DOMParser();
  
  try {
    // Find ALL theme files in the theme folder
    const themeFiles = Object.keys(zip.files).filter(f => 
      f.startsWith("ppt/theme/theme") && f.endsWith(".xml") && !f.includes("_rels")
    );
    
    console.log(`[PPTX Parser] Found ${themeFiles.length} theme files:`, themeFiles);
    
    for (const themePath of themeFiles) {
      const themeFile = zip.file(themePath);
      if (!themeFile) continue;
      
      const themeXml = await themeFile.async("string");
      const doc = parser.parseFromString(themeXml, "application/xml");
      
      // Parse clrScheme for actual scheme color values
      const clrScheme = doc.getElementsByTagNameNS(NS.a, "clrScheme")[0];
      if (!clrScheme) continue;
      
      // Standard Office color scheme names
      const colorNames = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
      
      for (const name of colorNames) {
        // Skip if we already have this color
        if (colors[name]) continue;
        
        // Find element by local name within clrScheme
        const children = clrScheme.children;
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (child.localName === name) {
            // Check for srgbClr
            const srgb = child.getElementsByTagNameNS(NS.a, "srgbClr")[0];
            if (srgb) {
              const val = srgb.getAttribute("val");
              if (val) colors[name] = `#${val}`;
            }
            // Check for sysClr (system color)
            const sysClr = child.getElementsByTagNameNS(NS.a, "sysClr")[0];
            if (sysClr && !colors[name]) {
              const lastClr = sysClr.getAttribute("lastClr");
              if (lastClr) colors[name] = `#${lastClr}`;
            }
            break;
          }
        }
      }
    }
    
    console.log("[PPTX Parser] Parsed theme colors:", colors);
  } catch (error) {
    console.warn("Failed to parse theme colors:", error);
  }
  
  return colors;
}

/**
 * Parse clrMap from slide master to map scheme colors (like bg1) to theme colors (like lt1)
 * Iterates through all slideMasters in ppt/slideMasters/
 */
async function parseColorMapFromMasters(zip: JSZip): Promise<Record<string, string>> {
  const clrMap: Record<string, string> = {};
  const parser = new DOMParser();
  
  try {
    // Find ALL slideMaster files
    const masterFiles = Object.keys(zip.files).filter(f => 
      f.startsWith("ppt/slideMasters/slideMaster") && f.endsWith(".xml") && !f.includes("_rels")
    );
    
    console.log(`[PPTX Parser] Found ${masterFiles.length} slide master files:`, masterFiles);
    
    for (const masterPath of masterFiles) {
      const masterFile = zip.file(masterPath);
      if (!masterFile) continue;
      
      const masterXml = await masterFile.async("string");
      const doc = parser.parseFromString(masterXml, "application/xml");
      
      // Find clrMap element
      const clrMapEl = doc.getElementsByTagNameNS(NS.p, "clrMap")[0];
      if (clrMapEl) {
        // Extract all color mappings: bg1, bg2, tx1, tx2, accent1-6, hlink, folHlink
        const attributes = ['bg1', 'bg2', 'tx1', 'tx2', 'accent1', 'accent2', 'accent3', 
                           'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
        for (const attr of attributes) {
          const val = clrMapEl.getAttribute(attr);
          if (val && !clrMap[attr]) {
            clrMap[attr] = val;
          }
        }
        console.log(`[PPTX Parser] Parsed clrMap from ${masterPath}:`, clrMap);
        break; // Use first master's clrMap
      }
    }
  } catch (error) {
    console.warn("Failed to parse color map from masters:", error);
  }
  
  return clrMap;
}

// Cache for placeholder positions from slide masters and layouts
interface PlaceholderPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}
let placeholderPositions: Map<string, PlaceholderPosition> = new Map();

// Per-layout placeholder styles (includes font info)
interface PlaceholderStyle {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;      // in points
  fontColor?: string;     // resolved hex color
  alignment?: 'left' | 'center' | 'right' | 'justify';
  verticalAlign?: 'top' | 'middle' | 'bottom';
}

/**
 * Parse placeholder positions from slide masters
 * These are used when a shape doesn't have its own transform
 */
async function parsePlaceholderPositions(zip: JSZip): Promise<void> {
  const parser = new DOMParser();
  placeholderPositions.clear();
  
  // Find all slide master files
  const masterFiles = Object.keys(zip.files).filter(f => 
    f.startsWith("ppt/slideMasters/slideMaster") && f.endsWith(".xml") && !f.includes("_rels")
  );
  
  console.log(`[PPTX Parser] Parsing placeholder positions from ${masterFiles.length} slide masters`);
  
  for (const masterPath of masterFiles) {
    const masterFile = zip.file(masterPath);
    if (!masterFile) continue;
    
    try {
      const xml = await masterFile.async("string");
      const doc = parser.parseFromString(xml, "application/xml");
      
      // Find sp elements with ph (placeholder) elements
      const spElements = doc.getElementsByTagNameNS(NS.p, "sp");
      for (let i = 0; i < spElements.length; i++) {
        const sp = spElements[i];
        const nvSpPr = sp.getElementsByTagNameNS(NS.p, "nvSpPr")[0];
        if (!nvSpPr) continue;
        
        const nvPr = nvSpPr.getElementsByTagNameNS(NS.p, "nvPr")[0];
        if (!nvPr) continue;
        
        const ph = nvPr.getElementsByTagNameNS(NS.p, "ph")[0];
        if (!ph) continue;
        
        const phType = ph.getAttribute("type") || "body";
        
        // Only store if we don't already have this type (first master wins)
        if (placeholderPositions.has(phType)) continue;
        
        // Get position from xfrm
        const transform = findXfrm(sp);
        if (transform) {
          placeholderPositions.set(phType, {
            x: transform.x,
            y: transform.y,
            width: transform.width,
            height: transform.height,
          });
          console.log(`[PPTX Parser] Placeholder '${phType}' position: x=${transform.x}, y=${transform.y}, w=${transform.width}, h=${transform.height}`);
        }
      }
    } catch (error) {
      console.warn(`Failed to parse placeholder positions from ${masterPath}:`, error);
    }
  }
  
  // Also parse slide layouts for more specific placeholder positions
  const layoutFiles = Object.keys(zip.files).filter(f => 
    f.startsWith("ppt/slideLayouts/slideLayout") && f.endsWith(".xml") && !f.includes("_rels")
  );
  
  console.log(`[PPTX Parser] Parsing placeholder positions from ${layoutFiles.length} slide layouts`);
  
  for (const layoutPath of layoutFiles) {
    const layoutFile = zip.file(layoutPath);
    if (!layoutFile) continue;
    
    try {
      const xml = await layoutFile.async("string");
      const doc = parser.parseFromString(xml, "application/xml");
      
      // Find sp elements with ph (placeholder) elements
      const spElements = doc.getElementsByTagNameNS(NS.p, "sp");
      for (let i = 0; i < spElements.length; i++) {
        const sp = spElements[i];
        const nvSpPr = sp.getElementsByTagNameNS(NS.p, "nvSpPr")[0];
        if (!nvSpPr) continue;
        
        const nvPr = nvSpPr.getElementsByTagNameNS(NS.p, "nvPr")[0];
        if (!nvPr) continue;
        
        const ph = nvPr.getElementsByTagNameNS(NS.p, "ph")[0];
        if (!ph) continue;
        
        const phType = ph.getAttribute("type") || "body";
        
        // Get position from xfrm (layouts can override master positions)
        const transform = findXfrm(sp);
        if (transform && transform.width > 0 && transform.height > 0) {
          // Only override if we have valid dimensions
          placeholderPositions.set(phType, {
            x: transform.x,
            y: transform.y,
            width: transform.width,
            height: transform.height,
          });
        }
      }
    } catch (error) {
      console.warn(`Failed to parse placeholder positions from ${layoutPath}:`, error);
    }
  }
  
  console.log(`[PPTX Parser] Total placeholder positions cached:`, Object.fromEntries(placeholderPositions));
}

/**
 * Parse placeholder styles from a specific slide layout XML
 * Extracts position, font color, font size, alignment for each placeholder type
 */
async function parseLayoutPlaceholderStyles(
  zip: JSZip,
  layoutPath: string
): Promise<Map<string, PlaceholderStyle>> {
  const styles = new Map<string, PlaceholderStyle>();
  const parser = new DOMParser();
  
  const layoutFile = zip.file(layoutPath);
  if (!layoutFile) {
    console.log(`[PPTX Parser] Layout file not found: ${layoutPath}`);
    return styles;
  }
  
  try {
    const xml = await layoutFile.async("string");
    const doc = parser.parseFromString(xml, "application/xml");
    
    // Find all shape elements with placeholders
    const spElements = doc.getElementsByTagNameNS(NS.p, "sp");
    
    for (let i = 0; i < spElements.length; i++) {
      const sp = spElements[i];
      
      // Check for placeholder type
      const nvSpPr = sp.getElementsByTagNameNS(NS.p, "nvSpPr")[0];
      if (!nvSpPr) continue;
      
      const nvPr = nvSpPr.getElementsByTagNameNS(NS.p, "nvPr")[0];
      if (!nvPr) continue;
      
      const ph = nvPr.getElementsByTagNameNS(NS.p, "ph")[0];
      if (!ph) continue;
      
      const phType = ph.getAttribute("type") || "body";
      
      // Extract position
      const transform = findXfrm(sp);
      
      // Extract default text properties from lstStyle or txBody
      const txBody = sp.getElementsByTagNameNS(NS.p, "txBody")[0];
      let fontSize: number | undefined;
      let fontColor: string | undefined;
      let alignment: 'left' | 'center' | 'right' | 'justify' | undefined;
      let verticalAlign: 'top' | 'middle' | 'bottom' | undefined;
      
      if (txBody) {
        // Get lstStyle which defines default paragraph/run properties
        const lstStyle = txBody.getElementsByTagNameNS(NS.a, "lstStyle")[0];
        if (lstStyle) {
          // Look for lvl1pPr (level 1 paragraph properties) first
          const lvl1pPr = lstStyle.getElementsByTagNameNS(NS.a, "lvl1pPr")[0];
          if (lvl1pPr) {
            // Get alignment
            const algn = lvl1pPr.getAttribute("algn");
            if (algn) {
              alignment = { l: 'left', ctr: 'center', r: 'right', just: 'justify' }[algn] as typeof alignment;
            }
            
            // Get default run properties (defRPr)
            const defRPr = lvl1pPr.getElementsByTagNameNS(NS.a, "defRPr")[0];
            if (defRPr) {
              // Font size (sz is in hundredths of a point)
              const sz = defRPr.getAttribute("sz");
              if (sz) fontSize = parseInt(sz, 10) / 100;
              
              // Font color from solidFill
              const solidFill = defRPr.getElementsByTagNameNS(NS.a, "solidFill")[0];
              fontColor = parseColor(solidFill);
            }
          }
        }
        
        // Get vertical alignment from bodyPr
        const bodyPr = txBody.getElementsByTagNameNS(NS.a, "bodyPr")[0];
        if (bodyPr) {
          const anchor = bodyPr.getAttribute("anchor");
          if (anchor === "t") verticalAlign = 'top';
          else if (anchor === "ctr") verticalAlign = 'middle';
          else if (anchor === "b") verticalAlign = 'bottom';
        }
      }
      
      // Store the style
      styles.set(phType, {
        x: transform?.x ?? 0,
        y: transform?.y ?? 0,
        width: transform?.width ?? SLIDE_WIDTH,
        height: transform?.height ?? 100,
        fontSize,
        fontColor,
        alignment,
        verticalAlign,
      });
      
      console.log(`[PPTX Parser] Layout placeholder '${phType}': fontColor=${fontColor}, fontSize=${fontSize}, pos=(${transform?.x}, ${transform?.y})`);
    }
  } catch (error) {
    console.warn(`Failed to parse layout placeholder styles from ${layoutPath}:`, error);
  }
  
  return styles;
}

/**
 * Resolve a scheme color using clrMap and themeColors
 * For example: bg1 -> lt1 (via clrMap) -> #FFFFFF (via themeColors)
 */
function resolveSchemeColor(schemeColorName: string): string | undefined {
  // First, check if we have a mapping in colorMap (e.g., bg1 -> lt1)
  const mappedName = colorMap[schemeColorName] || schemeColorName;
  
  // Then look up the actual color value
  if (themeColors[mappedName]) {
    return themeColors[mappedName];
  }
  
  // Also check if original name has a direct color
  if (themeColors[schemeColorName]) {
    return themeColors[schemeColorName];
  }
  
  return undefined;
}

/**
 * Parse color from PPTX XML with theme color and clrMap support
 */
function parseColor(element: Element | null): string | undefined {
  if (!element) return undefined;
  
  // Try to find srgbClr (direct RGB color)
  const srgbClr = element.getElementsByTagNameNS(NS.a, "srgbClr")[0];
  if (srgbClr) {
    const val = srgbClr.getAttribute("val");
    if (val) return `#${val}`;
  }
  
  // Try schemeClr (theme color) - resolve via clrMap and theme colors
  const schemeClr = element.getElementsByTagNameNS(NS.a, "schemeClr")[0];
  if (schemeClr) {
    const val = schemeClr.getAttribute("val");
    if (val) {
      const resolved = resolveSchemeColor(val);
      if (resolved) return resolved;
    }
    
    // Fallback map if theme parsing didn't work
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
      lt1: "#FFFFFF",
      lt2: "#E7E6E6",
      dk1: "#000000",
      dk2: "#44546A",
    };
    if (val && schemeMap[val]) return schemeMap[val];
  }
  
  return undefined;
}

/**
 * Parse color from gradient fill - extract first color stop
 */
function parseGradientColor(element: Element | null): string | undefined {
  if (!element) return undefined;
  
  const gradFill = element.getElementsByTagNameNS(NS.a, "gradFill")[0];
  if (!gradFill) return undefined;
  
  const gsLst = gradFill.getElementsByTagNameNS(NS.a, "gsLst")[0];
  if (!gsLst) return undefined;
  
  // Get first gradient stop
  const gsElements = gsLst.getElementsByTagNameNS(NS.a, "gs");
  if (gsElements.length === 0) return undefined;
  
  const firstGs = gsElements[0];
  
  // Try srgbClr in the gradient stop
  const srgbClr = firstGs.getElementsByTagNameNS(NS.a, "srgbClr")[0];
  if (srgbClr) {
    const val = srgbClr.getAttribute("val");
    if (val) return `#${val}`;
  }
  
  // Try schemeClr in gradient stop
  const schemeClr = firstGs.getElementsByTagNameNS(NS.a, "schemeClr")[0];
  if (schemeClr) {
    const val = schemeClr.getAttribute("val");
    if (val && themeColors[val]) return themeColors[val];
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
 * Extract paragraphs with rich text formatting from a shape element
 */
function extractParagraphsFromShape(sp: Element): PptxParagraph[] {
  const paragraphs: PptxParagraph[] = [];
  
  // Find txBody (text body) element
  const txBody = sp.getElementsByTagNameNS(NS.p, "txBody")[0] || 
                 sp.getElementsByTagNameNS(NS.a, "txBody")[0];
  
  if (!txBody) return paragraphs;
  
  // Get all paragraph elements
  const pElements = txBody.getElementsByTagNameNS(NS.a, "p");
  
  for (let i = 0; i < pElements.length; i++) {
    const pEl = pElements[i];
    const paragraph: PptxParagraph = { runs: [] };
    
    // Parse paragraph properties (pPr)
    const pPr = pEl.getElementsByTagNameNS(NS.a, "pPr")[0];
    if (pPr) {
      // Alignment
      const algn = pPr.getAttribute("algn");
      if (algn) {
        const alignMap: Record<string, 'left' | 'center' | 'right' | 'justify'> = {
          l: 'left',
          ctr: 'center',
          r: 'right',
          just: 'justify',
        };
        paragraph.alignment = alignMap[algn] || 'left';
      }
      
      // Indentation level
      const lvl = pPr.getAttribute("lvl");
      if (lvl) {
        paragraph.level = parseInt(lvl, 10);
      }
      
      // Check for bullet
      const buNone = pPr.getElementsByTagNameNS(NS.a, "buNone")[0];
      const buChar = pPr.getElementsByTagNameNS(NS.a, "buChar")[0];
      const buAutoNum = pPr.getElementsByTagNameNS(NS.a, "buAutoNum")[0];
      
      if (buNone) {
        paragraph.bulletType = 'none';
      } else if (buAutoNum) {
        paragraph.bulletType = 'number';
      } else if (buChar) {
        paragraph.bulletType = 'bullet';
        paragraph.bulletChar = buChar.getAttribute("char") || "•";
      } else {
        // Default: check if there's a default bullet (common in PPT)
        // If level > 0, assume bullet
        if (paragraph.level && paragraph.level > 0) {
          paragraph.bulletType = 'bullet';
          paragraph.bulletChar = "•";
        }
      }
      
      // Spacing
      const spcBef = pPr.getElementsByTagNameNS(NS.a, "spcBef")[0];
      const spcAft = pPr.getElementsByTagNameNS(NS.a, "spcAft")[0];
      
      if (spcBef) {
        const spcPts = spcBef.getElementsByTagNameNS(NS.a, "spcPts")[0];
        if (spcPts) {
          const val = spcPts.getAttribute("val");
          if (val) paragraph.spaceBefore = parseInt(val, 10) / 100;
        }
      }
      
      if (spcAft) {
        const spcPts = spcAft.getElementsByTagNameNS(NS.a, "spcPts")[0];
        if (spcPts) {
          const val = spcPts.getAttribute("val");
          if (val) paragraph.spaceAfter = parseInt(val, 10) / 100;
        }
      }
    }
    
    // Get all run elements (r) and field elements (fld)
    const children = pEl.children;
    for (let j = 0; j < children.length; j++) {
      const child = children[j];
      const localName = child.localName;
      
      if (localName === "r" || localName === "fld") {
        const run: PptxTextRun = { text: "" };
        
        // Get text content
        const tEl = child.getElementsByTagNameNS(NS.a, "t")[0];
        if (tEl && tEl.textContent) {
          run.text = tEl.textContent;
        }
        
        // Skip empty runs
        if (!run.text) continue;
        
        // Get run properties (rPr)
        const rPr = child.getElementsByTagNameNS(NS.a, "rPr")[0];
        if (rPr) {
          // Bold
          const b = rPr.getAttribute("b");
          run.bold = b === "1" || b === "true";
          
          // Italic
          const i = rPr.getAttribute("i");
          run.italic = i === "1" || i === "true";
          
          // Underline
          const u = rPr.getAttribute("u");
          run.underline = u !== null && u !== "none";
          
          // Font size (sz is in hundredths of a point)
          const sz = rPr.getAttribute("sz");
          if (sz) {
            run.fontSize = parseInt(sz, 10) / 100;
          }
          
          // Font color
          const solidFill = rPr.getElementsByTagNameNS(NS.a, "solidFill")[0];
          run.fontColor = parseColor(solidFill);
          
          // Font family
          const latin = rPr.getElementsByTagNameNS(NS.a, "latin")[0];
          if (latin) {
            run.fontFamily = latin.getAttribute("typeface") || undefined;
          }
        }
        
        paragraph.runs.push(run);
      }
    }
    
    // Only add paragraph if it has content
    if (paragraph.runs.length > 0) {
      paragraphs.push(paragraph);
    }
  }
  
  return paragraphs;
}

/**
 * Extract background color from a bgPr or bgRef element
 */
function extractBackgroundFromBg(bg: Element): string | undefined {
  // Check bgPr (background properties)
  const bgPr = bg.getElementsByTagNameNS(NS.p, "bgPr")[0];
  if (bgPr) {
    // Try solid fill first
    const solidFill = bgPr.getElementsByTagNameNS(NS.a, "solidFill")[0];
    const solidColor = parseColor(solidFill);
    if (solidColor) return solidColor;
    
    // Try gradient fill - extract first color
    const gradColor = parseGradientColor(bgPr);
    if (gradColor) return gradColor;
  }
  
  // Check bgRef (background reference to theme fill)
  const bgRef = bg.getElementsByTagNameNS(NS.p, "bgRef")[0];
  if (bgRef) {
    // bgRef may have embedded color
    const color = parseColor(bgRef);
    if (color) return color;
    
    // Try gradient in bgRef
    const gradColor = parseGradientColor(bgRef);
    if (gradColor) return gradColor;
  }
  
  return undefined;
}

/**
 * Extract slide background color from slide, layout, or master XML
 * Follows the proper inheritance chain: slide → layout → master
 */
async function extractSlideBackground(
  zip: JSZip,
  slideIndex: number,
  slideRels: Record<string, string>
): Promise<string | undefined> {
  const parser = new DOMParser();
  
  // 1. Try to get background from slide first
  const slidePath = `ppt/slides/slide${slideIndex + 1}.xml`;
  const slideFile = zip.file(slidePath);
  if (slideFile) {
    const slideXml = await slideFile.async("string");
    const slideDoc = parser.parseFromString(slideXml, "application/xml");
    
    const cSld = slideDoc.getElementsByTagNameNS(NS.p, "cSld")[0];
    if (cSld) {
      const bg = cSld.getElementsByTagNameNS(NS.p, "bg")[0];
      if (bg) {
        const color = extractBackgroundFromBg(bg);
        if (color) {
          console.log(`[PPTX Parser] Slide ${slideIndex + 1} background from slide: ${color}`);
          return color;
        }
      }
    }
  }
  
  // 2. Try to get background from slide layout
  let layoutPath: string | null = null;
  for (const relId in slideRels) {
    const target = slideRels[relId];
    if (target.includes("slideLayouts")) {
      // Normalize path
      layoutPath = target.startsWith("../") 
        ? `ppt/${target.replace("../", "")}` 
        : target.replace("ppt/ppt/", "ppt/");
      break;
    }
  }
  
  let masterPathFromLayout: string | null = null;
  
  if (layoutPath) {
    const layoutFile = zip.file(layoutPath);
    if (layoutFile) {
      const layoutXml = await layoutFile.async("string");
      const layoutDoc = parser.parseFromString(layoutXml, "application/xml");
      
      const cSld = layoutDoc.getElementsByTagNameNS(NS.p, "cSld")[0];
      if (cSld) {
        const bg = cSld.getElementsByTagNameNS(NS.p, "bg")[0];
        if (bg) {
          const color = extractBackgroundFromBg(bg);
          if (color) {
            console.log(`[PPTX Parser] Slide ${slideIndex + 1} background from layout: ${color}`);
            return color;
          }
        }
      }
      
      // Get layout's relationship to master
      const layoutRelsPath = layoutPath.replace("slideLayouts/", "slideLayouts/_rels/") + ".rels";
      const layoutRelsFile = zip.file(layoutRelsPath);
      if (layoutRelsFile) {
        const layoutRelsXml = await layoutRelsFile.async("string");
        const layoutRels = parseRelationships(layoutRelsXml);
        for (const relId in layoutRels) {
          const target = layoutRels[relId];
          if (target.includes("slideMasters")) {
            masterPathFromLayout = target.startsWith("../") 
              ? `ppt/${target.replace("../", "")}` 
              : target.replace("ppt/ppt/", "ppt/");
            break;
          }
        }
      }
    }
  }
  
  // 3. Try to get background from slide master
  try {
    // Use master from layout relationship, or fallback to first master
    let masterPath = masterPathFromLayout;
    if (!masterPath) {
      const masterFiles = Object.keys(zip.files).filter(f => 
        f.startsWith("ppt/slideMasters/") && f.endsWith(".xml") && !f.includes("_rels")
      );
      if (masterFiles.length > 0) {
        masterPath = masterFiles[0];
      }
    }
    
    if (masterPath) {
      const masterFile = zip.file(masterPath);
      if (masterFile) {
        const masterXml = await masterFile.async("string");
        const masterDoc = parser.parseFromString(masterXml, "application/xml");
        
        const cSld = masterDoc.getElementsByTagNameNS(NS.p, "cSld")[0];
        if (cSld) {
          const bg = cSld.getElementsByTagNameNS(NS.p, "bg")[0];
          if (bg) {
            const color = extractBackgroundFromBg(bg);
            if (color) {
              console.log(`[PPTX Parser] Slide ${slideIndex + 1} background from master: ${color}`);
              return color;
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("Failed to extract master background:", e);
  }
  
  // No background found
  console.log(`[PPTX Parser] Slide ${slideIndex + 1} no background color found`);
  return undefined;
}

/**
 * Extract shapes from slide XML
 * @param doc - Parsed slide XML document
 * @param rels - Relationship mappings for the slide
 * @param layoutStyles - Optional placeholder styles from the slide's layout
 */
function extractShapesFromXml(
  doc: Document, 
  rels: Record<string, string>,
  layoutStyles?: Map<string, PlaceholderStyle>
): PptxShape[] {
  const shapes: PptxShape[] = [];
  
  // Find all sp (shape) elements
  const spElements = doc.getElementsByTagNameNS(NS.p, "sp");
  console.log(`[PPTX Parser] Found ${spElements.length} shape elements`);
  
  for (let i = 0; i < spElements.length; i++) {
    const sp = spElements[i];
    
    // Get transform (position and size) with fallback
    const transform = findXfrm(sp);
    
    // Check for placeholder type
    let placeholderType: PptxShape['placeholderType'] | undefined;
    const nvSpPr = sp.getElementsByTagNameNS(NS.p, "nvSpPr")[0];
    if (nvSpPr) {
      const nvPr = nvSpPr.getElementsByTagNameNS(NS.p, "nvPr")[0];
      if (nvPr) {
        const ph = nvPr.getElementsByTagNameNS(NS.p, "ph")[0];
        if (ph) {
          const phType = ph.getAttribute("type");
          if (phType === "title" || phType === "ctrTitle" || phType === "subTitle" || 
              phType === "body" || phType === "ftr" || phType === "dt" || 
              phType === "sldNum" || phType === "pic") {
            placeholderType = phType;
          } else if (phType) {
            placeholderType = 'other';
          }
        }
      }
    }
    
    // Extract paragraphs with rich text
    const paragraphs = extractParagraphsFromShape(sp);
    
    // Also extract plain text for backward compatibility
    const textContent: string[] = [];
    const textNodes = sp.getElementsByTagNameNS(NS.a, "t");
    for (let j = 0; j < textNodes.length; j++) {
      const text = textNodes[j].textContent?.trim();
      if (text) textContent.push(text);
    }
    
    // Skip if no transform AND no text
    if (!transform && textContent.length === 0) continue;
    
    // Determine position: use transform if available, otherwise inherit from layout or placeholder positions
    let x: number, y: number, width: number, height: number;
    
    // Check if we have layout-specific styles for this placeholder
    const layoutStyle = placeholderType && layoutStyles?.get(placeholderType);
    
    if (transform) {
      // Use explicit transform from the shape
      x = transform.x;
      y = transform.y;
      width = transform.width;
      height = transform.height;
    } else if (layoutStyle && layoutStyle.width > 0) {
      // Inherit position from this slide's specific layout
      x = layoutStyle.x;
      y = layoutStyle.y;
      width = layoutStyle.width;
      height = layoutStyle.height;
      console.log(`[PPTX Parser] Shape ${i}: Using layout position for placeholder '${placeholderType}': x=${x}, y=${y}`);
    } else if (placeholderType && placeholderPositions.has(placeholderType)) {
      // Inherit position from global placeholder cache (slide master)
      const inheritedPos = placeholderPositions.get(placeholderType)!;
      x = inheritedPos.x;
      y = inheritedPos.y;
      width = inheritedPos.width;
      height = inheritedPos.height;
      console.log(`[PPTX Parser] Shape ${i}: Using master position for placeholder '${placeholderType}': x=${x}, y=${y}`);
    } else {
      // Fallback to default positions
      x = 50;
      y = 50 + i * 60;
      width = SLIDE_WIDTH - 100;
      height = 50;
    }
    
    console.log(`[PPTX Parser] Shape ${i}: x=${x}, y=${y}, w=${width}, h=${height}, paragraphs=${paragraphs.length}, placeholder=${placeholderType || 'none'}, hasTransform=${!!transform}`);
    
    // Get fill color
    const solidFill = sp.getElementsByTagNameNS(NS.a, "solidFill")[0];
    const fill = parseColor(solidFill);
    
    // Get first run's font properties for backward compat
    const rPr = sp.getElementsByTagNameNS(NS.a, "rPr")[0];
    let fontSize: number | undefined;
    let fontColor: string | undefined;
    let bold = false;
    let italic = false;
    
    if (rPr) {
      const sz = rPr.getAttribute("sz");
      if (sz) fontSize = parseInt(sz, 10) / 100;
      
      bold = rPr.getAttribute("b") === "1";
      italic = rPr.getAttribute("i") === "1";
      
      const solidFillRpr = rPr.getElementsByTagNameNS(NS.a, "solidFill")[0];
      fontColor = parseColor(solidFillRpr);
    }
    
    // Get vertical alignment from bodyPr
    const bodyPr = sp.getElementsByTagNameNS(NS.a, "bodyPr")[0];
    let verticalAlign: 'top' | 'middle' | 'bottom' | undefined;
    if (bodyPr) {
      const anchor = bodyPr.getAttribute("anchor");
      if (anchor === "t") verticalAlign = 'top';
      else if (anchor === "ctr") verticalAlign = 'middle';
      else if (anchor === "b") verticalAlign = 'bottom';
    }
    
    // INHERIT from layout styles if shape doesn't define its own
    if (layoutStyle) {
      // Inherit font color if not explicitly defined on shape
      if (!fontColor && layoutStyle.fontColor) {
        fontColor = layoutStyle.fontColor;
        console.log(`[PPTX Parser] Shape ${i} ('${placeholderType}'): Inheriting fontColor=${fontColor} from layout`);
      }
      // Inherit font size if not explicitly defined
      if (!fontSize && layoutStyle.fontSize) {
        fontSize = layoutStyle.fontSize;
        console.log(`[PPTX Parser] Shape ${i} ('${placeholderType}'): Inheriting fontSize=${fontSize} from layout`);
      }
      // Inherit vertical alignment if not explicitly defined
      if (!verticalAlign && layoutStyle.verticalAlign) {
        verticalAlign = layoutStyle.verticalAlign;
      }
    }
    
    // Also apply inherited styles to paragraph runs that don't have explicit colors
    if (paragraphs.length > 0 && layoutStyle?.fontColor) {
      for (const para of paragraphs) {
        for (const run of para.runs) {
          if (!run.fontColor) {
            run.fontColor = layoutStyle.fontColor;
          }
          if (!run.fontSize && layoutStyle.fontSize) {
            run.fontSize = layoutStyle.fontSize;
          }
        }
      }
    }
    
    shapes.push({
      type: "text",
      x,
      y,
      width,
      height,
      text: textContent.join(" "),
      paragraphs: paragraphs.length > 0 ? paragraphs : undefined,
      fill,
      fontSize,
      fontColor,
      bold,
      italic,
      verticalAlign,
      placeholderType,
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
  
  // Find which layout this slide uses and parse its placeholder styles
  let layoutPath: string | null = null;
  for (const relId in rels) {
    const target = rels[relId];
    if (target.includes("slideLayouts")) {
      // Normalize path
      layoutPath = target.startsWith("../") 
        ? `ppt/${target.replace("../", "")}` 
        : target.replace("ppt/ppt/", "ppt/");
      break;
    }
  }
  
  // Parse layout-specific placeholder styles
  let layoutStyles: Map<string, PlaceholderStyle> | undefined;
  if (layoutPath) {
    layoutStyles = await parseLayoutPlaceholderStyles(zip, layoutPath);
    console.log(`[PPTX Parser] Slide ${slideIndex + 1} uses layout ${layoutPath} with ${layoutStyles.size} placeholder styles`);
  }
  
  // Extract shapes with layout styles for inheritance
  const shapes = extractShapesFromXml(doc, rels, layoutStyles);
  
  // Extract background color
  const backgroundColor = await extractSlideBackground(zip, slideIndex, rels);
  
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
    backgroundColor,
  };
}

/**
 * Main entry point - parse a PPTX file
 */
export async function parsePptxFile(file: File): Promise<PptxData> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  // Parse theme colors first (for proper color resolution)
  themeColors = await parseThemeColors(zip);
  
  // Parse color map from slide masters (for resolving scheme colors like bg1 -> lt1)
  colorMap = await parseColorMapFromMasters(zip);
  
  // Parse placeholder positions from masters and layouts (for position inheritance)
  await parsePlaceholderPositions(zip);
  
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

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Get all text from a PPTX merged into a single string
 */
export function getAllText(data: PptxData, separator = "\n\n"): string {
  return data.slides.map((slide) => slide.mergedText).join(separator);
}

/**
 * Get text per slide
 */
export function getTextPerSlide(
  data: PptxData
): { index: number; title: string; text: string }[] {
  return data.slides.map((slide) => ({
    index: slide.index,
    title: slide.title || `Slide ${slide.index + 1}`,
    text: slide.mergedText,
  }));
}
