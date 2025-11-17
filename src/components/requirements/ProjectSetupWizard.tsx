import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

interface ProjectSetupWizardProps {
  open: boolean;
  onClose: () => void;
}

export function ProjectSetupWizard({ open, onClose }: ProjectSetupWizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Form state
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [organization, setOrganization] = useState("");
  const [budget, setBudget] = useState("");
  const [scope, setScope] = useState("");
  const [selectedStandards, setSelectedStandards] = useState<string[]>([]);
  const [selectedTechStacks, setSelectedTechStacks] = useState<string[]>([]);
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

  const handleNext = () => {
    if (step === 1 && !projectName.trim()) {
      toast({
        title: "Project name required",
        description: "Please enter a project name to continue",
        variant: "destructive"
      });
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => setStep(step - 1);

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

  const handleComplete = async () => {
    setLoading(true);
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

      // Create project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: projectName,
          description: projectDescription,
          organization,
          budget: budget ? parseFloat(budget) : null,
          scope,
          org_id: orgId,
          status: 'DESIGN'
        })
        .select()
        .single();

      if (projectError) throw projectError;

      // Link selected standard categories to project
      if (selectedStandards.length > 0) {
        // Get all standards from selected categories
        const { data: standardsData } = await supabase
          .from('standards')
          .select('id')
          .in('category_id', selectedStandards);

        if (standardsData && standardsData.length > 0) {
          // Create requirement_standards links for each
          const links = standardsData.map(std => ({
            requirement_id: project.id,
            standard_id: std.id
          }));
          
          await supabase.from('requirement_standards').insert(links);
        }
      }

      // Link selected tech stacks to project
      if (selectedTechStacks.length > 0) {
        const links = selectedTechStacks.map(tsId => ({
          project_id: project.id,
          tech_stack_id: tsId
        }));
        
        await supabase.from('project_tech_stacks').insert(links);
      }

      // If unstructured requirements provided, decompose them
      if (requirements.trim()) {
        const { data: decomposeData, error: decomposeError } = await supabase.functions.invoke(
          'decompose-requirements',
          {
            body: {
              text: requirements,
              projectId: project.id
            }
          }
        );

        if (decomposeError) {
          console.error('Decompose error:', decomposeError);
          toast({
            title: "Warning",
            description: "Project created but requirements decomposition failed. You can try again later.",
            variant: "destructive"
          });
        }
      }

      // Link selected standards (would need to fetch actual standard IDs)
      // Standards are now linked above via requirement_standards table
      
      toast({
        title: "Project created successfully",
        description: requirements.trim() 
          ? "Your requirements have been decomposed into a structured hierarchy"
          : "You can now add requirements to your project"
      });

      // Navigate to the new project's requirements page
      navigate(`/project/${project.id}/requirements`);
      onClose();
    } catch (error) {
      console.error('Setup wizard error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create project",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Project Setup Wizard - Step {step} of 4</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name *</Label>
              <Input
                id="projectName"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter project name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectDescription">Project Description</Label>
              <Textarea
                id="projectDescription"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Describe your project goals and scope"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              <Input
                id="organization"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="Your organization name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budget">Budget</Label>
                <Input
                  id="budget"
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="Project budget"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scope">Scope</Label>
                <Input
                  id="scope"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  placeholder="Project scope"
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-medium mb-3">Select Standard Categories</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Choose standard categories to include non-functional requirements
              </p>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {standardCategories.map((category) => (
                  <div key={category.id} className="flex items-start space-x-2">
                    <Checkbox
                      id={category.id}
                      checked={selectedStandards.includes(category.id)}
                      onCheckedChange={() => toggleStandard(category.id)}
                    />
                    <div className="flex-1">
                      <Label
                        htmlFor={category.id}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {category.name}
                      </Label>
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
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-medium mb-3">Select Tech Stacks</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Choose technology stacks for your project
              </p>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {techStacks.map((stack) => (
                  <div key={stack.id} className="flex items-start space-x-2">
                    <Checkbox
                      id={stack.id}
                      checked={selectedTechStacks.includes(stack.id)}
                      onCheckedChange={() => toggleTechStack(stack.id)}
                    />
                    <div className="flex-1">
                      <Label
                        htmlFor={stack.id}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {stack.name}
                      </Label>
                      {stack.description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {stack.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="requirements">Unstructured Requirements (Optional)</Label>
              <p className="text-sm text-muted-foreground">
                Paste any unstructured requirements, notes, or transcripts. Our AI will structure them into Epics, Features, and Stories.
              </p>
              <Textarea
                id="requirements"
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                placeholder="Paste requirements, notes, meeting transcripts, or any text describing what you want to build..."
                rows={12}
                className="font-mono text-sm"
              />
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 1 || loading}
          >
            Back
          </Button>
          <div className="flex gap-2">
            {step < 4 ? (
              <Button onClick={handleNext}>Next</Button>
            ) : (
              <Button onClick={handleComplete} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Project
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
