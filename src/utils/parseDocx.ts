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
 * Rasterize a DOCX document to an image using docx-preview
 */
export async function rasterizeDocx(
  arrayBuffer: ArrayBuffer,
  options: { width?: number; scale?: number } = {}
): Promise<string> {
  const { width = 800, scale = 2 } = options;
  
  // Dynamically import docx-preview and html-to-image
  const [{ renderAsync }, { toPng }] = await Promise.all([
    import("docx-preview"),
    import("html-to-image"),
  ]);
  
  // Create a container element
  const container = document.createElement("div");
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: ${width}px;
    background: white;
    font-family: 'Times New Roman', serif;
    padding: 40px;
    box-sizing: border-box;
  `;
  document.body.appendChild(container);
  
  try {
    // Render the document
    await renderAsync(arrayBuffer, container, undefined, {
      className: "docx-preview",
      inWrapper: false,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: false,
      useBase64URL: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
    });
    
    // Wait for any images to load
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Capture as PNG
    const dataUrl = await toPng(container, {
      pixelRatio: scale,
      backgroundColor: "#ffffff",
    });
    
    return dataUrl;
  } finally {
    // Clean up
    document.body.removeChild(container);
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
