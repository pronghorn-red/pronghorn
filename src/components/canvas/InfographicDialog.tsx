import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { ProjectSelector, type ProjectSelectionResult } from "@/components/project/ProjectSelector";
import { Badge } from "@/components/ui/badge";

interface InfographicDialogProps {
  projectId: string;
  shareToken: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InfographicDialog({ projectId, shareToken, open, onOpenChange }: InfographicDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [selectedContent, setSelectedContent] = useState<ProjectSelectionResult | null>(null);

  const handleContentSelected = (selection: ProjectSelectionResult) => {
    setSelectedContent(selection);
    setShowProjectSelector(false);
  };

  const generateInfographic = async () => {
    if (!selectedContent) {
      toast.error("Please select content first");
      return;
    }

    setIsGenerating(true);
    setImageUrl(null);

    try {
      console.log('Generating infographic with selected content');
      
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          selectedContent
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.imageUrl) {
        setImageUrl(data.imageUrl);
        toast.success("Infographic generated successfully!");
      } else {
        throw new Error('No image URL returned');
      }
    } catch (error) {
      console.error('Error generating infographic:', error);
      toast.error(error instanceof Error ? error.message : "Failed to generate infographic");
    } finally {
      setIsGenerating(false);
    }
  };

  const getTotalSelectedCount = () => {
    if (!selectedContent) return 0;
    return (
      (selectedContent.projectMetadata ? 1 : 0) +
      selectedContent.artifacts.length +
      selectedContent.chatSessions.length +
      selectedContent.requirements.length +
      selectedContent.standards.length +
      selectedContent.techStacks.length +
      selectedContent.canvasNodes.length +
      selectedContent.canvasEdges.length +
      selectedContent.canvasLayers.length
    );
  };

  const downloadInfographic = () => {
    if (!imageUrl) return;

    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `infographic-${projectId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Infographic downloaded");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Infographic</DialogTitle>
          <DialogDescription>
            Generate a visual infographic of your project architecture, requirements, and components.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!imageUrl && !isGenerating && (
            <div className="space-y-4">
              {!selectedContent ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    Select the project content you want to include in your infographic.
                  </p>
                  <Button onClick={() => setShowProjectSelector(true)} size="lg">
                    <FileText className="w-4 h-4 mr-2" />
                    Select Content
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Selected Content</h4>
                      <Badge variant="secondary">{getTotalSelectedCount()} items</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      {selectedContent.projectMetadata && <div>• Project Info</div>}
                      {selectedContent.artifacts.length > 0 && <div>• {selectedContent.artifacts.length} Artifacts</div>}
                      {selectedContent.chatSessions.length > 0 && <div>• {selectedContent.chatSessions.length} Chats</div>}
                      {selectedContent.requirements.length > 0 && <div>• {selectedContent.requirements.length} Requirements</div>}
                      {selectedContent.standards.length > 0 && <div>• {selectedContent.standards.length} Standards</div>}
                      {selectedContent.techStacks.length > 0 && <div>• {selectedContent.techStacks.length} Tech Stacks</div>}
                      {selectedContent.canvasNodes.length > 0 && <div>• {selectedContent.canvasNodes.length} Canvas Nodes</div>}
                      {selectedContent.canvasEdges.length > 0 && <div>• {selectedContent.canvasEdges.length} Canvas Edges</div>}
                      {selectedContent.canvasLayers.length > 0 && <div>• {selectedContent.canvasLayers.length} Canvas Layers</div>}
                    </div>
                  </div>
                  <div className="flex justify-center gap-2">
                    <Button onClick={() => setShowProjectSelector(true)} variant="outline">
                      Change Selection
                    </Button>
                    <Button onClick={generateInfographic} size="lg">
                      Generate Infographic
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Generating your infographic... This may take a moment.
              </p>
            </div>
          )}

          {imageUrl && (
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden">
                <img 
                  src={imageUrl} 
                  alt="Project Infographic" 
                  className="w-full h-auto"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button onClick={generateInfographic} variant="outline">
                  Regenerate
                </Button>
                <Button onClick={downloadInfographic}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      <ProjectSelector
        projectId={projectId}
        shareToken={shareToken}
        open={showProjectSelector}
        onClose={() => setShowProjectSelector(false)}
        onConfirm={handleContentSelected}
      />
    </Dialog>
  );
}
