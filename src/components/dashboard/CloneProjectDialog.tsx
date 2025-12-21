import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

interface CloneProjectDialogProps {
  projectId: string;
  projectName: string;
  shareToken?: string;
  trigger?: React.ReactNode;
}

interface CloneOptions {
  cloneChat: boolean;
  cloneArtifacts: boolean;
  cloneRequirements: boolean;
  cloneStandards: boolean;
  cloneSpecifications: boolean;
  cloneCanvas: boolean;
  cloneRepoFiles: boolean;
  cloneRepoStaging: boolean;
}

export function CloneProjectDialog({ 
  projectId, 
  projectName, 
  shareToken,
  trigger 
}: CloneProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState(`Copy of ${projectName}`);
  const [isCloning, setIsCloning] = useState(false);
  const [options, setOptions] = useState<CloneOptions>({
    cloneChat: false,
    cloneArtifacts: false,
    cloneRequirements: true,
    cloneStandards: true,
    cloneSpecifications: false,
    cloneCanvas: true,
    cloneRepoFiles: false,
    cloneRepoStaging: false,
  });
  
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleOptionChange = (key: keyof CloneOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleClone = async () => {
    if (!newName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for the cloned project.",
        variant: "destructive",
      });
      return;
    }

    setIsCloning(true);

    try {
      const { data, error } = await supabase.functions.invoke("clone-project", {
        body: {
          sourceProjectId: projectId,
          shareToken: shareToken || null,
          newName: newName.trim(),
          ...options,
        },
      });

      if (error) throw error;

      if (!data?.success || !data?.project) {
        throw new Error(data?.error || "Failed to clone project");
      }

      toast({
        title: "Project cloned!",
        description: `"${newName}" has been created successfully.`,
      });

      // Invalidate queries to refresh the dashboard
      queryClient.invalidateQueries({ queryKey: ["user-projects"] });

      setOpen(false);

      // Navigate to the new project
      navigate(`/project/${data.project.id}/requirements/t/${data.project.shareToken}`);
    } catch (error) {
      console.error("Clone error:", error);
      toast({
        title: "Clone failed",
        description: error instanceof Error ? error.message : "Failed to clone project",
        variant: "destructive",
      });
    } finally {
      setIsCloning(false);
    }
  };

  const optionItems: { key: keyof CloneOptions; label: string; description: string }[] = [
    { key: "cloneRequirements", label: "Requirements", description: "Copy the entire requirements tree" },
    { key: "cloneStandards", label: "Standards", description: "Copy linked standards" },
    { key: "cloneCanvas", label: "Canvas", description: "Copy all nodes, edges, and layers" },
    { key: "cloneSpecifications", label: "Specifications", description: "Copy generated specifications" },
    { key: "cloneChat", label: "Chat Sessions", description: "Copy all chat history" },
    { key: "cloneArtifacts", label: "Artifacts", description: "Copy uploaded artifacts" },
    { key: "cloneRepoFiles", label: "Repository Files", description: "Copy committed files" },
    { key: "cloneRepoStaging", label: "Staging Changes", description: "Copy uncommitted changes" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" title="Clone project">
            <Copy className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Clone Project</DialogTitle>
          <DialogDescription>
            Create a copy of "{projectName}" with selected components.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="new-name">New Project Name</Label>
            <Input
              id="new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter project name"
            />
          </div>

          <div className="space-y-3">
            <Label>What to clone</Label>
            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-2">
              {optionItems.map(({ key, label, description }) => (
                <div 
                  key={key}
                  className="flex items-start space-x-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    id={key}
                    checked={options[key]}
                    onCheckedChange={() => handleOptionChange(key)}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <label
                      htmlFor={key}
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      {label}
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isCloning}>
            Cancel
          </Button>
          <Button onClick={handleClone} disabled={isCloning}>
            {isCloning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cloning...
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Clone Project
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
