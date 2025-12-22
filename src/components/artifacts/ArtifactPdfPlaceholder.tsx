import React from "react";
import {
  ArtifactPdfViewer,
  type PdfData,
  type PdfExportOptions,
} from "./ArtifactPdfViewer";

interface ArtifactPdfPlaceholderProps {
  pdfData: PdfData | null;
  onPdfDataChange: (data: PdfData | null) => void;
  exportOptions: PdfExportOptions;
  onExportOptionsChange: (options: PdfExportOptions) => void;
  textOverrides?: Map<string, string>; // VR-processed content overrides
}

export function ArtifactPdfPlaceholder({
  pdfData,
  onPdfDataChange,
  exportOptions,
  onExportOptionsChange,
  textOverrides,
}: ArtifactPdfPlaceholderProps) {
  return (
    <ArtifactPdfViewer
      pdfData={pdfData}
      onPdfDataChange={onPdfDataChange}
      exportOptions={exportOptions}
      onExportOptionsChange={onExportOptionsChange}
      textOverrides={textOverrides}
    />
  );
}

// Re-export types for backward compatibility
export type { PdfData, PdfExportOptions, PdfExportMode } from "./ArtifactPdfViewer";
