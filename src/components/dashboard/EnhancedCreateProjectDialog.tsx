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
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { AnonymousProjectWarning } from "./AnonymousProjectWarning";

export function EnhancedCreateProjectDialog() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
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
  const [selectedStandards, setSelectedStandards] = useState<string[]>([]);
  const [selectedTechStacks, setSelectedTechStacks] = useState<string[]>([]);

  // AI fields
  const [requirements, setRequirements] = useState("");

  // Load real standards from database
  const { data: standardCategories = [] } = useQuery({
    queryKey: ['standard-categories-wizard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('standard_categories')
        .select('id, name, description')
        .order('order_index');
      if (error) throw error;
      return data;
    },
    enabled: open
  });

  // Load real tech stacks from database
  const { data: techStacks = [] } = useQuery({
    queryKey: ['tech-stacks-wizard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tech_stacks')
        .select('id, name, description')
        .order('name');
      if (error) throw error;
      return data;
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
    setSelectedStandards([]);
    setSelectedTechStacks([]);
  };

  const toggleStandard = (standardId: string) => {
    setSelectedStandards(prev =>
      prev.includes(standardId)
        ? prev.filter(id => id !== standardId)
        : [...prev, standardId]
    );
  };

  const toggleTechStack = (techStackId: string) => {
    setSelectedTechStacks(prev =>
      prev.includes(techStackId)
        ? prev.filter(id => id !== techStackId)
        : [...prev, techStackId]
    );
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }

    setIsCreating(true);

    try {
      // Get or create default organization
      let { data: orgs } = await supabase.from('organizations').select('id').limit(1);
      
      let orgId: string;
      if (!orgs || orgs.length === 0) {
        const { data: newOrg, error: orgError } = await supabase
          .from('organizations')
          .insert({ name: 'Default Organization' })
          .select('id')
          .single();
        
        if (orgError) throw orgError;
        orgId = newOrg.id;
      } else {
        orgId = orgs[0].id;
      }

      const { data: project, error } = await supabase
        .from('projects')
        .insert({
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
          created_by: user?.id || null
        })
        .select('id, share_token')
        .single();

      if (error) throw error;

      // Link selected tech stacks
      if (selectedTechStacks.length > 0) {
        const techStackLinks = selectedTechStacks.map(techStackId => ({
          project_id: project.id,
          tech_stack_id: techStackId
        }));
        
        const { error: techStackError } = await supabase
          .from('project_tech_stacks')
          .insert(techStackLinks);
        
        if (techStackError) {
          console.error("Error linking tech stacks:", techStackError);
        }
      }

      if (requirements.trim()) {
        const { error: aiError } = await supabase.functions.invoke("decompose-requirements", {
          body: { 
            text: requirements.trim(), 
            projectId: project.id,
            shareToken: project.share_token 
          },
        });

        if (aiError) {
          console.error("AI decomposition error:", aiError);
          toast.warning("Project created but AI decomposition failed. You can try again later.");
        } else {
          toast.success("Project created with AI-generated requirements!");
        }
      } else {
        toast.success("Project created successfully!");
      }

      setOpen(false);
      resetForm();
      
      // Invalidate projects query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      
      // If anonymous user, show warning modal with share link
      if (!user) {
        setCreatedProject({ id: project.id, shareToken: project.share_token });
        setShowWarning(true);
      } else {
        // Navigate to the new project
        navigate(`/project/${project.id}/requirements`);
      }
    } catch (error) {
      console.error("Error creating project:", error);
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
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Set up a new project with detailed metadata and optional AI-powered requirements generation
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="basic" className="w-full flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="metadata">Details</TabsTrigger>
            <TabsTrigger value="standards">Standards</TabsTrigger>
            <TabsTrigger value="ai">
              <Sparkles className="h-3 w-3 mr-1" />
              AI
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 pr-4">
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

            <TabsContent value="standards" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-3">Select Standards</h3>
                  <div className="space-y-2">
                    {standardCategories.map((category) => (
                      <div key={category.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50">
                        <Checkbox
                          id={`standard-${category.id}`}
                          checked={selectedStandards.includes(category.id)}
                          onCheckedChange={() => toggleStandard(category.id)}
                        />
                        <div className="flex-1">
                          <label
                            htmlFor={`standard-${category.id}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {category.name}
                          </label>
                          {category.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {category.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Select Tech Stacks</h3>
                  <div className="space-y-2">
                    {techStacks.map((techStack) => (
                      <div key={techStack.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50">
                        <Checkbox
                          id={`tech-${techStack.id}`}
                          checked={selectedTechStacks.includes(techStack.id)}
                          onCheckedChange={() => toggleTechStack(techStack.id)}
                        />
                        <div className="flex-1">
                          <label
                            htmlFor={`tech-${techStack.id}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {techStack.name}
                          </label>
                          {techStack.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {techStack.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
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
          </ScrollArea>
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
          navigate(`/project/${createdProject.id}/requirements?token=${createdProject.shareToken}`);
        }}
        projectId={createdProject.id}
        shareToken={createdProject.shareToken}
      />
    )}
    </>
  );
}
