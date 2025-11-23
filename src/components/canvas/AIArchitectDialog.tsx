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

interface AIArchitectDialogProps {
  projectId: string;
  existingNodes: any[];
  existingEdges: any[];
  onArchitectureGenerated: (nodes: any[], edges: any[]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AIArchitectDialog({ 
  projectId, 
  existingNodes, 
  existingEdges, 
  onArchitectureGenerated,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange
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
  
  const [includeExistingNodes, setIncludeExistingNodes] = useState(true);
  const [includeExistingEdges, setIncludeExistingEdges] = useState(true);
  const [includeStandards, setIncludeStandards] = useState(false);
  const [includeTechStack, setIncludeTechStack] = useState(false);
  const [includeRequirements, setIncludeRequirements] = useState(false);
  const [includeProjectDescription, setIncludeProjectDescription] = useState(false);
  const [includeArtifacts, setIncludeArtifacts] = useState(false);
  const [drawEdges, setDrawEdges] = useState(true);
  
  const [projectData, setProjectData] = useState<any>(null);
  const [standards, setStandards] = useState<any[]>([]);
  const [techStacks, setTechStacks] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [selectedArtifacts, setSelectedArtifacts] = useState<string[]>([]);

  useEffect(() => {
    if (open && projectId) {
      loadProjectContext();
    }
  }, [open, projectId]);

  const loadProjectContext = async () => {
    try {
      // Load project details
      const { data: project } = await supabase.rpc('get_project_with_token', {
        p_project_id: projectId,
        p_token: shareToken || null
      });
      setProjectData(project);

      // Load standards
      const { data: projectStandards } = await supabase.rpc('get_project_standards_with_token', {
        p_project_id: projectId,
        p_token: shareToken || null
      });
      if (projectStandards) {
        const standardIds = projectStandards.map((ps: any) => ps.standard_id);
        const { data: standardsData } = await supabase
          .from('standards')
          .select('*')
          .in('id', standardIds);
        setStandards(standardsData || []);
      }

      // Load tech stacks
      const { data: projectTechStacks } = await supabase.rpc('get_project_tech_stacks_with_token', {
        p_project_id: projectId,
        p_token: shareToken || null
      });
      if (projectTechStacks) {
        const techStackIds = projectTechStacks.map((pts: any) => pts.tech_stack_id);
        const { data: techStacksData } = await supabase
          .from('tech_stacks')
          .select('*')
          .in('id', techStackIds);
        setTechStacks(techStacksData || []);
      }

      // Load requirements
      const { data: requirementsData } = await supabase.rpc('get_requirements_with_token', {
        p_project_id: projectId,
        p_token: shareToken || null
      });
      setRequirements(requirementsData || []);

      // Load artifacts
      const { data: artifactsData } = await supabase.rpc('get_artifacts_with_token', {
        p_project_id: projectId,
        p_token: shareToken || null
      });
      setArtifacts(artifactsData || []);
    } catch (error) {
      console.error('Error loading project context:', error);
    }
  };

  const handleGenerate = async (useCriticFeedback = false) => {
    const finalDescription = useCriticFeedback ? criticFeedback : description;
    
    if (!finalDescription.trim()) {
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
      
      const context: any = {
        description: finalDescription,
        drawEdges,
      };

      if (includeExistingNodes) {
        context.existingNodes = existingNodes.map(n => ({ data: n.data, position: n.position }));
      }

      if (includeExistingEdges) {
        context.existingEdges = existingEdges.map(e => ({ 
          source: e.source, 
          target: e.target, 
          data: e.data 
        }));
      }

      if (includeStandards && standards.length > 0) {
        context.standards = standards.map(s => ({ 
          title: s.title, 
          code: s.code, 
          description: s.description 
        }));
      }

      if (includeTechStack && techStacks.length > 0) {
        context.techStacks = techStacks.map(ts => ({ 
          name: ts.name, 
          description: ts.description 
        }));
      }

      if (includeRequirements && requirements.length > 0) {
        context.requirements = requirements.map(r => ({ 
          code: r.code, 
          title: r.title, 
          type: r.type, 
          content: r.content 
        }));
      }

      if (includeProjectDescription && projectData?.description) {
        context.projectDescription = projectData.description;
      }

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
      };

      if (includeStandards && standards.length > 0) {
        context.standards = standards.map(s => ({ 
          title: s.title, 
          code: s.code, 
          description: s.description 
        }));
      }

      if (includeTechStack && techStacks.length > 0) {
        context.techStacks = techStacks.map(ts => ({ 
          name: ts.name, 
          description: ts.description 
        }));
      }

      if (includeRequirements && requirements.length > 0) {
        context.requirements = requirements.map(r => ({ 
          code: r.code, 
          title: r.title, 
          type: r.type, 
          content: r.content 
        }));
      }

      if (includeProjectDescription && projectData?.description) {
        context.projectDescription = projectData.description;
      }

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[95vw] md:max-w-[80vw] h-[90vh] md:h-[80vh] w-full flex flex-col p-3 md:p-6">
        <DialogHeader className="pb-2 md:pb-4">
          <DialogTitle className="text-base md:text-lg">AI Application Architect</DialogTitle>
          <DialogDescription className="text-xs md:text-sm">
            Generate and critique application architecture using AI
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="generate" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2 shrink-0">
            <TabsTrigger value="generate" className="text-xs md:text-sm">Generate</TabsTrigger>
            <TabsTrigger value="critic" className="text-xs md:text-sm">Critic</TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="flex-1 flex flex-col md:flex-row gap-2 md:gap-4 min-h-0 data-[state=active]:flex data-[state=inactive]:hidden">
            <div className="w-full md:w-64 flex flex-col md:border-r md:pr-4 min-h-0">
              <div className="flex-1 overflow-y-auto space-y-2 md:space-y-4 min-h-0 max-h-32 md:max-h-none">
                <div className="space-y-1 md:space-y-2">
                  <h3 className="font-medium text-xs md:text-sm">Context Options</h3>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="existingNodes" 
                      checked={includeExistingNodes}
                      onCheckedChange={(checked) => setIncludeExistingNodes(checked as boolean)}
                    />
                    <label htmlFor="existingNodes" className="text-xs md:text-sm cursor-pointer">
                      Include Existing Nodes
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="existingEdges" 
                      checked={includeExistingEdges}
                      onCheckedChange={(checked) => setIncludeExistingEdges(checked as boolean)}
                    />
                    <label htmlFor="existingEdges" className="text-xs md:text-sm cursor-pointer">
                      Include Existing Edges
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="standards" 
                      checked={includeStandards}
                      onCheckedChange={(checked) => setIncludeStandards(checked as boolean)}
                    />
                    <label htmlFor="standards" className="text-xs md:text-sm cursor-pointer">
                      Include Standards ({standards.length})
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="techStack" 
                      checked={includeTechStack}
                      onCheckedChange={(checked) => setIncludeTechStack(checked as boolean)}
                    />
                    <label htmlFor="techStack" className="text-xs md:text-sm cursor-pointer">
                      Include Tech Stack ({techStacks.length})
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="requirements" 
                      checked={includeRequirements}
                      onCheckedChange={(checked) => setIncludeRequirements(checked as boolean)}
                    />
                    <label htmlFor="requirements" className="text-xs md:text-sm cursor-pointer">
                      Include Requirements ({requirements.length})
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="projectDesc" 
                      checked={includeProjectDescription}
                      onCheckedChange={(checked) => setIncludeProjectDescription(checked as boolean)}
                    />
                    <label htmlFor="projectDesc" className="text-xs md:text-sm cursor-pointer">
                      Include Project Description
                    </label>
                  </div>
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
                <Button size="sm" onClick={() => handleGenerate(false)} disabled={isGenerating} className="text-xs md:text-sm">
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
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="critic-standards" 
                      checked={includeStandards}
                      onCheckedChange={(checked) => setIncludeStandards(checked as boolean)}
                    />
                    <label htmlFor="critic-standards" className="text-xs md:text-sm cursor-pointer">
                      Include Standards ({standards.length})
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="critic-techStack" 
                      checked={includeTechStack}
                      onCheckedChange={(checked) => setIncludeTechStack(checked as boolean)}
                    />
                    <label htmlFor="critic-techStack" className="text-xs md:text-sm cursor-pointer">
                      Include Tech Stack ({techStacks.length})
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="critic-requirements" 
                      checked={includeRequirements}
                      onCheckedChange={(checked) => setIncludeRequirements(checked as boolean)}
                    />
                    <label htmlFor="critic-requirements" className="text-xs md:text-sm cursor-pointer">
                      Include Requirements ({requirements.length})
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="critic-projectDesc" 
                      checked={includeProjectDescription}
                      onCheckedChange={(checked) => setIncludeProjectDescription(checked as boolean)}
                    />
                    <label htmlFor="critic-projectDesc" className="text-xs md:text-sm cursor-pointer">
                      Include Project Description
                    </label>
                  </div>
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
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}