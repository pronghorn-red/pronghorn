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
}

export function AIArchitectDialog({ projectId, existingNodes, existingEdges, onArchitectureGenerated }: AIArchitectDialogProps) {
  const [open, setOpen] = useState(false);
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
  const [drawEdges, setDrawEdges] = useState(true);
  
  const [projectData, setProjectData] = useState<any>(null);
  const [standards, setStandards] = useState<any[]>([]);
  const [techStacks, setTechStacks] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);

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
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-architect-critic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nodes: existingNodes.map(n => ({ data: n.data, position: n.position })),
          edges: existingEdges.map(e => ({ source: e.source, target: e.target, data: e.data })),
        }),
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
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Sparkles className="h-4 w-4" />
          AI Architect
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[80vw] max-h-[80vh] w-full h-full">
        <DialogHeader>
          <DialogTitle>AI Application Architect</DialogTitle>
          <DialogDescription>
            Generate and critique application architecture using AI
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="generate" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="critic">Critic</TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="flex-1 flex gap-4 overflow-hidden h-full">
            <div className="w-64 flex flex-col border-r pr-4">
              <div className="flex-1 overflow-y-auto space-y-4">
                <div className="space-y-2">
                  <h3 className="font-medium text-sm">Context Options</h3>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="existingNodes" 
                      checked={includeExistingNodes}
                      onCheckedChange={(checked) => setIncludeExistingNodes(checked as boolean)}
                    />
                    <label htmlFor="existingNodes" className="text-sm cursor-pointer">
                      Include Existing Nodes
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="existingEdges" 
                      checked={includeExistingEdges}
                      onCheckedChange={(checked) => setIncludeExistingEdges(checked as boolean)}
                    />
                    <label htmlFor="existingEdges" className="text-sm cursor-pointer">
                      Include Existing Edges
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="standards" 
                      checked={includeStandards}
                      onCheckedChange={(checked) => setIncludeStandards(checked as boolean)}
                    />
                    <label htmlFor="standards" className="text-sm cursor-pointer">
                      Include Standards ({standards.length})
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="techStack" 
                      checked={includeTechStack}
                      onCheckedChange={(checked) => setIncludeTechStack(checked as boolean)}
                    />
                    <label htmlFor="techStack" className="text-sm cursor-pointer">
                      Include Tech Stack ({techStacks.length})
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="requirements" 
                      checked={includeRequirements}
                      onCheckedChange={(checked) => setIncludeRequirements(checked as boolean)}
                    />
                    <label htmlFor="requirements" className="text-sm cursor-pointer">
                      Include Requirements ({requirements.length})
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="projectDesc" 
                      checked={includeProjectDescription}
                      onCheckedChange={(checked) => setIncludeProjectDescription(checked as boolean)}
                    />
                    <label htmlFor="projectDesc" className="text-sm cursor-pointer">
                      Include Project Description
                    </label>
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t">
                  <h3 className="font-medium text-sm">Generation Options</h3>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="drawEdges" 
                      checked={drawEdges}
                      onCheckedChange={(checked) => setDrawEdges(checked as boolean)}
                    />
                    <label htmlFor="drawEdges" className="text-sm cursor-pointer">
                      Draw Edges
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col h-full">
              <div className="flex-1 overflow-y-auto space-y-4">
                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium">
                    Application Description
                  </label>
                  <Textarea
                    id="description"
                    placeholder="Example: A social media platform with user authentication, post creation, comments, real-time notifications, and image uploads. Users can follow each other and see a personalized feed."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="resize-none min-h-[400px]"
                  />
                </div>
                
                {existingNodes.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Note: {existingNodes.length} existing node(s) on canvas
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t mt-4">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={isGenerating}>
                  Cancel
                </Button>
                <Button onClick={() => handleGenerate(false)} disabled={isGenerating}>
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
            </div>
          </TabsContent>

          <TabsContent value="critic" className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-medium">Architecture Critique</label>
                <Button 
                  onClick={handleCritic} 
                  disabled={isCriticizing || existingNodes.length === 0}
                  size="sm"
                  variant="outline"
                >
                  {isCriticizing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <FileSearch className="h-4 w-4 mr-2" />
                      AI Critic
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                value={criticFeedback}
                readOnly
                placeholder="Click 'AI Critic' to analyze your current architecture and receive recommendations..."
                className="resize-none flex-1 min-h-0"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t mt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button 
                onClick={() => handleGenerate(true)} 
                disabled={!criticFeedback || isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Refining...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Refine Architecture
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}