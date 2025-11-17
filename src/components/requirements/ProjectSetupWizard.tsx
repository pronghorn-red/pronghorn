import { useState } from "react";
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

interface ProjectSetupWizardProps {
  open: boolean;
  onClose: () => void;
}

const STANDARD_TEMPLATES = [
  { id: 'security', name: 'Security (OWASP, ISO 27001)', category: 'Security' },
  { id: 'accessibility', name: 'Accessibility (WCAG 2.1)', category: 'Accessibility' },
  { id: 'gdpr', name: 'Data Privacy (GDPR)', category: 'Privacy' },
  { id: 'performance', name: 'Performance Standards', category: 'Performance' },
  { id: 'usability', name: 'Usability (ISO 9241)', category: 'Usability' },
];

export function ProjectSetupWizard({ open, onClose }: ProjectSetupWizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Form state
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [selectedStandards, setSelectedStandards] = useState<string[]>([]);
  const [requirements, setRequirements] = useState("");

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

  const handleComplete = async () => {
    setLoading(true);
    try {
      // Get current user's org
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.org_id) throw new Error('No organization found');

      // Create project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: projectName,
          description: projectDescription,
          org_id: profile.org_id,
          status: 'DESIGN'
        })
        .select()
        .single();

      if (projectError) throw projectError;

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
        }
      }

      // Link selected standards (would need to fetch actual standard IDs)
      // This is a simplified version - in production, you'd fetch matching standards
      if (selectedStandards.length > 0) {
        toast({
          title: "Project created",
          description: `Standards templates selected: ${selectedStandards.length}. You can link specific standards from the Standards Library.`
        });
      }

      toast({
        title: "Project created successfully",
        description: "Your project has been initialized with requirements"
      });

      onClose();
      navigate(`/project/${project.id}/requirements`);
    } catch (error) {
      console.error('Setup error:', error);
      toast({
        title: "Setup failed",
        description: error.message,
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
          <DialogTitle>Project Setup Wizard - Step {step} of 3</DialogTitle>
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
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-medium mb-3">Select Standard Templates</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Choose common enterprise standards to include non-functional requirements
              </p>
              <div className="space-y-3">
                {STANDARD_TEMPLATES.map((standard) => (
                  <div key={standard.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={standard.id}
                      checked={selectedStandards.includes(standard.id)}
                      onCheckedChange={() => toggleStandard(standard.id)}
                    />
                    <Label
                      htmlFor={standard.id}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {standard.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
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
            {step < 3 ? (
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
