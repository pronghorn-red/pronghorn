import mammoth from "mammoth";
import JSZip from "jszip";

export interface DocxImage {
  id: string;
  filename: string;
  base64: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export type DocxExportMode = "text" | "rasterize" | "both";
export type DocxTextFormat = "markdown" | "html" | "plaintext";

export interface DocxExportOptions {
  mode: DocxExportMode;
  outputFormat: DocxTextFormat;
  extractImages: boolean;
  selectedImages: Set<string>;
  selectedRasterPages: Set<number>;
  rasterizedPageCount: number;
  cachedRasterizedPages?: string[]; // Cached page data URLs to avoid re-rasterization
  // Visual Recognition options (applied after rasterization)
  visualRecognition?: boolean;
  visualRecognitionModel?: string;
}

export interface DocxData {
  filename: string;
  fileSize: number;
  htmlContent: string;
  markdownContent: string;
  rawText: string;
  embeddedImages: Map<string, DocxImage>;
  arrayBuffer: ArrayBuffer;
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "tiff":
    case "tif":
      return "image/tiff";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

/**
 * Check if file is a raster image (skip EMF, WMF)
 */
function isRasterImage(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop();
  return ["png", "jpg", "jpeg", "gif", "bmp", "webp", "tiff", "tif"].includes(ext || "");
}

/**
 * Extract embedded images from DOCX file using JSZip
 */
export async function extractDocxImages(
  arrayBuffer: ArrayBuffer
): Promise<Map<string, DocxImage>> {
  const images = new Map<string, DocxImage>();
  
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const mediaFolder = zip.folder("word/media");
    
    if (!mediaFolder) {
      return images;
    }

    const mediaFiles: { relativePath: string; file: JSZip.JSZipObject }[] = [];
    mediaFolder.forEach((relativePath, file) => {
      if (!file.dir && isRasterImage(relativePath)) {
        mediaFiles.push({ relativePath, file });
      }
    });

    for (const { relativePath, file } of mediaFiles) {
      try {
        const data = await file.async("base64");
        const filename = relativePath.split("/").pop() || relativePath;
        const mimeType = getMimeType(filename);
        const id = `docx-img-${filename}-${Date.now()}`;

        images.set(id, {
          id,
          filename,
          base64: data,
          mimeType,
        });
      } catch (err) {
        console.error(`Failed to extract image ${relativePath}:`, err);
      }
    }
  } catch (err) {
    console.error("Failed to extract images from DOCX:", err);
  }

  return images;
}

/**
 * Convert DOCX to HTML with custom image handling
 */
async function convertToHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "p[style-name='Heading 5'] => h5:fresh",
        "p[style-name='Heading 6'] => h6:fresh",
      ],
    }
  );
  
  if (result.messages.length > 0) {
    console.log("Mammoth HTML conversion messages:", result.messages);
  }
  
  return result.value;
}

/**
 * Convert DOCX to Markdown
 */
async function convertToMarkdown(arrayBuffer: ArrayBuffer): Promise<string> {
  // Mammoth doesn't have built-in markdown support, so we convert HTML and then transform
  const html = await convertToHtml(arrayBuffer);
  return htmlToMarkdown(html);
}

/**
 * Simple HTML to Markdown converter
 */
function htmlToMarkdown(html: string): string {
  let md = html;
  
  // Headers
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n");
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n\n");
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "##### $1\n\n");
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, "###### $1\n\n");
  
  // Bold and italic
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
  
  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  
  // Images (skip for now as they're extracted separately)
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, "![$2]($1)");
  md = md.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, "![$1]($2)");
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, "![]($1)");
  
  // Lists - unordered
  md = md.replace(/<ul[^>]*>/gi, "\n");
  md = md.replace(/<\/ul>/gi, "\n");
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
  
  // Lists - ordered (simplified)
  md = md.replace(/<ol[^>]*>/gi, "\n");
  md = md.replace(/<\/ol>/gi, "\n");
  
  // Paragraphs
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");
  
  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, "\n");
  
  // Tables
  md = convertTablesInHtml(md);
  
  // Remove remaining HTML tags
  md = md.replace(/<[^>]+>/g, "");
  
  // Decode HTML entities
  md = md.replace(/&nbsp;/g, " ");
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  
  // Clean up excessive whitespace
  md = md.replace(/\n{3,}/g, "\n\n");
  md = md.replace(/[ \t]{2,}/g, " ");
  
  return md.trim();
}

/**
 * Convert HTML tables to Markdown tables
 */
function convertTablesInHtml(html: string): string {
  // Match tables
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  
  return html.replace(tableRegex, (match, tableContent) => {
    const rows: string[][] = [];
    
    // Extract rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
      const cells: string[] = [];
      const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        // Strip HTML from cell content
        const cellContent = cellMatch[1].replace(/<[^>]+>/g, "").trim();
        cells.push(cellContent);
      }
      
      if (cells.length > 0) {
        rows.push(cells);
      }
    }
    
    if (rows.length === 0) return "";
    
    // Build markdown table
    const maxCols = Math.max(...rows.map(r => r.length));
    let md = "\n\n";
    
    // Header row
    const headerRow = rows[0] || [];
    md += "| " + headerRow.map(c => c || " ").join(" | ") + " |\n";
    md += "| " + headerRow.map(() => "---").join(" | ") + " |\n";
    
    // Data rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      // Pad row to max columns
      while (row.length < maxCols) row.push("");
      md += "| " + row.map(c => c || " ").join(" | ") + " |\n";
    }
    
    md += "\n";
    return md;
  });
}

/**
 * Extract raw text from DOCX
 */
async function extractRawText(arrayBuffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer });
  
  if (result.messages.length > 0) {
    console.log("Mammoth text extraction messages:", result.messages);
  }
  
  // Clean up the text
  let text = result.value;
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[ \t]{2,}/g, " ");
  
  return text.trim();
}

/**
 * Process a DOCX file and extract all content
 */
export async function processDocxFile(file: File): Promise<DocxData> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Run all extractions in parallel
  const [htmlContent, rawText, embeddedImages] = await Promise.all([
    convertToHtml(arrayBuffer),
    extractRawText(arrayBuffer),
    extractDocxImages(arrayBuffer),
  ]);
  
  // Convert HTML to markdown
  const markdownContent = htmlToMarkdown(htmlContent);
  
  return {
    filename: file.name,
    fileSize: file.size,
    htmlContent,
    markdownContent,
    rawText,
    embeddedImages,
    arrayBuffer,
  };
}

/**
 * Rasterize a DOCX document to page images by rendering HTML content
 * Returns an array of page images, each page is US Letter sized (8.5x11 at 96 DPI = 816x1056)
 * 
 * @param arrayBuffer - The DOCX file as an ArrayBuffer
 * @param options.width - Page width in pixels (default: 816)
 * @param options.scale - Pixel ratio for higher quality (default: 2)
 * @param options.selectedPages - Optional array of page indices to rasterize (0-indexed)
 * @param options.onProgress - Optional callback for progress updates (current, total)
 * @param options.abortSignal - Optional AbortSignal for cancellation
 */
export async function rasterizeDocx(
  arrayBuffer: ArrayBuffer,
  options: { 
    width?: number; 
    scale?: number; 
    selectedPages?: number[];
    onProgress?: (current: number, total: number) => void;
    abortSignal?: AbortSignal;
  } = {}
): Promise<string[]> {
  const { width = 816, scale = 2, selectedPages, onProgress, abortSignal } = options;
  const PAGE_HEIGHT = 1056; // US Letter at 96 DPI (11 inches)
  
  // First convert to HTML using mammoth
  const htmlContent = await convertToHtml(arrayBuffer);
  
  // Dynamically import html-to-image
  const { toPng } = await import("html-to-image");
  
  // Internal abort controller for the cancel button
  const internalController = new AbortController();
  const signal = abortSignal || internalController.signal;
  
  // Create progress modal (visible to user)
  const progressModal = document.createElement("div");
  progressModal.style.cssText = `
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 50;
    background: white;
    border-radius: 12px;
    padding: 32px 48px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    text-align: center;
    font-family: system-ui, -apple-system, sans-serif;
  `;
  
  // Add spinner animation style
  const styleTag = document.createElement("style");
  styleTag.textContent = `
    @keyframes docx-raster-spin {
      to { transform: rotate(360deg); }
    }
    #docx-raster-cancel:hover {
      background: #e5e7eb !important;
    }
  `;
  document.head.appendChild(styleTag);
  
  progressModal.innerHTML = `
    <div style="margin-bottom: 16px;">
      <svg style="width: 40px; height: 40px; animation: docx-raster-spin 1s linear infinite; margin: 0 auto;" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" stroke="#e5e7eb" stroke-width="4" fill="none"></circle>
        <circle cx="20" cy="20" r="18" stroke="#3b82f6" stroke-width="4" fill="none" 
                stroke-dasharray="90 120" stroke-linecap="round"></circle>
      </svg>
    </div>
    <div id="docx-raster-progress-text" style="font-size: 16px; color: #374151; font-weight: 500;">
      Preparing document...
    </div>
    <button id="docx-raster-cancel" style="
      margin-top: 16px;
      padding: 8px 24px;
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      color: #374151;
      transition: background 0.15s;
    ">
      Cancel
    </button>
  `;
  
  // Create a fixed-size viewport container (this is what we capture)
  // Use NEGATIVE z-index so it's invisible behind the page
  const viewport = document.createElement("div");
  viewport.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: ${width}px;
    height: ${PAGE_HEIGHT}px;
    overflow: hidden;
    background: white;
    z-index: -9999;
    visibility: visible;
  `;
  
  // Create content wrapper that will be positioned for each page
  const contentWrapper = document.createElement("div");
  contentWrapper.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
    width: ${width}px;
    background: white;
    font-family: 'Times New Roman', Georgia, serif;
    padding: 60px 72px;
    box-sizing: border-box;
    line-height: 1.6;
    color: #000;
    font-size: 12pt;
  `;
  
  // Add styles and content
  contentWrapper.innerHTML = `
    <style>
      h1, h2, h3, h4, h5, h6 { margin: 1em 0 0.5em; font-weight: bold; color: #000; }
      h1 { font-size: 24pt; }
      h2 { font-size: 18pt; }
      h3 { font-size: 14pt; }
      h4 { font-size: 12pt; }
      p { margin: 0.5em 0; }
      ul, ol { margin: 0.5em 0; padding-left: 2em; }
      li { margin: 0.25em 0; }
      table { border-collapse: collapse; margin: 1em 0; width: 100%; }
      td, th { border: 1px solid #000; padding: 8px; text-align: left; }
      th { background: #f0f0f0; font-weight: bold; }
      strong, b { font-weight: bold; }
      em, i { font-style: italic; }
      img { max-width: 100%; height: auto; }
      a { color: #0000EE; text-decoration: underline; }
    </style>
    ${htmlContent}
  `;
  
  viewport.appendChild(contentWrapper);
  document.body.appendChild(progressModal);
  document.body.appendChild(viewport);
  
  // Set up cancel button handler
  const cancelBtn = progressModal.querySelector("#docx-raster-cancel") as HTMLButtonElement;
  cancelBtn?.addEventListener("click", () => {
    internalController.abort();
  });
  
  const updateProgressText = (text: string) => {
    const progressText = progressModal.querySelector("#docx-raster-progress-text");
    if (progressText) {
      progressText.textContent = text;
    }
  };
  
  try {
    // Check for cancellation before starting
    if (signal.aborted) {
      throw new DOMException("Rasterization cancelled", "AbortError");
    }
    
    // Wait for any images to load and styles to apply
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Get the total content height from the content wrapper
    const contentHeight = contentWrapper.scrollHeight;
    const pages: string[] = [];
    
    // === SMART PAGE BREAKS ===
    // Find all block-level elements to avoid cutting text mid-line
    const elements = contentWrapper.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, tr, div, table, ul, ol, blockquote');
    const contentRect = contentWrapper.getBoundingClientRect();
    
    // Get positions of all block elements
    const elementBounds: { top: number; bottom: number }[] = [];
    elements.forEach(el => {
      const rect = el.getBoundingClientRect();
      elementBounds.push({
        top: rect.top - contentRect.top,
        bottom: rect.bottom - contentRect.top,
      });
    });
    
    // Sort by position
    elementBounds.sort((a, b) => a.top - b.top);
    
    // Calculate smart page breaks
    const pageBreaks: number[] = [0];
    let currentBreakTarget = PAGE_HEIGHT;
    
    while (currentBreakTarget < contentHeight) {
      // Find the best break point near the target
      let bestBreak = currentBreakTarget;
      
      // Look for an element boundary that ends before the target
      // Prefer breaks that are close to but not exceeding the target
      for (const bounds of elementBounds) {
        // If element ends before target and is close (within 150px)
        if (bounds.bottom <= currentBreakTarget && bounds.bottom > currentBreakTarget - 150) {
          bestBreak = bounds.bottom;
        }
        // If element starts after target, we've gone past
        if (bounds.top > currentBreakTarget) break;
      }
      
      // Ensure we make progress (minimum 200px per page to avoid infinite loops)
      if (bestBreak <= pageBreaks[pageBreaks.length - 1] + 200) {
        bestBreak = Math.min(currentBreakTarget, contentHeight);
      }
      
      pageBreaks.push(bestBreak);
      currentBreakTarget = bestBreak + PAGE_HEIGHT;
    }
    
    // Add final break at content end if needed
    if (pageBreaks[pageBreaks.length - 1] < contentHeight) {
      pageBreaks.push(contentHeight);
    }
    
    const pageCount = pageBreaks.length - 1;
    
    // Determine which pages to render
    const pagesToRender = selectedPages 
      ? selectedPages.filter(p => p >= 0 && p < pageCount).sort((a, b) => a - b)
      : Array.from({ length: pageCount }, (_, i) => i);
    
    const totalPages = pagesToRender.length;
    
    // Capture each page using smart breaks
    for (let i = 0; i < pagesToRender.length; i++) {
      // Check for cancellation at the start of each iteration
      if (signal.aborted) {
        throw new DOMException("Rasterization cancelled", "AbortError");
      }
      
      const pageIndex = pagesToRender[i];
      const startY = pageBreaks[pageIndex];
      const endY = pageBreaks[pageIndex + 1];
      const pageHeight = Math.max(endY - startY, 100); // Minimum 100px height
      
      // Update progress modal and call callback
      updateProgressText(`Rasterizing page ${i + 1} of ${totalPages}...`);
      if (onProgress) {
        onProgress(i + 1, totalPages);
      }
      
      // Adjust viewport height for this page
      viewport.style.height = `${pageHeight}px`;
      
      // Move content up to show current page section
      contentWrapper.style.top = `-${startY}px`;
      
      // Wait for reflow
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Capture the viewport with dynamic height
      const dataUrl = await toPng(viewport, {
        pixelRatio: scale,
        backgroundColor: "#ffffff",
        width: width,
        height: pageHeight,
      });
      pages.push(dataUrl);
    }
    
    return pages;
  } finally {
    // Clean up
    document.body.removeChild(viewport);
    document.body.removeChild(progressModal);
    document.head.removeChild(styleTag);
  }
}

/**
 * Get text content based on format
 */
export function getTextContent(docxData: DocxData, format: DocxTextFormat): string {
  switch (format) {
    case "markdown":
      return docxData.markdownContent;
    case "html":
      return docxData.htmlContent;
    case "plaintext":
      return docxData.rawText;
    default:
      return docxData.markdownContent;
  }
}
