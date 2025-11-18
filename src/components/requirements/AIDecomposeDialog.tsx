import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface AIDecomposeDialogProps {
  projectId: string;
  shareToken?: string | null;
  open: boolean;
  onClose: () => void;
}

export function AIDecomposeDialog({ projectId, shareToken, open, onClose }: AIDecomposeDialogProps) {
  const [text, setText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDecompose = async () => {
    if (!text.trim()) {
      toast.error("Please enter some text to decompose");
      return;
    }

    if (!projectId) {
      toast.error("Project ID is missing");
      console.error("ProjectId is undefined or null");
      return;
    }

    console.log("Calling decompose-requirements with projectId:", projectId);
    setIsProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke("decompose-requirements", {
        body: { 
          text: text.trim(), 
          projectId: projectId,
          shareToken 
        },
      });

      if (error) {
        console.error("Edge function error:", error);
        throw error;
      }

      if (data.error) {
        console.error("Data error:", data.error);
        throw new Error(data.error);
      }

      toast.success(`Successfully created ${data.epicCount} epics with requirements!`);
      onClose();
      setText("");
    } catch (error) {
      console.error("Error decomposing requirements:", error);
      toast.error(error instanceof Error ? error.message : "Failed to decompose requirements");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>AI Requirements Decomposition</DialogTitle>
          <DialogDescription>
            Paste unstructured text and let AI decompose it into a hierarchical structure of requirements
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="text">Requirements Text</Label>
            <Textarea
              id="text"
              placeholder="Paste your requirements document, meeting notes, or any unstructured text here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Example: "Users should be able to log in with email and password. The system must validate email format and hash passwords using bcrypt..."
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleDecompose} disabled={isProcessing || !text.trim()}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Decomposing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Decompose
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
