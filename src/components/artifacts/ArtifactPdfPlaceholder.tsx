import React from "react";
import { FileIcon } from "lucide-react";

export function ArtifactPdfPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <FileIcon className="h-16 w-16 mb-4 opacity-50" />
      <h3 className="text-lg font-medium mb-2">PDF Document Processing</h3>
      <p className="text-sm text-center max-w-md">
        Support for PDF files is coming soon. You'll be able to upload PDF documents 
        and extract their content as artifacts.
      </p>
      <div className="mt-4 px-4 py-2 bg-muted rounded-lg text-xs">
        Phase 2 Feature
      </div>
    </div>
  );
}
