import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { type ProjectSelectionResult } from "@/components/project/ProjectSelector";

interface CompletedAgentResult {
  agentId: string;
  agentTitle: string;
  content: string;
  contentLength: number;
  version?: number;
}

interface DownloadOptionsProps {
  projectId: string;
  projectName: string;
  shareToken: string | null;
  hasGeneratedSpec: boolean;
  selectedContent: ProjectSelectionResult | null;
  agentResults?: CompletedAgentResult[];
}

export function DownloadOptions({ projectId, projectName, shareToken, hasGeneratedSpec, selectedContent, agentResults = [] }: DownloadOptionsProps) {
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
      // Use selected content if available, otherwise fetch all data
      let data;
      if (selectedContent) {
        // Convert selected content to fetchProjectData format
        data = {
          project: selectedContent.projectMetadata,
          requirements: selectedContent.requirements,
          canvasNodes: selectedContent.canvasNodes,
          canvasEdges: selectedContent.canvasEdges,
          canvasLayers: selectedContent.canvasLayers,
          artifacts: selectedContent.artifacts,
          chatSessions: selectedContent.chatSessions.map(chat => ({
            ...chat,
            messages: [] // Messages will be fetched if needed
          })),
          projectStandards: selectedContent.standards,
          techStacks: selectedContent.techStacks
        };
      } else {
        data = await fetchProjectData(projectId, shareToken);
      }
      
      let canvasPNG: Blob | undefined;
      if (options.includeCanvas) {
        canvasPNG = await captureCanvasPNG();
      }

      switch (format) {
        case 'zip':
          await downloadAsZip(data, options, projectName, canvasPNG, agentResults);
          toast.success('ZIP file downloaded successfully!');
          break;

        case 'markdown':
          let markdown = buildMarkdownDocument(data, options);
          
          // Append AI Analysis results if available
          if (agentResults.length > 0) {
            markdown += '\n\n' + '='.repeat(80) + '\n';
            markdown += '# AI Analysis\n';
            markdown += '='.repeat(80) + '\n\n';
            agentResults.forEach((result, index) => {
              const versionLabel = result.version ? ` (v${result.version})` : '';
              markdown += `## ${result.agentTitle}${versionLabel}\n\n`;
              markdown += result.content + '\n\n';
              if (index < agentResults.length - 1) {
                markdown += '\n---\n\n';
              }
            });
          }
          
          downloadAsMarkdown(markdown, projectName);
          toast.success('Markdown file downloaded successfully!');
          break;

        case 'individual-json':
          const jsons = buildIndividualJSONs(data, options, agentResults);
          for (const [fileName, content] of Object.entries(jsons)) {
            downloadAsJSON(content, `${projectName}-${fileName}`);
          }
          toast.success('JSON files downloaded successfully!');
          break;

        case 'comprehensive-json':
          const comprehensive = buildComprehensiveJSON(data, options, agentResults);
          
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
    <>
      <div className="space-y-6">
        {/* Download buttons */}
        <div className="space-y-2">
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
    </div>
  </>
  );
}