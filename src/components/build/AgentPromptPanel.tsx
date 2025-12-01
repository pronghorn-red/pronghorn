import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { X, Send, Loader2, Plus, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ProjectSelector, type ProjectSelectionResult } from "@/components/project/ProjectSelector";

interface AttachedFile {
  id: string;
  path: string;
}

interface AgentPromptPanelProps {
  attachedFiles: AttachedFile[];
  onRemoveFile: (fileId: string) => void;
  onSubmitTask: (sessionId: string) => void;
  projectId: string;
  shareToken: string | null;
}

export function AgentPromptPanel({
  attachedFiles,
  onRemoveFile,
  onSubmitTask,
  projectId,
  shareToken,
}: AgentPromptPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoCommit, setAutoCommit] = useState(false);
  const [showContextSelector, setShowContextSelector] = useState(false);
  const [attachedContext, setAttachedContext] = useState<ProjectSelectionResult | null>(null);
  const { toast } = useToast();

  const handleContextConfirm = (selection: ProjectSelectionResult) => {
    setAttachedContext(selection);
    toast({
      title: "Context Attached",
      description: "Project context added to agent prompt",
    });
  };

  const handleRemoveContext = () => {
    setAttachedContext(null);
  };

  const getContextSummary = () => {
    if (!attachedContext) return null;
    
    const counts = [
      attachedContext.projectMetadata ? "Metadata" : null,
      attachedContext.artifacts.length > 0 ? `${attachedContext.artifacts.length} Artifacts` : null,
      attachedContext.chatSessions.length > 0 ? `${attachedContext.chatSessions.length} Chats` : null,
      attachedContext.requirements.length > 0 ? `${attachedContext.requirements.length} Requirements` : null,
      attachedContext.standards.length > 0 ? `${attachedContext.standards.length} Standards` : null,
      attachedContext.techStacks.length > 0 ? `${attachedContext.techStacks.length} Tech Stacks` : null,
      attachedContext.canvasNodes.length > 0 ? `${attachedContext.canvasNodes.length} Nodes` : null,
      attachedContext.canvasEdges.length > 0 ? `${attachedContext.canvasEdges.length} Edges` : null,
      attachedContext.canvasLayers.length > 0 ? `${attachedContext.canvasLayers.length} Layers` : null,
    ].filter(Boolean);
    
    return counts.join(", ");
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("coding-agent-orchestrator", {
        body: {
          projectId,
          taskDescription: prompt,
          attachedFileIds: attachedFiles.map(f => f.id),
          projectContext: attachedContext || {},
          shareToken,
          mode: "edit",
          autoCommit,
        },
      });

      if (error) throw error;

      toast({
        title: "Task Submitted",
        description: "CodingAgent is processing your request",
      });

      onSubmitTask(data.sessionId);
      setPrompt("");
    } catch (error) {
      console.error("Error submitting task:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit task",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader>
          <CardTitle className="text-sm">Agent Task</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-3 overflow-auto">
          {/* Attached Files */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Attached Files ({attachedFiles.length})
            </label>
            <ScrollArea className="h-20 border rounded-md p-2">
              <div className="flex flex-wrap gap-1">
                {attachedFiles.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No files attached. Select files from the file tree.
                  </p>
                ) : (
                  attachedFiles.map((file) => (
                    <Badge
                      key={file.id}
                      variant="secondary"
                      className="gap-1 pr-1"
                    >
                      <span className="text-xs truncate max-w-[150px]">
                        {file.path}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0"
                        onClick={() => onRemoveFile(file.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <Separator />

          {/* Project Context */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">
                Project Context
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowContextSelector(true)}
                className="h-6 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Context
              </Button>
            </div>
            {attachedContext && getContextSummary() ? (
              <div className="border rounded-md p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">Context Attached</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {getContextSummary()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveContext}
                    className="h-6 w-6 p-0 shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic border rounded-md p-2">
                No context attached. Add requirements, standards, canvas, etc.
              </p>
            )}
          </div>

          <Separator />

          {/* Auto-commit Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-commit" className="text-xs font-medium">
                Auto-commit Changes
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically commit agent changes without review
              </p>
            </div>
            <Switch
              id="auto-commit"
              checked={autoCommit}
              onCheckedChange={setAutoCommit}
            />
          </div>

          <Separator />

          {/* Task Input */}
          <div className="flex-1 flex flex-col min-h-[120px]">
            <label className="text-xs text-muted-foreground mb-1">
              Task Description
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want the CodingAgent to do..."
              className="flex-1 resize-none"
            />
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={!prompt.trim() || isSubmitting}
            className="w-full gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Submit Task
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Project Context Selector */}
      <ProjectSelector
        projectId={projectId}
        shareToken={shareToken}
        open={showContextSelector}
        onClose={() => setShowContextSelector(false)}
        onConfirm={handleContextConfirm}
        initialSelection={attachedContext || undefined}
      />
    </>
  );
}
