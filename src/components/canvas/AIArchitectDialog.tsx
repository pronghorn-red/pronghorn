import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, FileSearch } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useShareToken } from "@/hooks/useShareToken";
import { ProjectSelector, ProjectSelectionResult } from "@/components/project/ProjectSelector";
import { IterativeEnhancement } from "./IterativeEnhancement";

interface AIArchitectDialogProps {
  projectId: string;
  existingNodes: any[];
  existingEdges: any[];
  onArchitectureGenerated: (nodes: any[], edges: any[]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCanvasRefresh?: () => void;
}

export function AIArchitectDialog({ 
  projectId, 
  existingNodes, 
  existingEdges, 
  onArchitectureGenerated,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onCanvasRefresh,
}: AIArchitectDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;
  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCriticizing, setIsCriticizing] = useState(false);
  const [criticFeedback, setCriticFeedback] = useState("");
  const { toast } = useToast();
  const { token: shareToken } = useShareToken(projectId);
  
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
  const [selectedContext, setSelectedContext] = useState<ProjectSelectionResult | null>(null);
  const [drawEdges, setDrawEdges] = useState(true);
  
  const [projectData, setProjectData] = useState<any>(null);

  useEffect(() => {
    if (open && projectId) {
      loadProjectData();
    }
  }, [open, projectId]);

  const loadProjectData = async () => {
    try {
      const { data: project } = await supabase.rpc('get_project_with_token', {
        p_project_id: projectId,
        p_token: shareToken || null
      });
      setProjectData(project);
    } catch (error) {
      console.error('Error loading project data:', error);
    }
  };

  const handleGenerate = async (useCriticFeedback = false) => {
    const finalDescription = useCriticFeedback ? criticFeedback : description;
    
    const hasDescription = finalDescription.trim().length > 0;
    const hasContext = selectedContext && (
      selectedContext.projectMetadata ||
      selectedContext.artifacts.length > 0 ||
      selectedContext.chatSessions.length > 0 ||
      selectedContext.requirements.length > 0 ||
      selectedContext.standards.length > 0 ||
      selectedContext.techStacks.length > 0 ||
      selectedContext.canvasNodes.length > 0 ||
      selectedContext.canvasEdges.length > 0 ||
      selectedContext.canvasLayers.length > 0 ||
      (selectedContext.files?.length || 0) > 0 ||
      (selectedContext.databases?.length || 0) > 0
    );
    
    if (!hasDescription && !hasContext) {
      toast({
        title: "Input required",
        description: "Please provide an application description or select project context.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      console.log('Calling ai-architect function...');
      
      const context: any = {
        description: finalDescription,
        drawEdges,
        existingNodes: existingNodes.map(n => ({ data: n.data, position: n.position })),
        existingEdges: existingEdges.map(e => ({ 
          source: e.source, 
          target: e.target, 
          data: e.data 
        })),
        attachedContext: selectedContext || undefined,
      };

      const { data, error } = await supabase.functions.invoke('ai-architect', {
        body: context
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      console.log('Architecture generated:', data);

      if (!data.nodes || !Array.isArray(data.nodes)) {
        throw new Error('Invalid response format from AI');
      }

      // Process nodes and edges based on drawEdges setting
      const edgesToGenerate = drawEdges ? (data.edges || []) : [];
      onArchitectureGenerated(data.nodes, edgesToGenerate);
      
      toast({
        title: "Architecture generated!",
        description: `Created ${data.nodes.length} nodes and ${edgesToGenerate.length} connections.`,
      });

      if (!useCriticFeedback) {
        setOpen(false);
        setDescription("");
        // Trigger canvas refresh after closing
        if (onCanvasRefresh) {
          setTimeout(() => {
            onCanvasRefresh();
          }, 100);
        }
      }
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

  const handleCritic = async () => {
    setIsCriticizing(true);
    setCriticFeedback("");
    
    try {
      const context: any = {
        nodes: existingNodes.map(n => ({ data: n.data, position: n.position })),
        edges: existingEdges.map(e => ({ source: e.source, target: e.target, data: e.data })),
        attachedContext: selectedContext || undefined,
      };

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-architect-critic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(context),
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to start critic stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              setCriticFeedback(prev => prev + content);
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      toast({
        title: "Critique complete",
        description: "AI has analyzed your architecture and provided feedback.",
      });
    } catch (error) {
      console.error('Error getting critique:', error);
      toast({
        title: "Critique failed",
        description: error instanceof Error ? error.message : "Failed to get critique",
        variant: "destructive",
      });
    } finally {
      setIsCriticizing(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={(newOpen) => {
        setOpen(newOpen);
        // When closing after having generated, refresh canvas
        if (!newOpen && onCanvasRefresh) {
          setTimeout(() => {
            onCanvasRefresh();
          }, 100);
        }
      }}
    >
      <DialogContent className="max-w-[95vw] md:max-w-[90vw] h-[90vh] w-full flex flex-col p-3 md:p-6">
        <DialogHeader className="pb-2 md:pb-4">
          <DialogTitle className="text-base md:text-lg">AI Application Architect</DialogTitle>
          <DialogDescription className="text-xs md:text-sm">
            Generate and critique application architecture using AI
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="generate" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 shrink-0">
            <TabsTrigger value="generate" className="text-xs md:text-sm">Generate</TabsTrigger>
            <TabsTrigger value="critic" className="text-xs md:text-sm">Critic</TabsTrigger>
            <TabsTrigger value="iterative" className="text-xs md:text-sm">Iterative</TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="flex-1 flex flex-col md:flex-row gap-2 md:gap-4 min-h-0 data-[state=active]:flex data-[state=inactive]:hidden">
            <div className="w-full md:w-64 flex flex-col md:border-r md:pr-4 min-h-0">
              <div className="flex-1 overflow-y-auto space-y-2 md:space-y-4 min-h-0 max-h-32 md:max-h-none">
                <div className="space-y-1 md:space-y-2">
                  <h3 className="font-medium text-xs md:text-sm">Context Options</h3>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setIsProjectSelectorOpen(true)}
                    className="w-full justify-start text-xs"
                  >
                    <FileSearch className="h-3 w-3 mr-2" />
                    Select Project Elements
                  </Button>
                  
                  {selectedContext && (
                    <div className="text-xs text-muted-foreground space-y-1">
                      {selectedContext.projectMetadata && <p>✓ Project metadata</p>}
                      {selectedContext.artifacts.length > 0 && <p>✓ {selectedContext.artifacts.length} artifacts</p>}
                      {selectedContext.chatSessions.length > 0 && <p>✓ {selectedContext.chatSessions.length} chat sessions</p>}
                      {selectedContext.requirements.length > 0 && <p>✓ {selectedContext.requirements.length} requirements</p>}
                      {selectedContext.standards.length > 0 && <p>✓ {selectedContext.standards.length} standards</p>}
                      {selectedContext.techStacks.length > 0 && <p>✓ {selectedContext.techStacks.length} tech stacks</p>}
                      {selectedContext.canvasNodes.length > 0 && <p>✓ {selectedContext.canvasNodes.length} canvas nodes</p>}
                      {selectedContext.canvasEdges.length > 0 && <p>✓ {selectedContext.canvasEdges.length} canvas edges</p>}
                      {selectedContext.canvasLayers.length > 0 && <p>✓ {selectedContext.canvasLayers.length} canvas layers</p>}
                      {selectedContext.files?.length > 0 && <p>✓ {selectedContext.files.length} repository files</p>}
                      {selectedContext.databases?.length > 0 && <p>✓ {selectedContext.databases.length} database items</p>}
                    </div>
                  )}
                </div>

                <div className="space-y-1 md:space-y-2 pt-2 md:pt-4 border-t">
                  <h3 className="font-medium text-xs md:text-sm">Generation Options</h3>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="drawEdges" 
                      checked={drawEdges}
                      onCheckedChange={(checked) => setDrawEdges(checked as boolean)}
                    />
                    <label htmlFor="drawEdges" className="text-xs md:text-sm cursor-pointer">
                      Draw Edges
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto space-y-2 md:space-y-4 min-h-0">
                <div className="space-y-1 md:space-y-2">
                  <label htmlFor="description" className="text-xs md:text-sm font-medium">
                    Application Description
                  </label>
                  <Textarea
                    id="description"
                    placeholder="Example: A social media platform with user authentication, post creation, comments, real-time notifications, and image uploads. Users can follow each other and see a personalized feed."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="resize-none min-h-[200px] md:min-h-[400px] text-xs md:text-sm"
                  />
                </div>
                
                {existingNodes.length > 0 && (
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Note: {existingNodes.length} existing node(s) on canvas
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 md:pt-4 border-t shrink-0">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isGenerating} className="text-xs md:text-sm">
                  Cancel
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => handleGenerate(false)} 
                  disabled={isGenerating || (!description.trim() && !selectedContext)} 
                  className="text-xs md:text-sm"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin mr-1 md:mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                      Generate Architecture
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="critic" className="flex-1 flex flex-col md:flex-row gap-2 md:gap-4 min-h-0 data-[state=active]:flex data-[state=inactive]:hidden">
            <div className="w-full md:w-64 flex flex-col md:border-r md:pr-4 min-h-0">
              <div className="flex-1 overflow-y-auto space-y-2 md:space-y-4 min-h-0 max-h-32 md:max-h-none">
                <div className="space-y-1 md:space-y-2">
                  <h3 className="font-medium text-xs md:text-sm">Context Options</h3>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setIsProjectSelectorOpen(true)}
                    className="w-full justify-start text-xs"
                  >
                    <FileSearch className="h-3 w-3 mr-2" />
                    Select Project Elements
                  </Button>
                  
                  {selectedContext && (
                    <div className="text-xs text-muted-foreground space-y-1">
                      {selectedContext.projectMetadata && <p>✓ Project metadata</p>}
                      {selectedContext.artifacts.length > 0 && <p>✓ {selectedContext.artifacts.length} artifacts</p>}
                      {selectedContext.chatSessions.length > 0 && <p>✓ {selectedContext.chatSessions.length} chat sessions</p>}
                      {selectedContext.requirements.length > 0 && <p>✓ {selectedContext.requirements.length} requirements</p>}
                      {selectedContext.standards.length > 0 && <p>✓ {selectedContext.standards.length} standards</p>}
                      {selectedContext.techStacks.length > 0 && <p>✓ {selectedContext.techStacks.length} tech stacks</p>}
                      {selectedContext.canvasNodes.length > 0 && <p>✓ {selectedContext.canvasNodes.length} canvas nodes</p>}
                      {selectedContext.canvasEdges.length > 0 && <p>✓ {selectedContext.canvasEdges.length} canvas edges</p>}
                      {selectedContext.canvasLayers.length > 0 && <p>✓ {selectedContext.canvasLayers.length} canvas layers</p>}
                      {selectedContext.files?.length > 0 && <p>✓ {selectedContext.files.length} repository files</p>}
                      {selectedContext.databases?.length > 0 && <p>✓ {selectedContext.databases.length} database items</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <div className="mb-2 md:mb-4">
                <label className="text-xs md:text-sm font-medium">Architecture Critique</label>
              </div>
              <Textarea
                value={criticFeedback}
                readOnly
                placeholder="Click 'Run AI Critic' to analyze your current architecture and receive recommendations..."
                className="resize-none flex-1 min-h-0 text-xs md:text-sm"
              />

              <div className="flex justify-between gap-2 pt-2 md:pt-4 border-t shrink-0 mt-2 md:mt-4">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="text-xs md:text-sm">
                  Close
                </Button>
                <Button 
                  size="sm"
                  onClick={handleCritic} 
                  disabled={isCriticizing || existingNodes.length === 0 || isGenerating}
                  className="text-xs md:text-sm"
                >
                  {isCriticizing ? (
                    <>
                      <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin mr-1 md:mr-2" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <FileSearch className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                      Run AI Critic
                    </>
                  )}
                </Button>
                <Button 
                  size="sm"
                  onClick={() => handleGenerate(true)} 
                  disabled={!criticFeedback || isGenerating || isCriticizing}
                  className="text-xs md:text-sm"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin mr-1 md:mr-2" />
                      Refining...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                      Refine Architecture
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="iterative" className="flex-1 flex flex-col min-h-0 data-[state=active]:flex data-[state=inactive]:hidden">
            <IterativeEnhancement
              projectId={projectId}
              shareToken={shareToken}
              existingNodes={existingNodes}
              existingEdges={existingEdges}
              onArchitectureGenerated={onArchitectureGenerated}
              onCanvasRefresh={onCanvasRefresh}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
      
      <ProjectSelector
        projectId={projectId}
        shareToken={shareToken}
        open={isProjectSelectorOpen}
        onClose={() => setIsProjectSelectorOpen(false)}
        onConfirm={(selection) => {
          setSelectedContext(selection);
          toast({
            title: "Context attached",
            description: "Project elements attached to AI Architect",
          });
        }}
        initialSelection={selectedContext || undefined}
      />
    </Dialog>
  );
}