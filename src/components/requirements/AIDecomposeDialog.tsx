import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, FileSearch, FileText, CheckSquare, Layers, Box, MessageSquare, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ProjectSelector, ProjectSelectionResult } from "@/components/project/ProjectSelector";

interface AIDecomposeDialogProps {
  projectId: string;
  shareToken?: string | null;
  open: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export function AIDecomposeDialog({ projectId, shareToken, open, onClose, onRefresh }: AIDecomposeDialogProps) {
  const [text, setText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
  const [selectedContext, setSelectedContext] = useState<ProjectSelectionResult | null>(null);

  const hasSelectedContext = selectedContext && (
    selectedContext.projectMetadata ||
    selectedContext.artifacts?.length ||
    selectedContext.requirements?.length ||
    selectedContext.standards?.length ||
    selectedContext.techStacks?.length ||
    selectedContext.canvasNodes?.length ||
    selectedContext.chatSessions?.length ||
    selectedContext.files?.length
  );

  const handleDecompose = async () => {
    if (!text.trim() && !hasSelectedContext) {
      toast.error("Please enter some text or select project context to decompose");
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
          shareToken,
          attachedContext: selectedContext
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
      
      // Refresh the requirements list to show new items
      if (onRefresh) {
        onRefresh();
      }
      
      onClose();
      setText("");
      setSelectedContext(null);
    } catch (error) {
      console.error("Error decomposing requirements:", error);
      toast.error(error instanceof Error ? error.message : "Failed to decompose requirements");
    } finally {
      setIsProcessing(false);
    }
  };

  const getContextSummary = () => {
    if (!selectedContext) return null;
    
    const counts = [];
    if (selectedContext.projectMetadata) counts.push("Project info");
    if (selectedContext.artifacts?.length) counts.push(`${selectedContext.artifacts.length} artifacts`);
    if (selectedContext.requirements?.length) counts.push(`${selectedContext.requirements.length} requirements`);
    if (selectedContext.standards?.length) counts.push(`${selectedContext.standards.length} standards`);
    if (selectedContext.techStacks?.length) counts.push(`${selectedContext.techStacks.length} tech stacks`);
    if (selectedContext.canvasNodes?.length) counts.push(`${selectedContext.canvasNodes.length} canvas nodes`);
    if (selectedContext.chatSessions?.length) counts.push(`${selectedContext.chatSessions.length} chats`);
    if (selectedContext.files?.length) counts.push(`${selectedContext.files.length} files`);
    
    return counts;
  };

  const contextSummary = getContextSummary();

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-[95vw] md:max-w-[90vw] h-[90vh] w-full flex flex-col p-3 md:p-6">
          <DialogHeader>
            <DialogTitle>AI Requirements Decomposition</DialogTitle>
            <DialogDescription>
              Paste unstructured text and let AI decompose it into a hierarchical structure of requirements
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden">
            {/* Side Menu */}
            <div className="w-full md:w-64 flex-shrink-0 space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Project Context</Label>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => setIsProjectSelectorOpen(true)}
                >
                  <FileSearch className="h-4 w-4" />
                  Select Project Elements
                </Button>
              </div>

              {contextSummary && contextSummary.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Selected Context</Label>
                  <div className="bg-muted/50 rounded-md p-3 space-y-2 text-sm">
                    {selectedContext?.projectMetadata && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Box className="h-3 w-3" />
                        <span>Project info</span>
                      </div>
                    )}
                    {selectedContext?.artifacts?.length ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        <span>{selectedContext.artifacts.length} artifacts</span>
                      </div>
                    ) : null}
                    {selectedContext?.requirements?.length ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CheckSquare className="h-3 w-3" />
                        <span>{selectedContext.requirements.length} requirements</span>
                      </div>
                    ) : null}
                    {selectedContext?.standards?.length ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Layers className="h-3 w-3" />
                        <span>{selectedContext.standards.length} standards</span>
                      </div>
                    ) : null}
                    {selectedContext?.techStacks?.length ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Box className="h-3 w-3" />
                        <span>{selectedContext.techStacks.length} tech stacks</span>
                      </div>
                    ) : null}
                    {selectedContext?.canvasNodes?.length ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Layers className="h-3 w-3" />
                        <span>{selectedContext.canvasNodes.length} canvas nodes</span>
                      </div>
                    ) : null}
                    {selectedContext?.chatSessions?.length ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MessageSquare className="h-3 w-3" />
                        <span>{selectedContext.chatSessions.length} chats</span>
                      </div>
                    ) : null}
                    {selectedContext?.files?.length ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <FolderOpen className="h-3 w-3" />
                        <span>{selectedContext.files.length} files</span>
                      </div>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => setSelectedContext(null)}
                  >
                    Clear Selection
                  </Button>
                </div>
              )}
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 space-y-2">
                <Label htmlFor="text">Requirements Text</Label>
                <Textarea
                  id="text"
                  placeholder="Paste your requirements document, meeting notes, or any unstructured text here..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="font-mono text-sm h-full min-h-[300px] resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Example: "Users should be able to log in with email and password. The system must validate email format and hash passwords using bcrypt..."
                </p>
              </div>
            </div>
          </div>
          
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={onClose} disabled={isProcessing}>
              Cancel
            </Button>
            <Button onClick={handleDecompose} disabled={isProcessing || (!text.trim() && !hasSelectedContext)}>
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

      <ProjectSelector
        projectId={projectId}
        shareToken={shareToken || null}
        open={isProjectSelectorOpen}
        onClose={() => setIsProjectSelectorOpen(false)}
        onConfirm={(selection) => {
          setSelectedContext(selection);
          setIsProjectSelectorOpen(false);
        }}
      />
    </>
  );
}
