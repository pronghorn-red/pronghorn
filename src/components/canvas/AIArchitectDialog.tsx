import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface AIArchitectDialogProps {
  projectId: string;
  existingNodes: any[];
  onArchitectureGenerated: (nodes: any[], edges: any[]) => void;
}

export function AIArchitectDialog({ projectId, existingNodes, onArchitectureGenerated }: AIArchitectDialogProps) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!description.trim()) {
      toast({
        title: "Description required",
        description: "Please describe the application you want to architect.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      console.log('Calling ai-architect function...');
      const { data, error } = await supabase.functions.invoke('ai-architect', {
        body: {
          description,
          existingNodes: existingNodes.map(n => ({ data: n.data })),
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      console.log('Architecture generated:', data);

      if (!data.nodes || !Array.isArray(data.nodes)) {
        throw new Error('Invalid response format from AI');
      }

      // Process nodes and edges
      onArchitectureGenerated(data.nodes, data.edges || []);
      
      toast({
        title: "Architecture generated!",
        description: `Created ${data.nodes.length} nodes and ${data.edges?.length || 0} connections.`,
      });

      setOpen(false);
      setDescription("");
    } catch (error) {
      console.error('Error generating architecture:', error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Failed to generate architecture",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Sparkles className="h-4 w-4" />
          AI Architect
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>AI Application Architect</DialogTitle>
          <DialogDescription>
            Describe your application and AI will generate a complete architecture with pages, components, APIs, databases, and services.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              Application Description
            </label>
            <Textarea
              id="description"
              placeholder="Example: A social media platform with user authentication, post creation, comments, real-time notifications, and image uploads. Users can follow each other and see a personalized feed."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              className="resize-none"
            />
          </div>
          {existingNodes.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Note: AI will add new nodes to your existing canvas with {existingNodes.length} node(s).
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isGenerating}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Architecture
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}