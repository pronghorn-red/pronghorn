import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker using proper path
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/**
 * Clone an ArrayBuffer to prevent detachment issues
 */
const cloneArrayBuffer = (buffer: ArrayBuffer): ArrayBuffer => {
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('Invalid or empty ArrayBuffer');
  }
  const cloned = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(cloned).set(new Uint8Array(buffer));
  return cloned;
};

/**
 * Safely get ArrayBuffer from FileReader result
 */
const getSafeArrayBuffer = (result: ArrayBuffer): ArrayBuffer => {
  if (!result) {
    throw new Error('No ArrayBuffer result from FileReader');
  }
  if (result.byteLength === 0) {
    throw new Error('Empty ArrayBuffer from FileReader');
  }
  return cloneArrayBuffer(result);
};

export interface PDFInfo {
  numPages: number;
  fingerprint: string;
  info: unknown;
}

export interface PDFTextContent {
  pagesText: string[];
}

export interface PDFThumbnail {
  pageIndex: number;
  pageNumber: number;
  dataUrl?: string;
  error?: string;
}

export interface PDFEmbeddedImage {
  id: string;
  pageIndex: number;
  dataUrl: string;
  width: number;
  height: number;
}

export interface PdfData {
  filename: string;
  fileSize: number;
  pageCount: number;
  pagesText: string[];
  thumbnails: Map<number, string>;
  embeddedImages: Map<string, PDFEmbeddedImage>;
  arrayBuffer: ArrayBuffer;
}

export type PdfExportMode = "text" | "rasterize" | "both";

export interface PdfExportOptions {
  mode: PdfExportMode;
  mergeText: boolean;
  extractImages: boolean;
  selectedPages: Set<number>;
  selectedImages: Set<string>;
  // Visual Recognition options (applied after rasterization)
  visualRecognition?: boolean;
  visualRecognitionModel?: string;
}

/**
 * Get PDF metadata and page count
 */
export const getPDFInfo = async (arrayBuffer: ArrayBuffer): Promise<PDFInfo> => {
  if (!arrayBuffer) throw new Error('Invalid PDF input');

  const safeArrayBuffer = cloneArrayBuffer(arrayBuffer);
  const loadingTask = pdfjsLib.getDocument({ data: safeArrayBuffer });
  const pdf = await loadingTask.promise;

  return {
    numPages: pdf.numPages,
    fingerprint: pdf.fingerprints[0] || '',
    info: await pdf.getMetadata()
  };
};

/**
 * Extract text content from a PDF
 */
export const extractPDFText = async (arrayBuffer: ArrayBuffer): Promise<PDFTextContent> => {
  if (!arrayBuffer) throw new Error('Invalid PDF input');

  const safeArrayBuffer = cloneArrayBuffer(arrayBuffer);
  const loadingTask = pdfjsLib.getDocument({ data: safeArrayBuffer });
  const pdf = await loadingTask.promise;
  const textContent: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContentItems = await page.getTextContent({
      includeMarkedContent: true
    });
    const pageText = textContentItems.items
      .map((item: unknown, index: number, arr: unknown[]) => {
        const typedItem = item as { str?: string; hasEOL?: boolean; transform?: number[] };
        const text = typedItem.str || '';
        
        // Check if this item ends with a line break (explicit EOL marker)
        if (typedItem.hasEOL) {
          return text + '\n';
        }
        
        // Check for significant Y position change (paragraph break)
        if (index < arr.length - 1) {
          const nextItem = arr[index + 1] as { transform?: number[] };
          if (typedItem.transform && nextItem.transform) {
            const yDiff = Math.abs(typedItem.transform[5] - nextItem.transform[5]);
            if (yDiff > 12) { // Significant vertical gap indicates paragraph break
              return text + '\n';
            }
          }
        }
        
        return text + ' ';
      })
      .join('')
      .replace(/[ \t]{2,}/g, ' ') // Collapse multiple spaces to single space
      .replace(/\n{3,}/g, '\n\n') // Normalize excessive newlines to double
      .replace(/[ \t]+\n/g, '\n') // Remove trailing spaces before newlines
      .replace(/\n[ \t]+/g, '\n') // Remove leading spaces after newlines
      .trim();
    textContent.push(pageText);
  }

  return { pagesText: textContent };
};

/**
 * Rasterize a single PDF page to a data URL
 */
export const rasterizePdfPage = async (
  pdfArrayBuffer: ArrayBuffer,
  pageIndex: number,
  scale = 2.5
): Promise<string> => {
  const safeArrayBuffer = cloneArrayBuffer(pdfArrayBuffer);
  const loadingTask = pdfjsLib.getDocument({ data: safeArrayBuffer });
  const pdf = await loadingTask.promise;

  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  if (!context) {
    throw new Error('Could not get canvas context');
  }

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };

  try {
    await page.render(renderContext).promise;
  } catch (renderError) {
    console.warn(`Partial rendering for page ${pageIndex + 1} due to error: ${renderError}`);
  }

  const dataUrl = canvas.toDataURL('image/png', 0.95);
  canvas.remove();

  return dataUrl;
};

/**
 * Create thumbnail for a specific page range (for pagination)
 */
export const createPageThumbnails = async (
  arrayBuffer: ArrayBuffer,
  startPage: number,
  endPage: number,
  scale = 0.5,
  onProgress?: (pageIndex: number) => void
): Promise<Map<number, string>> => {
  if (!arrayBuffer) throw new Error('Invalid PDF input');

  const safeArrayBuffer = cloneArrayBuffer(arrayBuffer);
  const loadingTask = pdfjsLib.getDocument({ data: safeArrayBuffer });
  const pdf = await loadingTask.promise;
  const thumbnails = new Map<number, string>();

  const actualEnd = Math.min(endPage, pdf.numPages - 1);

  for (let i = startPage; i <= actualEnd; i++) {
    try {
      const page = await pdf.getPage(i + 1);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      if (context) {
        try {
          await page.render({ canvasContext: context, viewport }).promise;
        } catch {
          // Continue with partial render
        }
        thumbnails.set(i, canvas.toDataURL('image/jpeg', 0.7));
      }
      canvas.remove();
      onProgress?.(i);
    } catch (error) {
      console.error(`Failed to create thumbnail for page ${i + 1}:`, error);
    }
  }

  return thumbnails;
};

/**
 * Extract embedded images from PDF pages using getOperatorList
 */
export const extractPDFImages = async (
  arrayBuffer: ArrayBuffer,
  onProgress?: (pageIndex: number, imageCount: number) => void
): Promise<Map<string, PDFEmbeddedImage>> => {
  if (!arrayBuffer) throw new Error('Invalid PDF input');

  const safeArrayBuffer = cloneArrayBuffer(arrayBuffer);
  const loadingTask = pdfjsLib.getDocument({ data: safeArrayBuffer });
  const pdf = await loadingTask.promise;
  const images = new Map<string, PDFEmbeddedImage>();

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const operatorList = await page.getOperatorList();
      
      // Look for image operators (OPS.paintImageXObject, OPS.paintJpegXObject)
      for (let j = 0; j < operatorList.fnArray.length; j++) {
        const fn = operatorList.fnArray[j];
        // paintImageXObject = 85, paintJpegXObject = 82
        if (fn === 85 || fn === 82) {
          const args = operatorList.argsArray[j];
          if (args && args[0]) {
            const imageName = args[0];
            const imageId = `page${i}_${imageName}`;
            
            // Skip if already extracted
            if (images.has(imageId)) continue;

            try {
              // Get the image data from the page
              const objs = await new Promise<unknown>((resolve) => {
                page.objs.get(imageName, resolve);
              });
              
              if (objs && typeof objs === 'object' && 'bitmap' in objs) {
                const imgObj = objs as { bitmap?: ImageBitmap; width: number; height: number };
                if (imgObj.bitmap) {
                  const canvas = document.createElement('canvas');
                  canvas.width = imgObj.width;
                  canvas.height = imgObj.height;
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.drawImage(imgObj.bitmap, 0, 0);
                    images.set(imageId, {
                      id: imageId,
                      pageIndex: i - 1,
                      dataUrl: canvas.toDataURL('image/png'),
                      width: imgObj.width,
                      height: imgObj.height,
                    });
                  }
                  canvas.remove();
                }
              } else if (objs && typeof objs === 'object' && 'data' in objs) {
                // Raw image data
                const imgObj = objs as { data: Uint8ClampedArray; width: number; height: number };
                const canvas = document.createElement('canvas');
                canvas.width = imgObj.width;
                canvas.height = imgObj.height;
                const ctx = canvas.getContext('2d');
                if (ctx && imgObj.width > 0 && imgObj.height > 0) {
                  // Create a proper Uint8ClampedArray with ArrayBuffer for ImageData
                  const dataArray = new Uint8ClampedArray(imgObj.data.length);
                  dataArray.set(imgObj.data);
                  const imageData = new ImageData(dataArray, imgObj.width, imgObj.height);
                  ctx.putImageData(imageData, 0, 0);
                  images.set(imageId, {
                    id: imageId,
                    pageIndex: i - 1,
                    dataUrl: canvas.toDataURL('image/png'),
                    width: imgObj.width,
                    height: imgObj.height,
                  });
                }
                canvas.remove();
              }
            } catch (imgError) {
              console.warn(`Failed to extract image ${imageName} from page ${i}:`, imgError);
            }
          }
        }
      }
      
      onProgress?.(i - 1, images.size);
    } catch (error) {
      console.warn(`Failed to process page ${i} for images:`, error);
    }
  }

  return images;
};

/**
 * Rasterize specific pages of a PDF
 */
export const rasterizeSelectedPages = async (
  arrayBuffer: ArrayBuffer,
  pageIndices: number[],
  scale = 2.5,
  onProgress?: (pageIndex: number) => void
): Promise<{ pageIndex: number; pageNumber: number; dataUrl?: string; error?: string; success: boolean }[]> => {
  if (!arrayBuffer) throw new Error('Invalid PDF input');
  if (!Array.isArray(pageIndices) || pageIndices.length === 0) {
    throw new Error('Invalid page indices');
  }

  const results: { pageIndex: number; pageNumber: number; dataUrl?: string; error?: string; success: boolean }[] = [];

  for (const pageIndex of pageIndices) {
    try {
      const dataUrl = await rasterizePdfPage(arrayBuffer, pageIndex, scale);
      results.push({
        pageIndex,
        pageNumber: pageIndex + 1,
        dataUrl,
        success: true
      });
      onProgress?.(pageIndex);
    } catch (error) {
      console.error(`Failed to rasterize page ${pageIndex + 1}:`, error);
      results.push({
        pageIndex,
        pageNumber: pageIndex + 1,
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      });
    }
  }

  return results;
};

export interface ProcessedPDFFile {
  file: {
    name: string;
    size: number;
    type: string;
  };
  pdfInfo: PDFInfo;
  pagesText: string[];
  arrayBuffer: ArrayBuffer;
}

/**
 * Process a PDF file and return metadata and text content
 */
export const processPDFFile = async (
  file: File,
  onProgress?: (stage: string, progress: number) => void
): Promise<ProcessedPDFFile> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const result = e.target?.result as ArrayBuffer;
        if (!result) {
          throw new Error('Failed to read PDF file');
        }

        const arrayBuffer = getSafeArrayBuffer(result);
        
        onProgress?.('Getting PDF info...', 20);
        const pdfInfo = await getPDFInfo(arrayBuffer);
        
        onProgress?.('Extracting text...', 50);
        const { pagesText } = await extractPDFText(arrayBuffer);

        onProgress?.('Complete!', 100);

        resolve({
          file: {
            name: file.name,
            size: file.size,
            type: file.type
          },
          pdfInfo,
          pagesText,
          arrayBuffer
        });
      } catch (error) {
        reject(new Error(`Failed to process PDF ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };
    reader.onerror = () => reject(new Error(`Failed to read PDF file ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
};
