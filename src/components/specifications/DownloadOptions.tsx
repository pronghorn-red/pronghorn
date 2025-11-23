import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Download, FileArchive, FileText, FileJson, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchProjectData,
  buildMarkdownDocument,
  buildIndividualJSONs,
  buildComprehensiveJSON,
  downloadAsZip,
  downloadAsMarkdown,
  downloadAsJSON,
  type DownloadOptions as DownloadOpts
} from "@/lib/downloadUtils";
import { toPng } from "html-to-image";

interface DownloadOptionsProps {
  projectId: string;
  projectName: string;
  shareToken: string | null;
  hasGeneratedSpec: boolean;
}

export function DownloadOptions({ projectId, projectName, shareToken, hasGeneratedSpec }: DownloadOptionsProps) {
  const [downloading, setDownloading] = useState(false);
  const [options, setOptions] = useState<DownloadOpts>({
    includeSettings: true,
    includeRequirements: true,
    includeStandards: true,
    includeCanvas: true,
    includeArtifacts: true,
    includeChats: true,
    includeGeneratedSpec: hasGeneratedSpec
  });

  const handleCheckboxChange = (key: keyof DownloadOpts) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const captureCanvasPNG = async (): Promise<Blob | undefined> => {
    // Find the React Flow viewport element
    const canvasElement = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (!canvasElement) {
      console.warn('Canvas element not found for PNG export');
      return undefined;
    }

    try {
      const dataUrl = await toPng(canvasElement, {
        backgroundColor: '#ffffff',
        quality: 1.0
      });
      
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      return blob;
    } catch (error) {
      console.error('Error capturing canvas PNG:', error);
      return undefined;
    }
  };

  const handleDownload = async (format: 'zip' | 'markdown' | 'individual-json' | 'comprehensive-json') => {
    if (!projectId) return;

    setDownloading(true);
    try {
      const data = await fetchProjectData(projectId, shareToken);
      
      let canvasPNG: Blob | undefined;
      if (options.includeCanvas) {
        canvasPNG = await captureCanvasPNG();
      }

      switch (format) {
        case 'zip':
          await downloadAsZip(data, options, projectName, canvasPNG);
          toast.success('ZIP file downloaded successfully!');
          break;

        case 'markdown':
          const markdown = buildMarkdownDocument(data, options);
          downloadAsMarkdown(markdown, projectName);
          toast.success('Markdown file downloaded successfully!');
          break;

        case 'individual-json':
          const jsons = buildIndividualJSONs(data, options);
          for (const [fileName, content] of Object.entries(jsons)) {
            downloadAsJSON(content, `${projectName}-${fileName}`);
          }
          toast.success('JSON files downloaded successfully!');
          break;

        case 'comprehensive-json':
          const comprehensive = buildComprehensiveJSON(data, options);
          downloadAsJSON(comprehensive, `${projectName}-comprehensive.json`);
          toast.success('Comprehensive JSON downloaded successfully!');
          break;
      }
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download specification');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Download Specifications</CardTitle>
        <CardDescription>
          Select what to include and choose your download format
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Checkboxes */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="settings"
              checked={options.includeSettings}
              onCheckedChange={() => handleCheckboxChange('includeSettings')}
            />
            <Label htmlFor="settings" className="cursor-pointer">
              Project Settings & Metadata
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="requirements"
              checked={options.includeRequirements}
              onCheckedChange={() => handleCheckboxChange('includeRequirements')}
            />
            <Label htmlFor="requirements" className="cursor-pointer">
              Requirements (with attachments)
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="standards"
              checked={options.includeStandards}
              onCheckedChange={() => handleCheckboxChange('includeStandards')}
            />
            <Label htmlFor="standards" className="cursor-pointer">
              Project Standards (with attachments)
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="canvas"
              checked={options.includeCanvas}
              onCheckedChange={() => handleCheckboxChange('includeCanvas')}
            />
            <Label htmlFor="canvas" className="cursor-pointer">
              Canvas Architecture (JSON + PNG)
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="artifacts"
              checked={options.includeArtifacts}
              onCheckedChange={() => handleCheckboxChange('includeArtifacts')}
            />
            <Label htmlFor="artifacts" className="cursor-pointer">
              Project Artifacts
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="chats"
              checked={options.includeChats}
              onCheckedChange={() => handleCheckboxChange('includeChats')}
            />
            <Label htmlFor="chats" className="cursor-pointer">
              Chat Sessions & Messages
            </Label>
          </div>
          
          {hasGeneratedSpec && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="generated-spec"
                checked={options.includeGeneratedSpec}
                onCheckedChange={() => handleCheckboxChange('includeGeneratedSpec')}
              />
              <Label htmlFor="generated-spec" className="cursor-pointer">
                AI Generated Specification
              </Label>
            </div>
          )}
        </div>

        {/* Download buttons */}
        <div className="space-y-2 pt-4 border-t">
          <p className="text-sm font-medium mb-3">Download Formats:</p>
          
          <Button
            onClick={() => handleDownload('zip')}
            disabled={downloading}
            variant="outline"
            className="w-full justify-start"
          >
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileArchive className="mr-2 h-4 w-4" />
            )}
            ZIP Archive (with subfolders)
          </Button>
          
          <Button
            onClick={() => handleDownload('markdown')}
            disabled={downloading}
            variant="outline"
            className="w-full justify-start"
          >
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Single Markdown File
          </Button>
          
          <Button
            onClick={() => handleDownload('individual-json')}
            disabled={downloading}
            variant="outline"
            className="w-full justify-start"
          >
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileJson className="mr-2 h-4 w-4" />
            )}
            Individual JSON Files
          </Button>
          
          <Button
            onClick={() => handleDownload('comprehensive-json')}
            disabled={downloading}
            variant="outline"
            className="w-full justify-start"
          >
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Comprehensive JSON
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}