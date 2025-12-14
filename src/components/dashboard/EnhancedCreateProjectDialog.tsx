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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Plus, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { AnonymousProjectWarning } from "./AnonymousProjectWarning";
import { useAnonymousProjects } from "@/hooks/useAnonymousProjects";
import { StandardsTreeSelector } from "@/components/standards/StandardsTreeSelector";
import { TechStackTreeSelector } from "@/components/techstack/TechStackTreeSelector";

export function EnhancedCreateProjectDialog() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { addProject: addAnonymousProject } = useAnonymousProjects();
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [createdProject, setCreatedProject] = useState<{ id: string; shareToken: string } | null>(null);

  // Basic fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [organization, setOrganization] = useState("");
  
  // Metadata fields
  const [budget, setBudget] = useState("");
  const [scope, setScope] = useState("");
  const [timelineStart, setTimelineStart] = useState("");
  const [timelineEnd, setTimelineEnd] = useState("");
  const [priority, setPriority] = useState("medium");
  const [tags, setTags] = useState("");

  // Standards & Tech Stacks
  const [selectedStandards, setSelectedStandards] = useState<Set<string>>(new Set());
  const [selectedTechStacks, setSelectedTechStacks] = useState<Set<string>>(new Set());

  // AI fields
  const [requirements, setRequirements] = useState("");

  // Load standards with hierarchy
  const { data: standardCategories = [] } = useQuery({
    queryKey: ['standard-categories-with-hierarchy'],
    queryFn: async () => {
      const { data: categoriesData } = await supabase
        .from('standard_categories')
        .select('*')
        .order('order_index');

      const { data: standardsData } = await supabase
        .from('standards')
        .select('*')
        .order('order_index');

      const buildHierarchy = (flatStandards: any[]) => {
        const map = new Map();
        const roots: any[] = [];

        flatStandards.forEach((std) => {
          map.set(std.id, { ...std, children: [] });
        });

        flatStandards.forEach((std) => {
          const node = map.get(std.id);
          if (std.parent_id && map.has(std.parent_id)) {
            map.get(std.parent_id).children.push(node);
          } else {
            roots.push(node);
          }
        });

        return roots;
      };

      return (categoriesData || []).map((cat) => ({
        ...cat,
        standards: buildHierarchy(
          (standardsData || []).filter((s) => s.category_id === cat.id)
        ),
      }));
    },
    enabled: open
  });

  // Load all tech stacks with hierarchy in a single query (same pattern as standards)
  const { data: techStacks = [] } = useQuery({
    queryKey: ['tech-stacks-wizard-complete'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tech_stacks')
        .select('*')
        .order('order_index');
      if (error) throw error;
      
      // Build hierarchy - top-level stacks have parent_id = null
      const parentStacks = (data || []).filter(ts => !ts.parent_id);
      
      const buildItemsHierarchy = (parentId: string, allItems: any[]): any[] => {
        const children = allItems.filter(item => item.parent_id === parentId);
        return children.map(child => ({
          ...child,
          children: buildItemsHierarchy(child.id, allItems)
        }));
      };
      
      // Return parent stacks with their nested items
      return parentStacks.map(parent => ({
        ...parent,
        items: buildItemsHierarchy(parent.id, data || [])
      }));
    },
    enabled: open
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setOrganization("");
    setBudget("");
    setScope("");
    setTimelineStart("");
    setTimelineEnd("");
    setPriority("medium");
    setTags("");
    setRequirements("");
    setSelectedStandards(new Set());
    setSelectedTechStacks(new Set());
  };


  const handleSubmit = async () => {
    console.log("[EnhancedCreateProjectDialog] Submit started", { 
      isAnonymous: !user,
      hasAuth: !!user,
      projectName: name 
    });
    
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }

    setIsCreating(true);

    try {
      console.log("[EnhancedCreateProjectDialog] Getting organization");
      
      // Get or create default organization
      let { data: orgs } = await supabase.from('organizations').select('id').limit(1);
      
      let orgId: string;
      if (!orgs || orgs.length === 0) {
        console.log("[EnhancedCreateProjectDialog] Creating new organization");
        const { data: newOrg, error: orgError } = await supabase
          .from('organizations')
          .insert({ name: 'Default Organization' })
          .select('id')
          .single();
        
        if (orgError) {
          console.error("[EnhancedCreateProjectDialog] Org creation error:", orgError);
          throw orgError;
        }
        orgId = newOrg.id;
      } else {
        orgId = orgs[0].id;
      }

      console.log("[EnhancedCreateProjectDialog] Calling create-project edge function");

      // Use edge function to create project
      const { data: result, error: functionError } = await supabase.functions.invoke("create-project", {
        body: {
          projectData: {
            name: name.trim(),
            description: description.trim() || null,
            organization: organization.trim() || null,
            budget: budget ? parseFloat(budget) : null,
            scope: scope.trim() || null,
            timeline_start: timelineStart || null,
            timeline_end: timelineEnd || null,
            priority: priority,
            tags: tags ? tags.split(',').map(t => t.trim()) : null,
            org_id: orgId,
            status: 'DESIGN',
          },
          techStackIds: Array.from(selectedTechStacks),
          standardIds: Array.from(selectedStandards),
          requirementsText: requirements.trim() || null,
        }
      });

      if (functionError) {
        console.error("[EnhancedCreateProjectDialog] Edge function error:", functionError);
        throw functionError;
      }

      if (!result?.success) {
        console.error("[EnhancedCreateProjectDialog] Edge function returned error:", result?.error);
        throw new Error(result?.error || "Unknown error");
      }

      console.log("[EnhancedCreateProjectDialog] Project created:", result.project);

      const project = result.project;

      // For anonymous users, store in session storage
      if (!user && project.shareToken) {
        console.log("[EnhancedCreateProjectDialog] Storing anonymous project in session");
        addAnonymousProject({
          id: project.id,
          shareToken: project.shareToken,
          name: name.trim(),
          createdAt: new Date().toISOString(),
        });
      }

      toast.success(requirements.trim() 
        ? "Project created with AI-generated requirements!" 
        : "Project created successfully!"
      );

      setOpen(false);
      resetForm();
      
      // Invalidate projects query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      
      // If anonymous user, show warning modal with share link
      if (!user) {
        console.log("[EnhancedCreateProjectDialog] Showing anonymous warning with token:", project.shareToken);
        setCreatedProject({ id: project.id, shareToken: project.shareToken });
        setShowWarning(true);
      } else {
        // Navigate to the new project - always include token in URL for consistency
        console.log("[EnhancedCreateProjectDialog] Navigating authenticated user to project with token:", project.shareToken);
        navigate({ pathname: `/project/${project.id}/settings/t/${project.shareToken}` });
      }
    } catch (error) {
      console.error("[EnhancedCreateProjectDialog] Fatal error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create project");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="gap-2">
          <Plus className="h-4 w-4" />
          Create New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[90vw] h-[90vh] max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Set up a new project with detailed metadata and optional AI-powered requirements generation
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="basic" className="w-full flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="overflow-x-auto -mx-1 px-1 flex-shrink-0">
            <TabsList className="inline-flex w-auto min-w-full md:grid md:grid-cols-5 md:w-full">
              <TabsTrigger value="basic" className="shrink-0">Basic</TabsTrigger>
              <TabsTrigger value="metadata" className="shrink-0">Details</TabsTrigger>
              <TabsTrigger value="standards" className="shrink-0">Standards</TabsTrigger>
              <TabsTrigger value="techstacks" className="shrink-0 whitespace-nowrap">Tech Stacks</TabsTrigger>
              <TabsTrigger value="ai" className="shrink-0">
                <Sparkles className="h-3 w-3 mr-1" />
                AI
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 pr-4 mt-4">
            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name *</Label>
                <Input
                  id="name"
                  placeholder="Enterprise Portal"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of your project..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="organization">Organization</Label>
                <Input
                  id="organization"
                  placeholder="Acme Corp"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="metadata" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="budget">Budget ($)</Label>
                  <Input
                    id="budget"
                    type="number"
                    placeholder="100000"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scope">Scope</Label>
                <Textarea
                  id="scope"
                  placeholder="Project scope and boundaries..."
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="timeline-start">Timeline Start</Label>
                  <Input
                    id="timeline-start"
                    type="date"
                    value={timelineStart}
                    onChange={(e) => setTimelineStart(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timeline-end">Timeline End</Label>
                  <Input
                    id="timeline-end"
                    type="date"
                    value={timelineEnd}
                    onChange={(e) => setTimelineEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  placeholder="frontend, api, mobile"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="standards" className="space-y-4 data-[state=active]:flex-1">
              <div>
                <h3 className="font-semibold mb-3">Select Standards</h3>
                <div className="border rounded-lg p-4">
                  <StandardsTreeSelector
                    categories={standardCategories}
                    selectedStandards={selectedStandards}
                    onSelectionChange={setSelectedStandards}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="techstacks" className="space-y-4 data-[state=active]:flex-1">
              <div>
                <h3 className="font-semibold mb-3">Select Tech Stacks</h3>
                <div className="border rounded-lg p-4">
                  <TechStackTreeSelector
                    techStacks={techStacks}
                    selectedItems={selectedTechStacks}
                    onSelectionChange={setSelectedTechStacks}
                    preloadedItems={true}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="ai" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="requirements">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    <span>Requirements Text (Optional)</span>
                  </div>
                </Label>
                <Textarea
                  id="requirements"
                  placeholder="Paste your requirements document or describe your project needs here. AI will automatically break it down into structured requirements..."
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  rows={12}
                />
                <p className="text-xs text-muted-foreground">
                  If provided, AI will automatically decompose this text into structured epics, features, and stories.
                </p>
              </div>
            </TabsContent>
          </div>
        </Tabs>
        
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Project"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {createdProject && (
      <AnonymousProjectWarning
        open={showWarning}
        onClose={() => {
          setShowWarning(false);
          navigate({ pathname: `/project/${createdProject.id}/settings/t/${createdProject.shareToken}` });
        }}
        projectId={createdProject.id}
        shareToken={createdProject.shareToken}
      />
    )}
    </>
  );
}
