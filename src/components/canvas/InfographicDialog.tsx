import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download } from "lucide-react";
import { toast } from "sonner";

interface InfographicDialogProps {
  projectId: string;
  shareToken: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InfographicDialog({ projectId, shareToken, open, onOpenChange }: InfographicDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const generateInfographic = async () => {
    if (!shareToken) {
      toast.error("Share token is required to generate infographic");
      return;
    }

    setIsGenerating(true);
    setImageUrl(null);

    try {
      console.log('Generating infographic for project:', projectId);
      
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { 
          projectId,
          shareToken
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
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Click the button below to generate a professional infographic based on your project's 
                architecture, requirements, and components.
              </p>
              <Button onClick={generateInfographic} size="lg">
                Generate Infographic
              </Button>
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
    </Dialog>
  );
}
